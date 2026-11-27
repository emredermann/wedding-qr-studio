"use client";

import {
  AlertTriangle,
  Armchair,
  ChevronDown,
  ChevronLeft,
  Cloud,
  CloudOff,
  Download,
  FileJson,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Redo2,
  Undo2,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { exportJson, exportPng, planFromJson, printPlan, safeFileName } from "@/components/seating/exportPlan";
import { GuestListView } from "@/components/seating/GuestListView";
import { GuestSidebar } from "@/components/seating/GuestSidebar";
import { initials } from "@/components/seating/labels";
import { SeatingCanvas, type Selection } from "@/components/seating/SeatingCanvas";
import { useSeatingStore } from "@/components/seating/useSeatingStore";
import { ToastRegion, useToastQueue } from "@/components/ui/Feedback";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { useLang, useT } from "@/lib/i18n/provider";
import { translateLoose } from "@/lib/i18n/translate";
import { addGuests, assignGuest, metrics, removeTable, removeVenue, unassignGuest, updateTable, updateVenue } from "@/lib/seating/ops";
import { normalisePlan, planSchema, type SeatRef, type SeatingGuest } from "@/lib/seating/schema";
import type { HostEventDto } from "@/types/domain";

type Mode = "seating" | "guests";

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/**
 * Seating planner for one event: guest list + 2D floor plan, autosaved to
 * the server with undo/redo. Lives on its own page because the canvas needs
 * the whole screen.
 */
export function SeatingPlannerApp({ eventId }: { eventId: string }) {
  const t = useT();
  const { lang } = useLang();
  const store = useSeatingStore(eventId);
  const { plan, loadState } = store;
  const { toasts, pushToast, dismissToast } = useToastQueue();
  const notify = useCallback((text: string, variant: "success" | "error" | "info" = "info") => pushToast(text, variant), [pushToast]);

  const [event, setEvent] = useState<HostEventDto | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("seating");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ guestId: string; x: number; y: number } | null>(null);
  // Phones start with the canvas, not the drawer. (The planner is client-only
  // content: the server renders the loading state, so no hydration mismatch.)
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches);
  const [exportOpen, setExportOpen] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ event: HostEventDto }>(`/api/host/events/${eventId}`);
        if (!cancelled) setEvent(res.event);
      } catch (error) {
        if (!cancelled) setEventError(errorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const eventName = event?.coupleNames || event?.title || "";
  const title = plan.title || eventName;
  const m = metrics(plan);
  const pickedGuest = picked ? plan.guests.find((g) => g.id === picked) : undefined;

  // ------------------------------------------------------------ guest drag (sidebar or seat → seat / sidebar)

  const startGuestDrag = useCallback((guestId: string, point: { x: number; y: number }) => {
    setPicked(null);
    setDrag({ guestId, ...point });
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
  }, []);

  const dragging = drag !== null;
  const dragGuestId = drag?.guestId ?? null;
  const { apply } = store;
  useEffect(() => {
    if (!dragging || !dragGuestId) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      setDrag(null);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const seat = el?.closest<SVGElement>("[data-seat]");
      if (seat?.dataset.table) {
        const ref = { tableId: seat.dataset.table, seat: Number(seat.dataset.seat) };
        apply((pl) => assignGuest(pl, dragGuestId, ref));
      } else if (el?.closest("[data-unassign]")) {
        apply((pl) => unassignGuest(pl, dragGuestId));
      }
    };
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging, dragGuestId, apply]);

  const onSeatClick = (ref: SeatRef, occupant: SeatingGuest | undefined) => {
    if (picked) {
      if (occupant?.id !== picked) apply((pl) => assignGuest(pl, picked, ref));
      setPicked(null);
    } else if (occupant) {
      setPicked(occupant.id);
    } else {
      notify(t("Önce listeden bir misafir seçin ya da sürükleyin."), "info");
      setSidebarOpen(true);
    }
  };

  // ------------------------------------------------------------ keyboard

  const { undo, redo } = store;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector('[role="dialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        setSelected(null);
        setPicked(null);
        setExportOpen(false);
        return;
      }
      if (mode !== "seating" || !selected) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        apply((pl) => (selected.type === "table" ? removeTable(pl, selected.id) : removeVenue(pl, selected.id)));
        setSelected(null);
        return;
      }
      const step = e.shiftKey ? 100 : 20;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (delta) {
        e.preventDefault();
        apply((pl) => {
          const item = selected.type === "table" ? pl.tables.find((x) => x.id === selected.id) : pl.venue.find((x) => x.id === selected.id);
          if (!item) return pl;
          const patch = { x: item.x + delta[0], y: item.y + delta[1] };
          return selected.type === "table" ? updateTable(pl, selected.id, patch) : updateVenue(pl, selected.id, patch);
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selected, apply, undo, redo]);

  // ------------------------------------------------------------ export

  const fileBase = safeFileName(title || t("oturma-plani"));
  const runExport = async (kind: "png" | "print" | "json") => {
    setExportOpen(false);
    const svg = svgRef.current;
    try {
      if (kind === "json") exportJson(plan, `${fileBase}.json`);
      else if (!svg) throw new Error(t("Görsel oluşturulamadı."));
      else if (kind === "png") await exportPng(svg, plan, title, `${fileBase}.png`);
      else if (!printPlan(svg, plan, title, { tables: t("Masalar"), unassigned: t("Yerleşmemiş misafirler"), seat: t("Sandalye"), empty: t("Boş"), lang })) {
        notify(t("Yazdırma penceresi açılamadı. Açılır pencere engelleyicisini kontrol edin."), "error");
      }
    } catch (error) {
      notify(translateLoose(error instanceof Error ? error.message : String(error), lang), "error");
    }
  };

  const importJson = async (file: File | undefined) => {
    if (jsonRef.current) jsonRef.current.value = "";
    if (!file) return;
    try {
      const parsed = planSchema.safeParse(planFromJson(await file.text()));
      if (!parsed.success) throw new Error("invalid");
      if (!window.confirm(t("Mevcut plan, yedekteki planla değiştirilsin mi? (Geri alabilirsiniz.)"))) return;
      const next = normalisePlan(parsed.data);
      apply(() => next);
      setSelected(null);
      setFitSignal((n) => n + 1);
      notify(t("Plan yüklendi."), "success");
    } catch {
      notify(t("Bu dosya geçerli bir oturma planı yedeği değil."), "error");
    }
  };

  // ------------------------------------------------------------ render

  if (eventError) {
    return (
      <Centered>
        <p className="rounded-2xl bg-rose-50 p-5 text-sm text-rose-700">{eventError}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-stone-600 underline">
          {t("Etkinliklerime dön")}
        </Link>
      </Centered>
    );
  }
  if (loadState === "unavailable" || loadState === "error") {
    return (
      <Centered>
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-3 text-sm font-semibold text-stone-900">
          {loadState === "unavailable" ? t("Oturma planı henüz kurulmadı") : t("Oturma planı yüklenemedi")}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-stone-500">
          {loadState === "unavailable"
            ? t("Veritabanında supabase/migrations/0006_seating_plans.sql dosyasını çalıştırın, sonra sayfayı yenileyin.")
            : translateLoose(store.loadError ?? "", lang)}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={store.reload} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white">
            {t("Tekrar dene")}
          </button>
          <Link href={`/dashboard/${eventId}`} className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700">
            {t("Etkinliğe dön")}
          </Link>
        </div>
      </Centered>
    );
  }
  if (loadState === "loading" || !event) {
    return (
      <Centered>
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-stone-400" />
      </Centered>
    );
  }

  const dragGuest = drag ? plan.guests.find((g) => g.id === drag.guestId) : undefined;
  const iconBtn = "rounded-xl p-2 text-stone-700 hover:bg-stone-100 disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      <header className="eqr-safe-top z-30 border-b border-stone-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
          <Link href={`/dashboard/${eventId}`} className="inline-flex items-center gap-1 rounded-xl px-1.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800" aria-label={t("Etkinliğe dön")}>
            <ChevronLeft className="h-4 w-4" /> <span className="hidden lg:inline">{t("Etkinliğe dön")}</span>
          </Link>
          <div className="min-w-0 flex-1 basis-40">
            <input
              key={plan.title ?? ""}
              defaultValue={title}
              maxLength={120}
              aria-label={t("Plan başlığı")}
              onBlur={(e) => {
                const value = e.target.value.trim();
                const next = value && value !== eventName ? value : null;
                if (next !== plan.title) apply((pl) => ({ ...pl, title: next }));
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-full truncate rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 font-serif text-lg text-stone-900 outline-none hover:border-stone-200 focus:border-stone-400"
            />
            <p className="truncate px-1.5 text-[11px] text-stone-500">
              {t("{a}/{b} misafir yerleşti", { a: m.assigned, b: m.guests })} · {t("{n} masa", { n: m.tables })} · {t("{n} boş sandalye", { n: m.freeSeats })}
              {m.attending > 0 && ` · ${t("{n} katılıyor", { n: m.attending })}`}
            </p>
          </div>

          <div className="order-last flex w-full gap-1 rounded-xl bg-stone-100 p-1 sm:order-none sm:w-auto">
            {(
              [
                ["seating", t("Oturma Düzeni"), LayoutGrid],
                ["guests", t("Misafir Listesi"), Users],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id);
                  setSelected(null);
                }}
                aria-pressed={mode === id}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === id ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5">
            <button type="button" className={iconBtn} onClick={store.undo} disabled={!store.canUndo} title={`${t("Geri al")} (Ctrl+Z)`} aria-label={t("Geri al")}>
              <Undo2 className="h-4 w-4" />
            </button>
            <button type="button" className={iconBtn} onClick={store.redo} disabled={!store.canRedo} title={`${t("Yinele")} (Ctrl+Shift+Z)`} aria-label={t("Yinele")}>
              <Redo2 className="h-4 w-4" />
            </button>
            <SaveStatus state={store.saveState} onRetry={() => void store.retrySave()} onReload={store.reload} />
            <div className="relative">
              <button type="button" onClick={() => setExportOpen((v) => !v)} aria-expanded={exportOpen} className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">{t("Dışa aktar")}</span> <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 z-50 mt-1 w-60 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-lg">
                    <MenuItem icon={ImageIcon} label={t("PNG görsel")} onClick={() => void runExport("png")} />
                    <MenuItem icon={Printer} label={t("Yazdır / PDF")} onClick={() => void runExport("print")} />
                    <MenuItem icon={FileJson} label={t("Yedek (JSON)")} onClick={() => void runExport("json")} />
                    <div className="my-1 h-px bg-stone-100" />
                    <MenuItem
                      icon={Upload}
                      label={t("Yedekten geri yükle")}
                      onClick={() => {
                        setExportOpen(false);
                        jsonRef.current?.click();
                      }}
                    />
                  </div>
                </>
              )}
              <input ref={jsonRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void importJson(e.target.files?.[0])} />
            </div>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className={`relative min-h-0 flex-1 ${mode === "seating" ? "flex" : "hidden"}`}>
        <div
          className={`absolute inset-y-0 left-0 z-20 w-[min(20rem,85vw)] border-r border-stone-200 shadow-xl transition-transform md:static md:w-72 md:shadow-none lg:w-80 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:hidden"
          }`}
        >
          <GuestSidebar
            plan={plan}
            pickedGuestId={picked}
            onPick={setPicked}
            onDragStart={startGuestDrag}
            onQuickAdd={(name) => apply((pl) => addGuests(pl, [{ name }]))}
            dragActive={dragging}
          />
        </div>
        <div className="relative min-w-0 flex-1">
          <SeatingCanvas
            plan={plan}
            store={store}
            selected={selected}
            onSelect={setSelected}
            pickedGuestId={picked}
            guestDragActive={dragging}
            onSeatClick={onSeatClick}
            onSeatDragStart={startGuestDrag}
            svgRef={svgRef}
            fitSignal={fitSignal}
          />
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-2xl border border-stone-200 bg-white/95 px-2.5 py-2 text-xs font-medium text-stone-700 shadow-sm backdrop-blur hover:bg-stone-50"
            aria-label={sidebarOpen ? t("Misafir listesini gizle") : t("Misafir listesini göster")}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            <span className="tabular-nums">{m.unassigned}</span>
          </button>
          {pickedGuest && (
            <div className="absolute inset-x-3 bottom-16 z-20 mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-xs text-white sm:text-sm shadow-lg">
              <Armchair className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t("{name}: bir sandalyeye dokunun", { name: pickedGuest.name })}</span>
              {pickedGuest.seat && (
                <button
                  type="button"
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-white/10"
                  onClick={() => {
                    apply((pl) => unassignGuest(pl, pickedGuest.id));
                    setPicked(null);
                  }}
                >
                  {t("Masadan kaldır")}
                </button>
              )}
              <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs hover:bg-white/10" onClick={() => setPicked(null)}>
                {t("Vazgeç")}
              </button>
            </div>
          )}
        </div>
      </div>

      {mode === "guests" && (
        <div className="min-h-0 flex-1">
          <GuestListView plan={plan} store={store} eventId={eventId} eventName={title} notify={notify} />
        </div>
      )}

      {drag && dragGuest && (
        <div className="pointer-events-none fixed z-[60] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-stone-900 py-1 pr-3 pl-1 text-xs font-medium text-white shadow-xl" style={{ left: drag.x, top: drag.y }}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-stone-900">{initials(dragGuest.name)}</span>
          {dragGuest.name}
        </div>
      )}

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-4 text-center">{<div>{children}</div>}</div>;
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof Download; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100">
      <Icon className="h-4 w-4 text-stone-500" /> {label}
    </button>
  );
}

function SaveStatus({ state, onRetry, onReload }: { state: ReturnType<typeof useSeatingStore>["saveState"]; onRetry: () => void; onReload: () => void }) {
  const t = useT();
  if (state === "conflict") {
    return (
      <button type="button" onClick={onReload} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800" title={t("Oturma planı başka bir yerde değiştirildi.")}>
        <AlertTriangle className="h-4 w-4" /> <span className="hidden sm:inline">{t("Başka yerde değişti · Yenile")}</span>
      </button>
    );
  }
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700">
        <CloudOff className="h-4 w-4" /> <span className="hidden sm:inline">{t("Kaydedilemedi · Tekrar dene")}</span>
      </button>
    );
  }
  const busy = state === "saving" || state === "pending";
  return (
    <span className="inline-flex items-center gap-1.5 px-2 text-xs text-stone-500" role="status" aria-live="polite">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
      <span className="hidden sm:inline">{busy ? t("Kaydediliyor…") : t("Kaydedildi")}</span>
    </span>
  );
}
