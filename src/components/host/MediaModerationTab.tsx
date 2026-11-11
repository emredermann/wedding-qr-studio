"use client";

import { Check, CheckSquare, EyeOff, Heart, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { HeartersList } from "@/components/host/HeartersList";
import { Lightbox } from "@/components/media/Lightbox";
import { MediaGrid } from "@/components/media/MediaGrid";
import { trackEvent } from "@/lib/client/analytics";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { BulkMediaResponse, HostEventDto, MediaDto, MediaPage, MediaStatus } from "@/types/domain";
import { useT } from "@/lib/i18n/provider";

type StatusFilter = "all" | MediaStatus;
type KindFilter = "all" | "photo" | "video";

function MediaFeed({
  event,
  status,
  kind,
  category,
  challenge,
  table,
  popular,
  onMessage,
  onChanged,
}: {
  event: HostEventDto;
  status: StatusFilter;
  kind: KindFilter;
  category: string | null;
  challenge: string | null;
  table: string | null;
  popular: boolean;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [items, setItems] = useState<MediaDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const query = (extra: Record<string, string | null>) => {
    const params = new URLSearchParams({ guestbook: "0" });
    if (status !== "all") params.set("status", status);
    if (kind !== "all") params.set("kind", kind);
    if (category) params.set("category", category);
    if (challenge) params.set("challenge", challenge);
    if (table) params.set("table", table);
    if (popular) params.set("sort", "popular");
    for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
    return `/api/host/events/${event.id}/media?${params.toString()}`;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ guestbook: "0" });
        if (status !== "all") params.set("status", status);
        if (kind !== "all") params.set("kind", kind);
        if (category) params.set("category", category);
        if (challenge) params.set("challenge", challenge);
        if (table) params.set("table", table);
        if (popular) params.set("sort", "popular");
        const page = await apiFetch<MediaPage>(`/api/host/events/${event.id}/media?${params.toString()}`);
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      } catch (error) {
        if (!cancelled) onMessage(errorMessage(error), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event.id, status, kind, category, challenge, table, popular, onMessage]);

  const loadMore = async () => {
    if (!cursor) return;
    try {
      const page = await apiFetch<MediaPage>(query({ cursor }));
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      onMessage(errorMessage(error), "error");
    }
  };

  const applyLocal = (updated: MediaDto) => {
    setItems((prev) =>
      prev
        .map((m) => (m.id === updated.id ? updated : m))
        .filter((m) => status === "all" || m.status === status),
    );
  };

  const setStatus = async (item: MediaDto, next: MediaStatus) => {
    const res = await apiFetch<{ media: MediaDto }>(`/api/host/media/${item.id}`, { method: "PATCH", json: { status: next } });
    applyLocal(res.media);
  };

  const setCategory = async (item: MediaDto, next: string | null) => {
    try {
      const res = await apiFetch<{ media: MediaDto }>(`/api/host/media/${item.id}`, { method: "PATCH", json: { category: next } });
      applyLocal(res.media);
    } catch (error) {
      onMessage(errorMessage(error), "error");
    }
  };

  const remove = async (item: MediaDto) => {
    await apiFetch(`/api/host/media/${item.id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((m) => m.id !== item.id));
  };

  const single = async (fn: () => Promise<void>, success: string) => {
    try {
      await fn();
      onMessage(success, "success");
      onChanged();
    } catch (error) {
      onMessage(errorMessage(error), "error");
    }
  };

  const bulk = async (action: "approve" | "hide" | "delete") => {
    const targets = items.filter((m) => selected.has(m.id));
    if (targets.length === 0) return;
    if (action === "delete" && !window.confirm(t("{n} dosya Drive çöp kutusuna taşınsın mı?", { n: targets.length }))) return;
    setWorking(true);
    try {
      const res = await apiFetch<BulkMediaResponse>(`/api/host/events/${event.id}/media/bulk`, {
        method: "POST",
        json: { ids: targets.map((m) => m.id), action },
      });
      trackEvent("moderation_bulk", { action, items: targets.length });
      const deleted = new Set(res.deletedIds);
      const updated = new Map(res.updated.map((m) => [m.id, m]));
      setItems((prev) =>
        prev
          .filter((m) => !deleted.has(m.id))
          .map((m) => updated.get(m.id) ?? m)
          .filter((m) => status === "all" || m.status === status),
      );
      const failed = res.failedIds.length;
      onMessage(failed ? t("{n} öğe güncellenemedi, diğerleri tamamlandı.", { n: failed }) : t("İşlem tamamlandı."), failed ? "error" : "success");
    } catch (error) {
      onMessage(errorMessage(error), "error");
    } finally {
      setWorking(false);
      setSelected(new Set());
      setSelectMode(false);
      onChanged();
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-stone-500">{items.length}{cursor ? "+" : ""} dosya</p>
        {selectMode ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-600">{t("{n} seçili", { n: selected.size })}</span>
            <button type="button" disabled={working} onClick={() => bulk("approve")} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
              <Check className="h-3.5 w-3.5" /> {t("Onayla")}
            </button>
            <button type="button" disabled={working} onClick={() => bulk("hide")} className="inline-flex items-center gap-1 rounded-full bg-stone-700 px-3 py-1.5 text-xs font-medium text-white">
              <EyeOff className="h-3.5 w-3.5" /> {t("Gizle")}
            </button>
            <button type="button" disabled={working} onClick={() => bulk("delete")} className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white">
              <Trash2 className="h-3.5 w-3.5" /> {t("Sil")}
            </button>
            <button type="button" onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label={t("Seçimi kapat")}>
              <X className="h-4 w-4" />
            </button>
            {working && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
          </div>
        ) : (
          items.length > 0 && (
            <button type="button" onClick={() => setSelectMode(true)} className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium">
              <CheckSquare className="h-4 w-4" /> {t("Toplu seç")}
            </button>
          )
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-stone-300 bg-white py-14 text-center text-sm text-stone-500">{t("Bu filtrede dosya yok.")}</p>
      ) : (
        <MediaGrid
          items={items}
          onOpen={setOpenIndex}
          selectable={selectMode}
          selected={selected}
          onToggleSelect={toggle}
          renderOverlay={(item) =>
            !selectMode && item.status !== "pending" && item.heartCount > 0 ? (
              <span className="pointer-events-none absolute right-1 bottom-1 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">
                <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
                <span className="tabular-nums">{item.heartCount}</span>
              </span>
            ) : !selectMode && item.status === "pending" ? (
              <div className="absolute inset-x-1 bottom-1 flex gap-1">
                <button type="button" onClick={() => single(() => setStatus(item, "approved"), t("Onaylandı"))} className="flex flex-1 items-center justify-center rounded-md bg-emerald-600/90 py-1 text-white" aria-label={t("Onayla")}>
                  <Check className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => single(() => setStatus(item, "hidden"), t("Gizlendi"))} className="flex flex-1 items-center justify-center rounded-md bg-stone-900/80 py-1 text-white" aria-label={t("Gizle")}>
                  <EyeOff className="h-4 w-4" />
                </button>
              </div>
            ) : null
          }
        />
      )}

      {cursor && (
        <div className="flex justify-center">
          <button type="button" onClick={loadMore} className="rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-medium">
            {t("Daha fazla")}
          </button>
        </div>
      )}

      {openIndex !== null && items[openIndex] && (
        <Lightbox
          items={items}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          challenges={event.challenges}
          onDelete={async (item) => {
            await single(() => remove(item), t("Drive çöp kutusuna taşındı"));
            setOpenIndex(null);
          }}
          footer={(item) => (
            <>
            <HeartersList key={item.id} eventId={event.id} item={item} />
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {item.status !== "approved" && (
                <button type="button" onClick={() => single(() => setStatus(item, "approved"), t("Onaylandı"))} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
                  <Check className="h-3.5 w-3.5" /> {t("Onayla / Göster")}
                </button>
              )}
              {item.status !== "hidden" && (
                <button type="button" onClick={() => single(() => setStatus(item, "hidden"), t("Gizlendi"))} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white">
                  <EyeOff className="h-3.5 w-3.5" /> {t("Gizle")}
                </button>
              )}
              <select
                value={item.category ?? ""}
                onChange={(e) => void setCategory(item, e.target.value || null)}
                className="rounded-full bg-white/15 px-3 py-1.5 text-xs text-white outline-none"
                aria-label={t("Kategori")}
              >
                <option value="" className="text-stone-900">{t("Kategorisiz")}</option>
                {event.categories.map((c) => (
                  <option key={c} value={c} className="text-stone-900">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            </>
          )}
        />
      )}
    </div>
  );
}

export function MediaModerationTab({
  event,
  pendingCount,
  onMessage,
  onChanged,
}: {
  event: HostEventDto;
  pendingCount: number;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [status, setStatus] = useState<StatusFilter>(pendingCount > 0 ? "pending" : "all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [popular, setPopular] = useState(false);
  const [tableDraft, setTableDraft] = useState("");
  const table = event.tableNumbers && /^\d{1,4}$/.test(tableDraft) ? tableDraft : null;

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([
          ["all", t("Tümü")],
          ["pending", pendingCount ? t("Onay bekleyen ({n})", { n: pendingCount }) : t("Onay bekleyen")],
          ["approved", t("Yayında")],
          ["hidden", t("Gizli")],
        ] as Array<[StatusFilter, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setStatus(id)} className={chip(status === id)}>
            {label}
          </button>
        ))}
        <span className="mx-1 w-px bg-stone-200" />
        {([
          ["all", t("Hepsi")],
          ["photo", t("Fotoğraf")],
          ["video", t("Video")],
        ] as Array<[KindFilter, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setKind(id)} className={chip(kind === id)}>
            {label}
          </button>
        ))}
        <span className="mx-1 w-px bg-stone-200" />
        <button type="button" aria-pressed={popular} onClick={() => setPopular((v) => !v)} className={chip(popular)}>
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" /> {t("En sevilenler")}
          </span>
        </button>
        {event.tableNumbers && (
          <label className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white py-1 pr-1 pl-3 text-xs text-stone-700">
            🪑
            <input
              value={tableDraft}
              inputMode="numeric"
              placeholder={t("Masa no")}
              aria-label={t("Masa no")}
              onChange={(e) => setTableDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-16 bg-transparent outline-none"
            />
          </label>
        )}
      </div>
      {event.categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[null, ...event.categories].map((c) => (
            <button key={c ?? "_"} type="button" onClick={() => setCategory(c)} className={chip(category === c)}>
              {c ?? t("Tüm kategoriler")}
            </button>
          ))}
        </div>
      )}
      {event.challenges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[null, ...event.challenges].map((c) => (
            <button key={c?.id ?? "_"} type="button" onClick={() => setChallenge(c?.id ?? null)} className={chip(challenge === (c?.id ?? null))}>
              {c ? c.title : t("Tüm görevler")}
            </button>
          ))}
        </div>
      )}
      <MediaFeed
        key={`${status}:${kind}:${category ?? ""}:${challenge ?? ""}:${table ?? ""}:${popular}`}
        event={event}
        status={status}
        kind={kind}
        category={category}
        challenge={challenge}
        table={table}
        popular={popular}
        onMessage={onMessage}
        onChanged={onChanged}
      />
    </div>
  );
}
