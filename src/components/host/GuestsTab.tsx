"use client";

import { Download, Heart, Loader2, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, errorMessage } from "@/lib/client/api";
import { saveBlob } from "@/lib/client/download";
import { useLang, useT } from "@/lib/i18n/provider";
import { formatBytes } from "@/lib/media-config";
import type { GuestListDto, GuestSummaryDto, HostEventDto } from "@/types/domain";

type SortKey = "recent" | "uploads" | "name";

/** CSV cell: quoted, with formula-looking values neutralised for spreadsheet apps. */
function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Host-only list of everyone who took part (uploads, messages, hearts). */
export function GuestsTab({
  event,
  onMessage,
}: {
  event: HostEventDto;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const t = useT();
  const { locale } = useLang();
  const [data, setData] = useState<GuestListDto | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<GuestListDto>(`/api/host/events/${event.id}/guests`);
        if (!cancelled) setData(res);
      } catch (error) {
        if (!cancelled) onMessage(errorMessage(error), "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event.id, onMessage]);

  const unnamed = t("İsimsiz misafir");
  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLocaleLowerCase(locale);
    const filtered = q ? data.guests.filter((g) => (g.name || unnamed).toLocaleLowerCase(locale).includes(q)) : data.guests;
    const uploads = (g: GuestSummaryDto) => g.photos + g.videos;
    return [...filtered].sort((a, b) =>
      sort === "name"
        ? (a.name || unnamed).localeCompare(b.name || unnamed, locale)
        : sort === "uploads"
          ? uploads(b) - uploads(a) || b.lastSeen.localeCompare(a.lastSeen)
          : b.lastSeen.localeCompare(a.lastSeen),
    );
  }, [data, query, sort, locale, unnamed]);

  const time = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });

  const exportCsv = () => {
    if (!data) return;
    const header = [
      t("Misafir"),
      ...(data.tableNumbers ? [t("Masa no")] : []),
      t("Fotoğraf"),
      t("Video"),
      t("Mesaj"),
      ...(data.heartsNamed ? [t("Kalp")] : []),
      t("Toplam boyut"),
      t("İlk"),
      t("Son"),
    ];
    const lines = rows.map((g) =>
      [
        g.name || unnamed,
        ...(data.tableNumbers ? [g.tableNo] : []),
        g.photos,
        g.videos,
        g.messages,
        ...(data.heartsNamed ? [g.hearts ?? 0] : []),
        formatBytes(g.totalBytes),
        time(g.firstSeen),
        time(g.lastSeen),
      ]
        .map(csvCell)
        .join(","),
    );
    // BOM so spreadsheet apps read Turkish letters correctly.
    const csv = `﻿${[header.map(csvCell).join(","), ...lines].join("\r\n")}`;
    saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${t("misafirler")}-${event.slug}.csv`);
  };

  if (!data) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const totals = data.guests.reduce(
    (acc, g) => ({ uploads: acc.uploads + g.photos + g.videos, messages: acc.messages + g.messages }),
    { uploads: 0, messages: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-stone-200 bg-white p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-700">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">{t("{n} misafir katıldı", { n: data.guests.length })}</p>
          <p className="text-xs text-stone-500">
            {t("{uploads} yükleme · {messages} mesaj", { uploads: totals.uploads, messages: totals.messages })} ·{" "}
            {t("Bu listeyi yalnızca siz ve ortak yöneticiler görebilirsiniz.")}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> {t("CSV indir")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-2 text-sm">
          <Search className="h-4 w-4 shrink-0 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("İsimle ara")}
            aria-label={t("İsimle ara")}
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label={t("Sıralama")}
          className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="recent">{t("Son etkinliğe göre")}</option>
          <option value="uploads">{t("En çok yükleyen")}</option>
          <option value="name">{t("İsme göre (A–Z)")}</option>
        </select>
      </div>

      {!data.heartsNamed && (
        <p className="flex items-center gap-1.5 text-[11px] text-stone-500">
          <Heart className="h-3 w-3" /> {t("Beğeniler anonim olduğu için kalp sayıları gösterilmiyor.")}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-stone-300 bg-white py-14 text-center text-sm text-stone-500">
          {data.guests.length === 0 ? t("Henüz katılan misafir yok.") : t("Aramayla eşleşen misafir yok.")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("Misafir")}</th>
                {data.tableNumbers && <th className="px-3 py-3 font-medium">🪑</th>}
                <th className="px-3 py-3 text-right font-medium">{t("Fotoğraf")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Video")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Mesaj")}</th>
                {data.heartsNamed && <th className="px-3 py-3 text-right font-medium">❤️</th>}
                <th className="px-4 py-3 font-medium">{t("Son etkinlik")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((g) => (
                <tr key={g.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={g.name ? "font-medium text-stone-900" : "text-stone-400 italic"}>{g.name || unnamed}</span>
                    {g.totalBytes > 0 && <span className="ml-2 hidden text-[11px] text-stone-400 sm:inline">{formatBytes(g.totalBytes)}</span>}
                  </td>
                  {data.tableNumbers && <td className="px-3 py-2.5 text-stone-600 tabular-nums">{g.tableNo ?? "–"}</td>}
                  <td className="px-3 py-2.5 text-right tabular-nums">{g.photos}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{g.videos}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{g.messages}</td>
                  {data.heartsNamed && <td className="px-3 py-2.5 text-right tabular-nums">{g.hearts ?? 0}</td>}
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap text-stone-500">{time(g.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
