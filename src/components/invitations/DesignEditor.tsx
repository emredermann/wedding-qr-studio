"use client";

import { Check, Eye, Loader2, Mail, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { Envelope } from "@/components/invitations/Envelope";
import { InvitationCard, lookFor, TEMPLATE_LOOK } from "@/components/invitations/InvitationCard";
import type { Mutate } from "@/components/invitations/InvitationsApp";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { ui } from "@/components/ui/styles";
import { useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";
import { DEFAULT_DESIGN, INVITE_FONTS, INVITE_TEMPLATES, type InvitationsDto, type InviteDesign, type InviteFont, type InviteTemplate } from "@/lib/invitations/model";

const TEMPLATE_LABEL: Record<InviteTemplate, { name: MsgKey; mood: MsgKey }> = {
  klasik: { name: "Klasik", mood: "Fildişi kâğıt, altın çerçeve" },
  botanik: { name: "Botanik", mood: "Okaliptüs dalları, el yazısı" },
  kemer: { name: "Kemer", mood: "Kemerli kart, toprak tonları" },
  gece: { name: "Gece", mood: "Lacivert ve altın, yıldızlar" },
  modern: { name: "Modern", mood: "Renk bandı, sade yazı" },
  minimal: { name: "Minimal", mood: "Bol boşluk, ince çizgiler" },
};

const FONT_LABEL: Record<InviteFont, MsgKey> = { auto: "Şablona göre", serif: "Zarif serif", script: "El yazısı", display: "Klasik başlık", sans: "Modern" };
const SWATCHES = ["#a08452", "#6f8a6a", "#b5654a", "#c9a45c", "#1f3a5f", "#7d4e57", "#5b6b8c", "#1c1b19"];

const HEADLINES: MsgKey[] = ["Evleniyoruz", "Hayatımızı birleştiriyoruz", "Nişanımıza davetlisiniz", "Kına gecemize davetlisiniz", "Bu mutlu günde yanımızda olun"];
const DRESS_CODES: MsgKey[] = ["Şık", "Rahat şık", "Gece kıyafeti", "Beyaz kıyafet"];
const SAMPLE_MESSAGE: MsgKey = "Hayatımızın en güzel gününde sizleri de aramızda görmekten mutluluk duyarız.";

/** Invitation template, text and options, with a live preview (sample greeting). */
export function DesignEditor({ data, readOnly, mutate }: { data: InvitationsDto; readOnly: boolean; mutate: Mutate }) {
  const t = useT();
  // A design that was never edited starts with friendly sample text (still unsaved).
  const [design, setDesign] = useState<InviteDesign>(() =>
    JSON.stringify(data.settings.design) === JSON.stringify(DEFAULT_DESIGN)
      ? { ...DEFAULT_DESIGN, headline: t("Evleniyoruz"), message: t(SAMPLE_MESSAGE), closing: t("Sevgiyle,") }
      : data.settings.design,
  );
  const [deadline, setDeadline] = useState(data.settings.rsvpDeadline ?? "");
  const [accepting, setAccepting] = useState(data.settings.accepting);
  const [saving, setSaving] = useState(false);
  const [envelopePreview, setEnvelopePreview] = useState(false);
  const set = <K extends keyof InviteDesign>(key: K, value: InviteDesign[K]) => setDesign((d) => ({ ...d, [key]: value }));
  const dirty =
    JSON.stringify(design) !== JSON.stringify(data.settings.design) || (deadline || null) !== data.settings.rsvpDeadline || accepting !== data.settings.accepting;
  const look = lookFor(design);
  const sample = t("Ayşe Yılmaz");

  const save = async () => {
    setSaving(true);
    await mutate("", { method: "PUT", json: { design, rsvpDeadline: deadline || null, accepting } }, t("Davetiye kaydedildi."));
    setSaving(false);
  };

  const text = (key: "headline" | "names" | "message" | "closing" | "dateText" | "time" | "venue" | "address" | "mapUrl" | "dressCode" | "note", label: MsgKey, placeholder: string, max: number, opts: { area?: boolean; hint?: MsgKey } = {}) => (
    <label className="block">
      <span className={ui.label}>{t(label)}</span>
      {opts.area ? (
        <textarea value={design[key]} onChange={(e) => set(key, e.target.value)} maxLength={max} rows={4} placeholder={placeholder} disabled={readOnly} className={ui.input} />
      ) : (
        <input value={design[key]} onChange={(e) => set(key, e.target.value)} maxLength={max} placeholder={placeholder} disabled={readOnly} className={ui.input} />
      )}
      {opts.hint && <span className={`${ui.hint} mt-1 block`}>{t(opts.hint)}</span>}
    </label>
  );

  const chips = (values: MsgKey[], key: "headline" | "dressCode") => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          disabled={readOnly}
          onClick={() => set(key, t(v))}
          className={`rounded-full border px-2.5 py-1 text-xs ${design[key] === t(v) ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600 hover:bg-stone-50"}`}
        >
          {t(v)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
      <div className="space-y-5">
        {/* Template gallery */}
        <section className={`${ui.card} space-y-4`}>
          <div>
            <h2 className={ui.sectionTitle}>{t("Şablon")}</h2>
            <p className={ui.hint}>{t("Her şablonun kendi renkleri, yazı tipleri ve süslemeleri var. Vurgu rengini dilediğiniz gibi değiştirebilirsiniz.")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {INVITE_TEMPLATES.map((tpl) => {
              const active = design.template === tpl;
              return (
                <button
                  key={tpl}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setDesign((d) => ({ ...d, template: tpl, accent: "", font: "auto" }))}
                  aria-pressed={active}
                  className={`group overflow-hidden rounded-2xl border text-left transition ${active ? "border-stone-900 ring-2 ring-stone-900" : "border-stone-200 hover:border-stone-400"}`}
                >
                  <div className="relative h-44 overflow-hidden" style={{ background: TEMPLATE_LOOK[tpl].page }}>
                    <div className="pointer-events-none absolute top-3 left-1/2 w-[26rem] origin-top -translate-x-1/2 scale-[0.36]">
                      <InvitationCard design={{ ...design, headline: design.headline || t("Evleniyoruz"), template: tpl, accent: "", font: "auto", program: [], note: "", dressCode: "", showCountdown: false }} event={data.event} greeting={null} compact />
                    </div>
                    {active && (
                      <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <div className="border-t border-stone-100 bg-white px-3 py-2">
                    <p className="text-sm font-semibold text-stone-900">{t(TEMPLATE_LABEL[tpl].name)}</p>
                    <p className="truncate text-[11px] text-stone-500">{t(TEMPLATE_LABEL[tpl].mood)}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={ui.label}>{t("Vurgu rengi")}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => set("accent", "")}
                  title={t("Şablonun rengi")}
                  className={`h-8 rounded-full border px-2.5 text-xs ${design.accent === "" ? "border-stone-900 font-semibold" : "border-stone-300 text-stone-600"}`}
                >
                  {t("Şablonun")}
                </button>
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={readOnly}
                    onClick={() => set("accent", c)}
                    aria-label={c}
                    className={`h-8 w-8 rounded-full border-2 ${design.accent === c ? "border-stone-900" : "border-white shadow-[0_0_0_1px_#d6d3cd]"}`}
                    style={{ background: c }}
                  />
                ))}
                <input type="color" value={look.accent} onChange={(e) => set("accent", e.target.value)} disabled={readOnly} aria-label={t("Özel renk")} className="h-8 w-10 cursor-pointer rounded-lg border border-stone-300" />
              </div>
            </div>
            <label className="block">
              <span className={ui.label}>{t("İsimlerin yazı tipi")}</span>
              <select value={design.font} onChange={(e) => set("font", e.target.value as InviteFont)} disabled={readOnly} className={ui.input}>
                {INVITE_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {t(FONT_LABEL[f])}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className={`${ui.card} space-y-4`}>
          <h2 className={ui.sectionTitle}>{t("Metin")}</h2>
          <div>
            {text("headline", "Üst satır", t("Evleniyoruz"), 80)}
            {!readOnly && chips(HEADLINES, "headline")}
          </div>
          {text("names", "İsimler", data.event.coupleNames || data.event.title, 120, { hint: "Boş bırakırsanız etkinlikteki isimler kullanılır." })}
          <div>
            {text("message", "Davet metni", t(SAMPLE_MESSAGE), 1200, { area: true })}
            {!readOnly && !design.message && (
              <button type="button" onClick={() => set("message", t(SAMPLE_MESSAGE))} className="mt-2 text-xs font-medium text-stone-600 underline">
                {t("Örnek metni kullan")}
              </button>
            )}
          </div>
          {text("closing", "Kapanış", t("Sevgiyle,"), 200, { hint: "Örn. “Sevgiyle, Yılmaz ve Demir aileleri”" })}
        </section>

        <section className={`${ui.card} space-y-4`}>
          <h2 className={ui.sectionTitle}>{t("Tarih ve yer")}</h2>
          <div>
            <span className={ui.label}>{t("Tarih görünümü")}</span>
            <div className="flex gap-1 rounded-xl bg-stone-100 p-1 sm:max-w-sm">
              {(
                [
                  ["long", "20 Aralık 2026"],
                  ["numeric", "20 · 12 · 2026"],
                ] as const
              ).map(([id, sampleText]) => (
                <button
                  key={id}
                  type="button"
                  disabled={readOnly}
                  onClick={() => set("dateStyle", id)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums ${design.dateStyle === id ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"}`}
                >
                  {sampleText}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("dateText", "Tarih (isteğe bağlı)", t("Boşsa etkinlik tarihi"), 80)}
            {text("time", "Saat", "19:00", 40)}
          </div>
          {text("venue", "Mekân", t("Örn. Bahçe Restoran"), 120)}
          {text("address", "Adres", "", 240)}
          {text("mapUrl", "Harita bağlantısı", "https://maps.app.goo.gl/…", 500, { hint: "Google Haritalar'da konumu paylaşıp bağlantıyı yapıştırın." })}
        </section>

        <section className={`${ui.card} space-y-3`}>
          <div>
            <h2 className={ui.sectionTitle}>{t("Program")}</h2>
            <p className={ui.hint}>{t("İsteğe bağlı; ör. 17:00 Nikâh, 19:00 Yemek, 21:00 Dans.")}</p>
          </div>
          {design.program.map((line, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={line.time}
                onChange={(e) => set("program", design.program.map((l, j) => (j === i ? { ...l, time: e.target.value } : l)))}
                maxLength={20}
                placeholder="19:00"
                aria-label={t("Saat")}
                disabled={readOnly}
                className={`${ui.inputCompact} w-24 shrink-0`}
              />
              <input
                value={line.title}
                onChange={(e) => set("program", design.program.map((l, j) => (j === i ? { ...l, title: e.target.value } : l)))}
                maxLength={80}
                placeholder={t("Yemek")}
                aria-label={t("Başlık")}
                disabled={readOnly}
                className={ui.inputCompact}
              />
              {!readOnly && (
                <button type="button" onClick={() => set("program", design.program.filter((_, j) => j !== i))} aria-label={t("Sil")} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && design.program.length < 6 && (
            <button type="button" onClick={() => set("program", [...design.program, { time: "", title: "" }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-700">
              <Plus className="h-4 w-4" /> {t("Satır ekle")}
            </button>
          )}
        </section>

        <section className={`${ui.card} space-y-4`}>
          <h2 className={ui.sectionTitle}>{t("Ek bilgiler")}</h2>
          <div>
            {text("dressCode", "Kıyafet", t("Örn. Şık"), 120)}
            {!readOnly && chips(DRESS_CODES, "dressCode")}
          </div>
          {text("note", "Not", t("Örn. Otopark mekânın arkasındadır."), 400, { area: true })}
        </section>

        <section className={`${ui.card} space-y-2`}>
          <h2 className={ui.sectionTitle}>{t("Misafir deneyimi")}</h2>
          <ToggleRow checked={design.envelope} disabled={readOnly} onChange={(v) => set("envelope", v)} label={t("Zarf açılışı")} hint={t("Misafir önce mühürlü bir zarf görür, dokununca davetiye açılır.")} />
          <ToggleRow checked={design.showCountdown} disabled={readOnly} onChange={(v) => set("showCountdown", v)} label={t("Geri sayım")} hint={t("“Büyük güne 23 gün” gibi kalan gün sayısı.")} />
          <ToggleRow checked={design.showCalendar} disabled={readOnly} onChange={(v) => set("showCalendar", v)} label={t("Takvime ekle")} hint={t("Google Takvim ve Apple/Outlook (.ics) düğmeleri.")} />
        </section>

        <section className={`${ui.card} space-y-4`}>
          <h2 className={ui.sectionTitle}>{t("Yanıtlar")}</h2>
          <label className="block">
            <span className={ui.label}>{t("Son yanıt tarihi")}</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={readOnly} className={`${ui.input} sm:max-w-56`} />
            <span className={`${ui.hint} mt-1 block`}>{t("Bu tarihin sonuna kadar misafirler yanıt verip değiştirebilir.")}</span>
          </label>
          <ToggleRow checked={accepting} onChange={setAccepting} disabled={readOnly} label={t("Yanıt kabul et")} hint={t("Kapatırsanız bağlantılar açılır ama yeni yanıt alınmaz.")} />
        </section>

        {!readOnly && (
          <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <span className="flex-1 text-xs text-stone-500">{dirty ? t("Kaydedilmemiş değişiklikler var") : t("Tüm değişiklikler kaydedildi")}</span>
            <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("Kaydet")}
            </button>
          </div>
        )}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <Eye className="h-3.5 w-3.5" /> {t("Misafirin göreceği")}
          </p>
          {design.envelope && (
            <button type="button" onClick={() => setEnvelopePreview(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 underline">
              <Mail className="h-3.5 w-3.5" /> {t("Zarf açılışını izle")}
            </button>
          )}
        </div>
        <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl p-5" style={{ background: look.page }}>
          <InvitationCard design={design} event={data.event} greeting={sample} />
        </div>
      </div>

      {envelopePreview && (
        <Envelope look={look} names={design.names || data.event.coupleNames || data.event.title} greeting={sample} onOpen={() => setEnvelopePreview(false)} />
      )}
    </div>
  );
}
