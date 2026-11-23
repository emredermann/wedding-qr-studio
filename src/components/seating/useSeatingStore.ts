"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/client/api";
import { emptyPlan, type SeatingPlan, type SeatingPlanDto } from "@/lib/seating/schema";

/**
 * Seating plan state for one event: undo/redo history, gestures and
 * debounced autosave with optimistic concurrency (the server rejects a save
 * whose version is stale with 409).
 *
 * - `apply(fn)`   one undoable step.
 * - `begin()` → `live(fn)`… → `end()`   a gesture (drag, rotate, resize):
 *   many updates, one undo step, saved once it ends.
 */

const HISTORY_LIMIT = 100;
const SAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 5000;

export type LoadState = "loading" | "ready" | "error" | "unavailable";
export type SaveState = "saved" | "pending" | "saving" | "error" | "conflict";

interface History {
  past: SeatingPlan[];
  present: SeatingPlan;
  future: SeatingPlan[];
  /** Snapshot taken when a gesture began; null outside gestures. */
  gestureBase: SeatingPlan | null;
}

type Action =
  | { type: "reset"; plan: SeatingPlan }
  | { type: "apply"; fn: (p: SeatingPlan) => SeatingPlan }
  | { type: "live"; fn: (p: SeatingPlan) => SeatingPlan }
  | { type: "begin" }
  | { type: "end" }
  | { type: "undo" }
  | { type: "redo" };

function reducer(state: History, action: Action): History {
  switch (action.type) {
    case "reset":
      return { past: [], present: action.plan, future: [], gestureBase: null };
    case "apply": {
      const next = action.fn(state.present);
      if (next === state.present) return state;
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: next, future: [], gestureBase: null };
    }
    case "live": {
      const next = action.fn(state.present);
      return next === state.present ? state : { ...state, present: next };
    }
    case "begin":
      return state.gestureBase ? state : { ...state, gestureBase: state.present };
    case "end": {
      const base = state.gestureBase;
      if (!base) return state;
      if (base === state.present) return { ...state, gestureBase: null };
      return { past: [...state.past, base].slice(-HISTORY_LIMIT), present: state.present, future: [], gestureBase: null };
    }
    case "undo": {
      if (state.gestureBase || state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], gestureBase: null };
    }
    case "redo": {
      if (state.gestureBase || state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: next, future: rest, gestureBase: null };
    }
  }
}

export function useSeatingStore(eventId: string) {
  const [history, dispatch] = useReducer(reducer, { past: [], present: emptyPlan(), future: [], gestureBase: null });
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The plan the server has; reference equality with `present` means nothing to save. */
  const [savedPlan, setSavedPlan] = useState<SeatingPlan | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [failure, setFailure] = useState<"error" | "conflict" | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const url = `/api/host/events/${eventId}/seating`;
  const version = useRef(0);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(history);
  useEffect(() => {
    latest.current = history;
  });

  const [loadKey, setLoadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dto = await apiFetch<SeatingPlanDto>(url);
        if (cancelled) return;
        version.current = dto.version;
        setSavedPlan(dto.plan);
        setSavedAt(dto.updatedAt);
        setFailure(null);
        dispatch({ type: "reset", plan: dto.plan });
        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setLoadState(error instanceof ApiError && error.code === "SEATING_NOT_SET_UP" ? "unavailable" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, loadKey]);

  /** Reload from the server (after a conflict or an error); discards local history. */
  const reload = useCallback(() => {
    setLoadState("loading");
    setLoadError(null);
    setLoadKey((n) => n + 1);
  }, []);

  const save = useCallback(async () => {
    const { present, gestureBase } = latest.current;
    if (saving.current || gestureBase) return;
    saving.current = true;
    setInFlight(true);
    try {
      const res = await apiFetch<{ version: number; updatedAt: string }>(url, { method: "PUT", json: { version: version.current, plan: present } });
      version.current = res.version;
      setSavedPlan(present);
      setSavedAt(res.updatedAt);
      setFailure(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFailure("conflict");
      } else {
        setFailure("error");
        timer.current = setTimeout(() => setRetryTick((n) => n + 1), RETRY_DELAY_MS);
      }
    } finally {
      saving.current = false;
      setInFlight(false);
    }
  }, [url]);

  const dirty = loadState === "ready" && savedPlan !== null && history.present !== savedPlan;

  // Debounced autosave whenever the plan changes outside a gesture (and after a failed save).
  useEffect(() => {
    if (!dirty || history.gestureBase || failure === "conflict" || inFlight) return;
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [dirty, history.present, history.gestureBase, failure, inFlight, retryTick, save]);

  const saveState: SaveState = failure === "conflict" ? "conflict" : inFlight ? "saving" : failure === "error" ? "error" : dirty ? "pending" : "saved";

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  return {
    plan: history.present,
    canUndo: history.past.length > 0 && !history.gestureBase,
    canRedo: history.future.length > 0 && !history.gestureBase,
    loadState,
    loadError,
    saveState,
    savedAt,
    reload,
    retrySave: save,
    apply: useCallback((fn: (p: SeatingPlan) => SeatingPlan) => dispatch({ type: "apply", fn }), []),
    live: useCallback((fn: (p: SeatingPlan) => SeatingPlan) => dispatch({ type: "live", fn }), []),
    begin: useCallback(() => dispatch({ type: "begin" }), []),
    end: useCallback(() => dispatch({ type: "end" }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
  };
}

export type SeatingStore = ReturnType<typeof useSeatingStore>;
