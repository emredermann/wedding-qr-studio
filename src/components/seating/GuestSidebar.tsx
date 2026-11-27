"use client";

import { Search, UserMinus, UserPlus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { initials } from "@/components/seating/labels";
import { useT } from "@/lib/i18n/provider";
import type { SeatingPlan } from "@/lib/seating/schema";

type Filter = "unassigned" | "assigned" | "all";

/**
 * Guest list beside the canvas. Guests are dragged onto seats (pointer
 * events, so touch works) or picked with a tap and then placed by tapping a
 * seat. The whole sidebar is a drop zone that unseats a dragged guest.
 */
export function GuestSidebar({
  plan,
  pickedGuestId,
  onPick,
  onDragStart,
  onQuickAdd,
  dragActive,
}: {
  plan: SeatingPlan;
  pickedGuestId: string | null;
  onPick: (guestId: string | null) => void;
  onDragStart: (guestId: string, point: { x: number; y: number }) => void;
  onQuickAdd: (name: string) => void;
  dragActive: boolean;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("unassigned");
  const [group, setGroup] = useState("");
  const [draft, setDraft] = useState("");
  /** Set when a press became a drag, so the click that follows doesn't also pick the guest. */
  const dragged = useRef(false);

  const tableName = useMemo(() => new Map(plan.tables.map((x) => [x.id, x.name])), [plan.tables]);
  const groups = useMemo(() => [...new Set(plan.guests.map((g) => g.group).filter((g): g is string => Boolean(g)))].sort((a, b) => a.localeCompare(b, "tr")), [plan.guests]);
  const counts = useMemo(() => {
    const assigned = plan.guests.filter((g) => g.seat).length;
    return { all: plan.guests.length, assigned, unassigned: plan.guests.length - assigned };
  }, [plan.guests]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return plan.guests.filter((g) => {
      if (filter === "assigned" && !g.seat) return false;
      if (filter === "unassigned" && g.seat) return false;
      if (group && g.group !== group) return false;
      if (q && !`${g.name} ${g.group ?? ""} ${g.dietary ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)) return false;
      return true;
    });
  }, [plan.guests, query, filter, group]);

  const startDrag = (e: React.PointerEvent, guestId: string) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragged.current = false;
    const start = { x: e.clientX, y: e.clientY };
    const el = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    // Touch: a vertical swipe scrolls the list; only a mostly-horizontal move starts a drag.
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (Math.hypot(dx, dy) < 6) return;
      cleanup();
      if (e.pointerType === "touch" && Math.abs(dy) > Math.abs(dx)) return;
      dragged.current = true;
      onDragStart(guestId, { x: ev.clientX, y: ev.clientY });
    };
    const cleanup = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", cleanup);
      el.removeEventListener("pointercancel", cleanup);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", cleanup);
    el.addEventListener("pointercancel", cleanup);
  };

  const filters: Array<{ id: Filter; label: string; n: number }> = [
    { id: "unassigned", label: t("Yerleşmemiş"), n: counts.unassigned },
    { id: "assigned", label: t("Yerleşmiş"), n: counts.assigned },
    { id: "all", label: t("Tümü"), n: counts.all },
  ];

  return (
    <aside data-unassign className={`relative flex h-full min-h-0 flex-col bg-white ${dragActive ? "ring-2 ring-amber-400 ring-inset" : ""}`}>
      <div className="space-y-2 border-b border-stone-200 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Misafir ara")}
            aria-label={t("Misafir ara")}
            className="w-full rounded-xl border border-stone-300 bg-white py-2 pr-8 pl-9 text-base outline-none focus:border-stone-500 sm:text-sm"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label={t("Temizle")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-stone-400 hover:text-stone-700">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium ${filter === f.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"}`}
            >
              {f.label} <span className="text-stone-400 tabular-nums">{f.n}</span>
            </button>
          ))}
        </div>
        {groups.length > 0 && (
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t("Grup")} className="w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-base outline-none focus:border-stone-500 sm:text-sm">
            <option value="">{t("Tüm gruplar")}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
      </div>

      {pickedGuestId && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="flex-1">{t("Yerleştirmek için bir sandalyeye dokunun.")}</span>
          <button type="button" onClick={() => onPick(null)} className="font-semibold underline">
            {t("Vazgeç")}
          </button>
        </div>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {visible.map((g) => {
          const picked = g.id === pickedGuestId;
          return (
            <li key={g.id}>
              <div
                role="button"
                tabIndex={0}
                onPointerDown={(e) => startDrag(e, g.id)}
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  onPick(picked ? null : g.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPick(picked ? null : g.id);
                  }
                }}
                className={`flex cursor-grab items-center gap-2.5 rounded-xl px-2 py-1.5 text-left select-none ${picked ? "bg-amber-100 ring-1 ring-amber-400" : "hover:bg-stone-100"}`}
                style={{ touchAction: "pan-y" }}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${g.seat ? "bg-stone-900 text-white" : "border border-dashed border-stone-400 text-stone-600"}`}>
                  {initials(g.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-stone-900">{g.name}</span>
                  <span className="block truncate text-[11px] text-stone-500">
                    {[g.seat ? `${tableName.get(g.seat.tableId) || t("Masa")} · ${g.seat.seat + 1}` : null, g.group, g.dietary].filter(Boolean).join(" · ") || " "}
                  </span>
                </span>
                {g.link && <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700" title={t("Davetiyeden geldi")}>{t("LCV")}</span>}
                {g.rsvp === "no" && <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">{t("Gelmiyor")}</span>}
              </div>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-8 text-center text-xs text-stone-500">
            {plan.guests.length === 0
              ? t("Henüz misafir yok. Aşağıdan ekleyin ya da Misafir Listesi'nden Excel/PDF içe aktarın.")
              : filter === "unassigned" && !query && !group
                ? t("Herkes yerleşti 🎉")
                : t("Eşleşen misafir yok.")}
          </li>
        )}
      </ul>

      <form
        className="flex gap-2 border-t border-stone-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          onQuickAdd(draft);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={80}
          placeholder={t("Hızlı misafir ekle")}
          aria-label={t("Hızlı misafir ekle")}
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-stone-500 sm:text-sm"
        />
        <button type="submit" disabled={!draft.trim()} aria-label={t("Ekle")} className="rounded-xl bg-stone-900 px-3 text-white disabled:opacity-40">
          <UserPlus className="h-4 w-4" />
        </button>
      </form>

      {dragActive && (
        <div className="pointer-events-none absolute inset-x-3 bottom-20 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50/95 py-4 text-xs font-semibold text-amber-900">
          <UserMinus className="h-4 w-4" /> {t("Masadan kaldırmak için buraya bırakın")}
        </div>
      )}
    </aside>
  );
}
