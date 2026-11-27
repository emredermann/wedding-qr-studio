"use client";

import { Check, ClipboardList, Copy, Link2, Loader2, MessageCircle, MoreHorizontal, RefreshCw, Search, Trash2, Undo2, Upload, UserPlus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { Mutate, Notify } from "@/components/invitations/InvitationsApp";
import { readGuestFile } from "@/components/seating/guestImport";
import { useModalAccessibility } from "@/components/ui/Feedback";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { ui } from "@/components/ui/styles";
import { useLang, useT } from "@/lib/i18n/provider";
import { translateLoose } from "@/lib/i18n/translate";
import type { MsgKey } from "@/lib/i18n/translate";
import { INVITE_LIMITS, parseInviteeLines, type InvitationsDto, type InviteeDto, type InviteeInput, type InviteStatus } from "@/lib/invitations/model";

export const STATUS_LABEL: Record<InviteStatus, MsgKey> = { pending: "Yanıt bekleniyor", yes: "Katılıyor", no: "Katılmıyor" };
export const STATUS_CLASS: Record<InviteStatus, string> = {
  pending: "bg-stone-100 text-stone-600",
  yes: "bg-emerald-50 text-emerald-700",
  no: "bg-rose-50 text-rose-700",
};

const PARTY_OPTIONS = Array.from({ length: INVITE_LIMITS.maxParty }, (_, i) => i + 1);

/**
 * Invitees and their personal links: add one, paste a list or import Excel /
 * CSV / PDF, set each link's party limit, copy or WhatsApp the link. Also the
 * optional open link for guests not on the list.
 */
export function InviteesTab({ data, origin, readOnly, mutate, notify }: { data: InvitationsDto; origin: string; readOnly: boolean; mutate: Mutate; notify: Notify }) {
  const t = useT();
  const { lang } = useLang();
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [maxParty, setMaxParty] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InviteStatus | "all">("all");
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
        (filter === "all" || i.status === filter) &&
        (!q || `${i.name ?? ""} ${i.group ?? ""} ${i.party.join(" ")}`.toLocaleLowerCase("tr-TR").includes(q)),
    );
  }, [data.invitees, query, filter]);

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

  const whatsapp = (i: InviteeDto) => {
    const text = i.name
      ? t("Merhaba {name}, {couple} sizi davet ediyor. Davetiyeniz ve katılım formu: {link}", { name: i.name, couple, link: linkOf(i.token) })
      : t("{couple} sizi davet ediyor. Davetiye ve katılım formu: {link}", { couple, link: linkOf(i.token) });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy("file");
    try {
      const res = await readGuestFile(file);
      setPreview({
        title: file.name,
        list: res.guests.map((g) => ({ name: g.name, group: g.group ?? null, maxParty: g.party ?? maxParty, note: g.note ?? null })),
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
            className="grid gap-3 sm:grid-cols-[1fr_12rem_8rem_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await add([{ name: name.trim() || null, group: group.trim() || null, maxParty, note: null }], "one")) {
                setName("");
              }
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={INVITE_LIMITS.name} placeholder={t("Ad Soyad (ör. Yılmaz ailesi)")} aria-label={t("Ad Soyad")} className={ui.input} />
            <input value={group} onChange={(e) => setGroup(e.target.value)} list="invite-groups" maxLength={INVITE_LIMITS.group} placeholder={t("Grup (isteğe bağlı)")} aria-label={t("Grup")} className={ui.input} />
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
          <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
            {(["all", "pending", "yes", "no"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${filter === f ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"}`}
              >
                {f === "all" ? t("Tümü") : t(STATUS_LABEL[f])}
              </button>
            ))}
          </div>
        </div>

        {data.invitees.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <Link2 className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 text-sm font-semibold text-stone-900">{t("Henüz davetli yok")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-stone-500">{t("Davetlileri ekleyin; her birine özel bağlantıyı WhatsApp'tan gönderin. Yanıtlar buraya ve Google Drive'daki tabloya otomatik düşer.")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-3xl border border-stone-200 bg-white">
            {visible.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm font-medium text-stone-900">
                    {i.name ?? <span className="text-stone-400 italic">{t("İsimsiz davetiye")}</span>}
                    {i.viaOpenLink && <span className="ml-2 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">{t("Genel bağlantı")}</span>}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {[i.group, t("en fazla {n} kişi", { n: i.maxParty }), i.status === "yes" ? i.party.join(", ") : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[i.status]}`}>
                  {i.status === "yes" ? t("{n} kişi katılıyor", { n: i.party.length }) : t(STATUS_LABEL[i.status])}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => void copy(linkOf(i.token), i.id)} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100" title={t("Bağlantıyı kopyala")} aria-label={t("Bağlantıyı kopyala")}>
                    {copied === i.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => whatsapp(i)} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100" title={t("WhatsApp ile gönder")} aria-label={t("WhatsApp ile gönder")}>
                    <MessageCircle className="h-4 w-4" />
                  </button>
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
      {editing && <EditDialog invitee={editing} groups={groups} mutate={mutate} onClose={() => setEditing(null)} />}
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
      <p className={ui.hint}>{t("Her satıra bir davetli: “Ad Soyad; Grup; Kişi sayısı”. Excel'den üç sütunu kopyalayıp da yapıştırabilirsiniz.")}</p>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={10} className={`${ui.input} mt-3 font-mono`} placeholder={"Ayşe Yılmaz; Gelin tarafı; 2\nYılmaz ailesi; Damat tarafı; 4"} />
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

function EditDialog({ invitee, groups, mutate, onClose }: { invitee: InviteeDto; groups: string[]; mutate: Mutate; onClose: () => void }) {
  const t = useT();
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
        <label className="block">
          <span className={ui.label}>{t("Not (yalnızca siz görürsünüz)")}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={INVITE_LIMITS.note} className={ui.input} />
        </label>
        <button
          type="button"
          onClick={() => void action({ name: name.trim() || null, group: group.trim() || null, maxParty, note: note.trim() || null }, "PATCH", t("Kaydedildi"))}
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
