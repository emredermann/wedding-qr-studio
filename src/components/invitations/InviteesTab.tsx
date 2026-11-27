"use client";

import { Check, ClipboardList, Copy, Download, Link2, Loader2, MoreHorizontal, RefreshCw, Search, Send, Trash2, Undo2, Upload, UserPlus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { Mutate, Notify } from "@/components/invitations/InvitationsApp";
import { readGuestFile } from "@/components/seating/guestImport";
import { SendQueue } from "@/components/invitations/SendQueue";
import { downloadBlob } from "@/components/seating/exportPlan";
import { useModalAccessibility } from "@/components/ui/Feedback";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { ui } from "@/components/ui/styles";
import { useLang, useT } from "@/lib/i18n/provider";
import { translateLoose } from "@/lib/i18n/translate";
import type { MsgKey } from "@/lib/i18n/translate";
import {
  DEFAULT_MESSAGE,
  formatPhone,
  INVITE_LIMITS,
  invitationsCsv,
  MESSAGE_PLACEHOLDERS,
  normalisePhone,
  parseInviteeLines,
  renderMessage,
  sheetPhone,
  type InvitationsDto,
  type InviteeDto,
  type InviteeInput,
  type InviteStatus,
} from "@/lib/invitations/model";

export const STATUS_LABEL: Record<InviteStatus, MsgKey> = { pending: "Yanıt bekleniyor", yes: "Katılıyor", no: "Katılmıyor" };
export const STATUS_CLASS: Record<InviteStatus, string> = {
  pending: "bg-stone-100 text-stone-600",
  yes: "bg-emerald-50 text-emerald-700",
  no: "bg-rose-50 text-rose-700",
};

const PARTY_OPTIONS = Array.from({ length: INVITE_LIMITS.maxParty }, (_, i) => i + 1);

/**
 * Invitees and their personal links: add one, paste a list or import Excel /
 * CSV / PDF, set each link's party limit and phone. Send in bulk through the
 * phone's own SMS app / share sheet / copy (no paid service), track who has
 * been sent one, export the links. Also the optional open link.
 */
export function InviteesTab({ data, origin, readOnly, mutate, notify }: { data: InvitationsDto; origin: string; readOnly: boolean; mutate: Mutate; notify: Notify }) {
  const t = useT();
  const { lang, locale } = useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<InviteeDto[] | null>(null);
  const sending = data.sendingReady && !readOnly;
  const [group, setGroup] = useState("");
  const [maxParty, setMaxParty] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InviteStatus | "all" | "unsent">("all");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [preview, setPreview] = useState<{ title: string; list: InviteeInput[] } | null>(null);
  const [editing, setEditing] = useState<InviteeDto | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const couple = data.event.coupleNames || data.event.title;
  const linkOf = (token: string) => `${origin}/d/${token}`;
  const groups = useMemo(() => [...new Set(data.invitees.map((i) => i.group).filter((g): g is string => Boolean(g)))], [data.invitees]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return data.invitees.filter(
      (i) =>
        (filter === "all" || (filter === "unsent" ? !i.sentAt : i.status === filter)) &&
        (!q || `${i.name ?? ""} ${i.group ?? ""} ${i.phone ?? ""} ${i.party.join(" ")}`.toLocaleLowerCase("tr-TR").includes(q)),
    );
  }, [data.invitees, query, filter]);
  const liveSelected = useMemo(() => data.invitees.filter((i) => selected.has(i.id)), [data.invitees, selected]);
  const unsent = useMemo(() => data.invitees.filter((i) => !i.sentAt), [data.invitees]);
  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

  const dateText = data.event.eventDate
    ? new Date(`${data.event.eventDate}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
    : "";
  const template = data.settings.messageTemplate ?? DEFAULT_MESSAGE[lang];
  const messageWith = (tpl: string, i: InviteeDto) => renderMessage(tpl, { name: i.name, couple, link: linkOf(i.token), date: dateText });
  const messageFor = (i: InviteeDto) => messageWith(template, i);

  const markSent = async (ids: string[], sent: boolean, quiet = false) =>
    mutate("/sent", { method: "POST", json: { ids, sent } }, quiet ? undefined : sent ? t("{n} davetiye gönderildi olarak işaretlendi.", { n: ids.length }) : t("İşaret kaldırıldı."));

  const exportCsv = (list: InviteeDto[]) => {
    const header = [t("Ad Soyad"), t("Grup"), t("Telefon"), t("Kişi sınırı"), t("Yanıt"), t("Gönderildi"), t("Davetiye bağlantısı")];
    const rows = list.map((i) => ({
      name: i.name ?? "",
      group: i.group ?? "",
      phone: i.phone ? sheetPhone(i.phone) : "",
      maxParty: i.maxParty,
      status: t(STATUS_LABEL[i.status]),
      sent: i.sentAt ? new Date(i.sentAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "",
      link: linkOf(i.token),
    }));
    downloadBlob(new Blob([invitationsCsv(rows, header)], { type: "text/csv;charset=utf-8" }), "davetiyeler.csv");
  };

  const copyLinks = async (list: InviteeDto[]) => {
    const text = list.map((i) => `${i.name ?? t("İsimsiz davetiye")}: ${linkOf(i.token)}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notify(t("{n} bağlantı kopyalandı.", { n: list.length }), "success");
    } catch {
      notify(t("Kopyalanamadı. Bağlantıyı elle seçip kopyalayın."), "error");
    }
  };

  const add = async (list: InviteeInput[], key: string) => {
    if (list.length === 0) return false;
    setBusy(key);
    const ok = await mutate("/invitees", { method: "POST", json: { invitees: list } }, t("{n} davetiye bağlantısı oluşturuldu.", { n: list.length }));
    setBusy(null);
    return ok;
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      notify(t("Kopyalanamadı. Bağlantıyı elle seçip kopyalayın."), "error");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy("file");
    try {
      const res = await readGuestFile(file);
      setPreview({
        title: file.name,
        list: res.guests.map((g) => ({ name: g.name, group: g.group ?? null, maxParty: g.party ?? maxParty, note: g.note ?? null, phone: normalisePhone(g.phone) })),
      });
    } catch (e) {
      notify(translateLoose(e instanceof Error ? e.message : String(e), lang), "error");
    } finally {
      setBusy(null);
    }
  };

  const open = data.settings;
  const btn = "inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50";

  return (
    <div className="space-y-5">
      {!readOnly && (
        <section className={`${ui.card} space-y-4`}>
          <div>
            <h2 className={ui.sectionTitle}>{t("Davetli ekle")}</h2>
            <p className={ui.hint}>{t("Her davetliye özel bir bağlantı oluşur. Davetiye “Sevgili …” diye adıyla açılır; kişi sınırı kadar isim girebilir.")}</p>
          </div>
          <form
            className={`grid gap-3 ${data.sendingReady ? "sm:grid-cols-[1fr_10rem_10rem_7rem_auto]" : "sm:grid-cols-[1fr_12rem_8rem_auto]"}`}
            onSubmit={async (e) => {
              e.preventDefault();
              if (await add([{ name: name.trim() || null, group: group.trim() || null, maxParty, note: null, phone: normalisePhone(phone) }], "one")) {
                setName("");
                setPhone("");
              }
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={INVITE_LIMITS.name} placeholder={t("Ad Soyad (ör. Yılmaz ailesi)")} aria-label={t("Ad Soyad")} className={ui.input} />
            <input value={group} onChange={(e) => setGroup(e.target.value)} list="invite-groups" maxLength={INVITE_LIMITS.group} placeholder={t("Grup (isteğe bağlı)")} aria-label={t("Grup")} className={ui.input} />
            {data.sendingReady && (
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                maxLength={40}
                placeholder={t("Telefon (isteğe bağlı)")}
                aria-label={t("Telefon")}
                aria-invalid={phone.trim() !== "" && !normalisePhone(phone)}
                className={`${ui.input} ${phone.trim() !== "" && !normalisePhone(phone) ? "border-rose-400" : ""}`}
              />
            )}
            <label className="flex items-center gap-2">
              <span className="sr-only">{t("Kişi sınırı")}</span>
              <select value={maxParty} onChange={(e) => setMaxParty(Number(e.target.value))} className={ui.input} title={t("Kişi sınırı")}>
                {PARTY_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {t("{n} kişi", { n })}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy !== null} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy === "one" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} {t("Ekle")}
            </button>
          </form>
          <p className={ui.hint}>{t("İsim boş bırakılırsa davetiye isimsiz açılır ve misafir adını kendisi yazar.")}</p>
          <datalist id="invite-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => setPasteOpen(true)} disabled={busy !== null}>
              <ClipboardList className="h-4 w-4" /> {t("Liste yapıştır")}
            </button>
            <button type="button" className={btn} onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === "file" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t("Excel / PDF içe aktar")}
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,.pdf,application/pdf" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        </section>
      )}

      <section className={`${ui.card} space-y-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={ui.sectionTitle}>{t("Genel bağlantı")}</h2>
            <p className={ui.hint}>{t("Listede olmayan misafirler için tek bir bağlantı: misafir adını yazar, yanıtı kendi özel bağlantısına kaydedilir.")}</p>
          </div>
          <ToggleRow
            checked={open.openEnabled}
            disabled={readOnly}
            onChange={(v) => void mutate("", { method: "PUT", json: { openEnabled: v } })}
            label={open.openEnabled ? t("Açık") : t("Kapalı")}
          />
        </div>
        {open.openEnabled && open.openToken && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-700">{linkOf(open.openToken)}</code>
            <button type="button" className={btn} onClick={() => void copy(linkOf(open.openToken!), "open")}>
              {copied === "open" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {t("Kopyala")}
            </button>
            <select
              value={open.openMaxParty}
              disabled={readOnly}
              onChange={(e) => void mutate("", { method: "PUT", json: { openMaxParty: Number(e.target.value) } })}
              className="w-auto rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-stone-500 sm:text-sm"
              title={t("Kişi sınırı")}
            >
              {PARTY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {t("{n} kişi", { n })}
                </option>
              ))}
            </select>
            {!readOnly && (
              <button
                type="button"
                className={btn}
                title={t("Eski bağlantı çalışmaz hale gelir.")}
                onClick={() => window.confirm(t("Genel bağlantı yenilensin mi? Eski bağlantı çalışmaz hale gelir.")) && void mutate("", { method: "PUT", json: { regenerateOpenToken: true } })}
              >
                <RefreshCw className="h-4 w-4" /> {t("Yenile")}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Davetli ara")} aria-label={t("Davetli ara")} className={`${ui.input} pl-9`} />
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1">
            {(["all", ...(data.sendingReady ? (["unsent"] as const) : []), "pending", "yes", "no"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${filter === f ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"}`}
              >
                {f === "all" ? t("Tümü") : f === "unsent" ? t("Gönderilmedi") : t(STATUS_LABEL[f])}
              </button>
            ))}
          </div>
        </div>

        {data.invitees.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {sending && (
              <button type="button" disabled={unsent.length === 0} onClick={() => setQueue(unsent)} className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                <Send className="h-4 w-4" /> {t("Gönderilmeyenlere gönder ({n})", { n: unsent.length })}
              </button>
            )}
            <button type="button" className={btn} onClick={() => void copyLinks(visible)}>
              <Copy className="h-4 w-4" /> {t("Bağlantıları kopyala")}
            </button>
            <button type="button" className={btn} onClick={() => exportCsv(visible)}>
              <Download className="h-4 w-4" /> {t("Excel/CSV indir")}
            </button>
          </div>
        )}

        {sending && <MessageTemplateCard template={data.settings.messageTemplate} lang={lang} render={messageWith} first={data.invitees[0] ?? null} mutate={mutate} />}

        {sending && liveSelected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-sm text-white">
            <span className="mr-1">{t("{n} davetiye seçili", { n: liveSelected.length })}</span>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-stone-900" onClick={() => setQueue(liveSelected)}>
              <Send className="h-3.5 w-3.5" /> {t("Gönder")}
            </button>
            <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10" onClick={() => void markSent(liveSelected.map((i) => i.id), true).then((ok) => ok && setSelected(new Set()))}>
              {t("Gönderildi işaretle")}
            </button>
            <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10" onClick={() => void markSent(liveSelected.map((i) => i.id), false).then((ok) => ok && setSelected(new Set()))}>
              {t("İşareti kaldır")}
            </button>
            <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10" onClick={() => void copyLinks(liveSelected)}>
              {t("Bağlantıları kopyala")}
            </button>
            <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10" onClick={() => exportCsv(liveSelected)}>
              {t("Excel/CSV indir")}
            </button>
            <button type="button" className="ml-auto rounded-lg p-1.5 hover:bg-white/10" onClick={() => setSelected(new Set())} aria-label={t("Seçimi temizle")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {data.invitees.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <Link2 className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 text-sm font-semibold text-stone-900">{t("Henüz davetli yok")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-stone-500">{t("Davetlileri ekleyin ve her birine özel bağlantısını gönderin. Yanıtlar buraya ve Google Drive'daki tabloya otomatik düşer.")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-3xl border border-stone-200 bg-white">
            {sending && visible.length > 0 && (
              <li className="flex items-center gap-3 bg-stone-50 px-4 py-2 text-xs text-stone-500">
                <input
                  type="checkbox"
                  className={ui.checkbox}
                  checked={allVisibleSelected}
                  onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((i) => i.id)))}
                  aria-label={t("Tümünü seç")}
                />
                {t("Tümünü seç")}
              </li>
            )}
            {visible.map((i) => (
              <li key={i.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${selected.has(i.id) ? "bg-amber-50/60" : ""}`}>
                {sending && (
                  <input
                    type="checkbox"
                    className={ui.checkbox}
                    checked={selected.has(i.id)}
                    aria-label={i.name ?? t("İsimsiz davetiye")}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(i.id)) next.delete(i.id);
                        else next.add(i.id);
                        return next;
                      })
                    }
                  />
                )}
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm font-medium text-stone-900">
                    {i.name ?? <span className="text-stone-400 italic">{t("İsimsiz davetiye")}</span>}
                    {i.viaOpenLink && <span className="ml-2 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">{t("Genel bağlantı")}</span>}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {[i.group, i.phone ? formatPhone(i.phone) : null, t("en fazla {n} kişi", { n: i.maxParty }), i.status === "yes" ? i.party.join(", ") : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {data.sendingReady && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${i.sentAt ? "bg-sky-50 text-sky-700" : "bg-stone-50 text-stone-400"}`}
                    title={i.sentAt ? new Date(i.sentAt).toLocaleString(locale) : undefined}
                  >
                    {i.sentAt ? t("Gönderildi") : t("Gönderilmedi")}
                  </span>
                )}
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[i.status]}`}>
                  {i.status === "yes" ? t("{n} kişi katılıyor", { n: i.party.length }) : t(STATUS_LABEL[i.status])}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => void copy(linkOf(i.token), i.id)} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100" title={t("Bağlantıyı kopyala")} aria-label={t("Bağlantıyı kopyala")}>
                    {copied === i.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                  {sending && (
                    <button type="button" onClick={() => setQueue([i])} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100" title={t("Gönder")} aria-label={t("Gönder")}>
                      <Send className="h-4 w-4" />
                    </button>
                  )}
                  {!readOnly && (
                    <button type="button" onClick={() => setEditing(i)} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100" title={t("Düzenle")} aria-label={t("Düzenle")}>
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
            {visible.length === 0 && <li className="px-4 py-8 text-center text-xs text-stone-500">{t("Eşleşen davetli yok.")}</li>}
          </ul>
        )}
      </section>

      {pasteOpen && (
        <PasteDialog
          defaultMax={maxParty}
          onClose={() => setPasteOpen(false)}
          onSubmit={async (list) => {
            if (await add(list, "paste")) setPasteOpen(false);
          }}
        />
      )}
      {preview && (
        <Dialog title={t("İçe aktarma önizlemesi")} onClose={() => setPreview(null)}>
          <p className="text-sm text-stone-700">
            <span className="font-semibold">{preview.title}</span> · {t("{n} davetli bulundu", { n: preview.list.length })}
          </p>
          <p className={`${ui.hint} mt-1`}>{t("“Kişi sayısı” sütunu varsa kişi sınırı oradan alınır; yoksa {n} kişi.", { n: maxParty })}</p>
          <ul className="mt-3 max-h-72 divide-y divide-stone-100 overflow-auto rounded-2xl border border-stone-200 text-sm">
            {preview.list.slice(0, 200).map((g, n) => (
              <li key={n} className="flex justify-between gap-3 px-3 py-1.5">
                <span className="truncate">{g.name}</span>
                <span className="shrink-0 text-xs text-stone-500">
                  {[g.group, t("{n} kişi", { n: g.maxParty })].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={btn} onClick={() => setPreview(null)}>
              {t("Vazgeç")}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={async () => {
                if (await add(preview.list.slice(0, 500), "import")) setPreview(null);
              }}
            >
              {t("{n} davetiye oluştur", { n: Math.min(500, preview.list.length) })}
            </button>
          </div>
        </Dialog>
      )}
      {editing && <EditDialog invitee={editing} groups={groups} withPhone={data.sendingReady} mutate={mutate} onClose={() => setEditing(null)} />}
      {queue && (
        <SendQueue
          list={queue}
          messageFor={messageFor}
          onMark={(i) => markSent([i.id], true, true)}
          onClose={() => {
            setQueue(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useModalAccessibility({ isOpen: true, onClose, containerRef: ref });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 sm:items-center sm:p-4" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className={ui.sectionTitle}>{title}</h2>
          <button type="button" onClick={onClose} aria-label={t("Kapat")} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasteDialog({ defaultMax, onClose, onSubmit }: { defaultMax: number; onClose: () => void; onSubmit: (list: InviteeInput[]) => Promise<void> }) {
  const t = useT();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const list = parseInviteeLines(text, defaultMax);
  return (
    <Dialog title={t("Liste yapıştır")} onClose={onClose}>
      <p className={ui.hint}>{t("Her satıra bir davetli: “Ad Soyad; Grup; Kişi sayısı; Telefon”. Excel'den sütunları kopyalayıp da yapıştırabilirsiniz.")}</p>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={10} className={`${ui.input} mt-3 font-mono`} placeholder={"Ayşe Yılmaz; Gelin tarafı; 2; 0532 123 45 67\nYılmaz ailesi; Damat tarafı; 4"} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium" onClick={onClose}>
          {t("Vazgeç")}
        </button>
        <button
          type="button"
          disabled={list.length === 0 || saving}
          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={async () => {
            setSaving(true);
            await onSubmit(list.slice(0, 500));
            setSaving(false);
          }}
        >
          {t("{n} davetiye oluştur", { n: list.length })}
        </button>
      </div>
    </Dialog>
  );
}

function EditDialog({ invitee, groups, withPhone, mutate, onClose }: { invitee: InviteeDto; groups: string[]; withPhone: boolean; mutate: Mutate; onClose: () => void }) {
  const t = useT();
  const [phone, setPhone] = useState(invitee.phone ? formatPhone(invitee.phone) : "");
  const phoneBad = phone.trim() !== "" && !normalisePhone(phone);
  const [name, setName] = useState(invitee.name ?? "");
  const [group, setGroup] = useState(invitee.group ?? "");
  const [maxParty, setMaxParty] = useState(invitee.maxParty);
  const [note, setNote] = useState(invitee.note ?? "");
  const path = `/invitees/${invitee.id}`;
  const action = async (json: unknown, method = "PATCH", success?: string) => {
    if (await mutate(path, { method, ...(method === "DELETE" ? {} : { json }) }, success)) onClose();
  };
  return (
    <Dialog title={invitee.name ?? t("İsimsiz davetiye")} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className={ui.label}>{t("Ad Soyad")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={INVITE_LIMITS.name} className={ui.input} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.label}>{t("Grup")}</span>
            <input value={group} onChange={(e) => setGroup(e.target.value)} list="invite-groups-edit" maxLength={INVITE_LIMITS.group} className={ui.input} />
            <datalist id="invite-groups-edit">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className={ui.label}>{t("Kişi sınırı")}</span>
            <select value={maxParty} onChange={(e) => setMaxParty(Number(e.target.value))} className={ui.input}>
              {PARTY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {t("{n} kişi", { n })}
                </option>
              ))}
            </select>
          </label>
        </div>
        {invitee.status === "yes" && maxParty < invitee.party.length && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("Bu davetli {n} kişiyle katılacağını bildirdi; mevcut yanıt değişmez.", { n: invitee.party.length })}</p>
        )}
        {withPhone && (
          <label className="block">
            <span className={ui.label}>{t("Telefon")}</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={40} placeholder="0532 123 45 67" aria-invalid={phoneBad} className={`${ui.input} ${phoneBad ? "border-rose-400" : ""}`} />
            {phoneBad && <span className="mt-1 block text-xs text-rose-600">{t("Geçerli bir telefon numarası yazın.")}</span>}
          </label>
        )}
        <label className="block">
          <span className={ui.label}>{t("Not (yalnızca siz görürsünüz)")}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={INVITE_LIMITS.note} className={ui.input} />
        </label>
        <button
          type="button"
          disabled={phoneBad}
          onClick={() =>
            void action(
              { name: name.trim() || null, group: group.trim() || null, maxParty, note: note.trim() || null, ...(withPhone ? { phone: phone.trim() || null } : {}) },
              "PATCH",
              t("Kaydedildi"),
            )
          }
          className="w-full rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          {t("Kaydet")}
        </button>
        <div className="grid gap-2 border-t border-stone-100 pt-3 sm:grid-cols-3">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700"
            onClick={() => window.confirm(t("Yeni bağlantı oluşturulsun mu? Eski bağlantı çalışmaz hale gelir.")) && void action({ newLink: true }, "PATCH", t("Yeni bağlantı oluşturuldu."))}
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t("Yeni bağlantı")}
          </button>
          <button
            type="button"
            disabled={invitee.status === "pending"}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 disabled:opacity-40"
            onClick={() => window.confirm(t("Yanıt silinsin mi? Davetli yeniden yanıtlayabilir.")) && void action({ clearReply: true })}
          >
            <Undo2 className="h-3.5 w-3.5" /> {t("Yanıtı sıfırla")}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700"
            onClick={() => window.confirm(t("Davetli silinsin mi? Bağlantısı çalışmaz hale gelir.")) && void action(null, "DELETE")}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("Sil")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** The text sent with each link, with placeholders and a live sample. */
function MessageTemplateCard({
  template,
  lang,
  render,
  first,
  mutate,
}: {
  template: string | null;
  lang: "tr" | "en";
  render: (template: string, i: InviteeDto) => string;
  first: InviteeDto | null;
  mutate: Mutate;
}) {
  const t = useT();
  const [draft, setDraft] = useState(template ?? DEFAULT_MESSAGE[lang]);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const saved = template ?? DEFAULT_MESSAGE[lang];
  const insert = (token: string) => {
    const el = ref.current;
    const at = el ? el.selectionStart : draft.length;
    setDraft((d) => d.slice(0, at) + token + d.slice(at));
  };
  const preview = first ? render(draft, first) : null;
  return (
    <details className={`${ui.card} group`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span>
          <span className={`block ${ui.sectionTitle}`}>{t("Gönderim mesajı")}</span>
          <span className={ui.hint}>{t("Her bağlantıyla birlikte gönderilen metin.")}</span>
        </span>
        <span className="text-stone-400 transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-4 space-y-3">
        <textarea ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} rows={3} className={ui.input} />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-stone-500">{t("Ekle:")}</span>
          {MESSAGE_PLACEHOLDERS.map((p) => (
            <button key={p} type="button" onClick={() => insert(p)} className="rounded-full border border-stone-300 px-2 py-0.5 font-mono text-[11px] text-stone-700 hover:bg-stone-50">
              {p}
            </button>
          ))}
        </div>
        <p className={ui.hint}>{t("{isim}: davetlinin adı · {cift}: isimleriniz · {tarih}: etkinlik tarihi · {link}: kişiye özel bağlantı (yazmazsanız sona eklenir)")}</p>
        {preview && (
          <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm whitespace-pre-line text-stone-700 [overflow-wrap:anywhere]">
            {preview}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setDraft(DEFAULT_MESSAGE[lang])} className="rounded-xl px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
            {t("Varsayılana dön")}
          </button>
          <button
            type="button"
            disabled={saving || draft.trim() === saved.trim()}
            onClick={async () => {
              setSaving(true);
              await mutate("", { method: "PUT", json: { messageTemplate: draft.trim() === DEFAULT_MESSAGE[lang] ? null : draft } }, t("Mesaj kaydedildi."));
              setSaving(false);
            }}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {t("Kaydet")}
          </button>
        </div>
      </div>
    </details>
  );
}
