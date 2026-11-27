"use client";

import { AlertTriangle, ExternalLink, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import type { Mutate } from "@/components/invitations/InvitationsApp";
import { STATUS_CLASS, STATUS_LABEL } from "@/components/invitations/InviteesTab";
import { ui } from "@/components/ui/styles";
import { useLang, useT } from "@/lib/i18n/provider";
import type { InvitationsDto, InviteStatus } from "@/lib/invitations/model";

/** Replies, newest first, and the Google Sheet copy in the host's Drive. */
export function RepliesTab({ data, readOnly, mutate }: { data: InvitationsDto; readOnly: boolean; mutate: Mutate }) {
  const t = useT();
  const { locale } = useLang();
  const [filter, setFilter] = useState<Exclude<InviteStatus, "pending"> | "all">("all");
  const [syncing, setSyncing] = useState(false);
  const sheet = data.settings.sheet;
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

  const replies = useMemo(
    () =>
      data.invitees
        .filter((i) => i.status !== "pending" && (filter === "all" || i.status === filter))
        .sort((a, b) => (b.respondedAt ?? "").localeCompare(a.respondedAt ?? "")),
    [data.invitees, filter],
  );
  const dietary = data.invitees.filter((i) => i.status === "yes" && i.dietary);

  const sync = async () => {
    setSyncing(true);
    await mutate("/sheet", { method: "POST" }, t("Google Drive tablosu güncellendi."));
    setSyncing(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-3">
        <div className="flex gap-1 self-start rounded-xl bg-stone-100 p-1">
          {(["all", "yes", "no"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === f ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"}`}>
              {f === "all" ? t("Tümü") : t(STATUS_LABEL[f])}
            </button>
          ))}
        </div>
        {replies.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">{t("Henüz yanıt yok.")}</p>
        ) : (
          <ul className="space-y-3">
            {replies.map((i) => (
              <li key={i.id} className="rounded-3xl border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-900">{i.name ?? i.party[0] ?? t("İsimsiz davetiye")}</p>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[i.status]}`}>
                    {i.status === "yes" ? t("{n} kişi katılıyor", { n: i.party.length }) : t(STATUS_LABEL[i.status])}
                  </span>
                </div>
                {i.status === "yes" && <p className="mt-2 text-sm text-stone-700">{i.party.join(", ")}</p>}
                {i.dietary && <p className="mt-1 text-xs text-stone-500">{t("Menü: {text}", { text: i.dietary })}</p>}
                {i.message && <p className="mt-2 rounded-2xl bg-stone-50 px-3 py-2 text-sm text-stone-700 italic">“{i.message}”</p>}
                <p className="mt-2 text-[11px] text-stone-400">
                  {i.respondedAt && fmt(i.respondedAt)}
                  {i.replyCount > 1 && ` · ${t("{n} kez güncellendi", { n: i.replyCount - 1 })}`}
                  {i.group && ` · ${i.group}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-4">
        <section className={`${ui.card} space-y-3`}>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
            <h2 className={ui.sectionTitle}>{t("Google Drive tablosu")}</h2>
          </div>
          <p className={ui.hint}>{t("Yanıtlar, etkinliğinizin Drive klasöründeki tabloya otomatik yazılır. Tablo yalnızca bir kopyadır; orada yapılan değişiklikler Mira'ya geri gelmez.")}</p>
          {sheet.error ? (
            <p className="flex gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {sheet.error}
            </p>
          ) : sheet.syncedAt ? (
            <p className="text-xs text-stone-600">
              {sheet.pending ? t("Güncelleniyor…") : t("Son güncelleme: {time}", { time: fmt(sheet.syncedAt) })}
            </p>
          ) : (
            <p className="text-xs text-stone-500">{t("Tablo ilk yanıtla birlikte oluşturulur.")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {sheet.url && (
              <a href={sheet.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50">
                <ExternalLink className="h-4 w-4" /> {t("Tabloyu aç")}
              </a>
            )}
            {!readOnly && (
              <button type="button" onClick={() => void sync()} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {sheet.url ? t("Şimdi güncelle") : t("Tabloyu oluştur")}
              </button>
            )}
          </div>
          {!readOnly && (
            <label className="flex items-center gap-2 text-xs text-stone-600">
              {t("Tablo dili")}
              <select value={sheet.lang} onChange={(e) => void mutate("", { method: "PUT", json: { sheetLang: e.target.value } })} className="w-auto rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-stone-500 sm:text-sm">
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </label>
          )}
        </section>

        {dietary.length > 0 && (
          <section className={`${ui.card} space-y-2`}>
            <h2 className={ui.sectionTitle}>{t("Menü notları")}</h2>
            <ul className="space-y-1 text-sm text-stone-700">
              {dietary.map((i) => (
                <li key={i.id}>
                  <span className="font-medium">{i.name ?? i.party[0]}</span>: {i.dietary}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
