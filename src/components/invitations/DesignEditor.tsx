"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";

import { InvitationCard } from "@/components/invitations/InvitationCard";
import type { Mutate } from "@/components/invitations/InvitationsApp";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { ui } from "@/components/ui/styles";
import { useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";
import { INVITE_STYLES, type InvitationsDto, type InviteDesign, type InviteStyle } from "@/lib/invitations/model";

const STYLE_LABEL: Record<InviteStyle, MsgKey> = { classic: "Klasik", script: "El yazısı", modern: "Modern" };

/** Invitation text and look, with a live preview (greeting shown with a sample name). */
export function DesignEditor({ data, readOnly, mutate }: { data: InvitationsDto; readOnly: boolean; mutate: Mutate }) {
  const t = useT();
  const [design, setDesign] = useState<InviteDesign>(data.settings.design);
  const [deadline, setDeadline] = useState(data.settings.rsvpDeadline ?? "");
  const [accepting, setAccepting] = useState(data.settings.accepting);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof InviteDesign>(key: K, value: InviteDesign[K]) => setDesign((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    await mutate("", { method: "PUT", json: { design, rsvpDeadline: deadline || null, accepting } }, t("Davetiye kaydedildi."));
    setSaving(false);
  };

  const field = (key: keyof InviteDesign, label: MsgKey, placeholder: string, opts: { max: number; area?: boolean; hint?: MsgKey }) => (
    <label className="block">
      <span className={ui.label}>{t(label)}</span>
      {opts.area ? (
        <textarea value={design[key]} onChange={(e) => set(key, e.target.value)} maxLength={opts.max} rows={4} placeholder={placeholder} disabled={readOnly} className={ui.input} />
      ) : (
        <input value={design[key]} onChange={(e) => set(key, e.target.value)} maxLength={opts.max} placeholder={placeholder} disabled={readOnly} className={ui.input} />
      )}
      {opts.hint && <span className={`${ui.hint} mt-1 block`}>{t(opts.hint)}</span>}
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,28rem)]">
      <div className="space-y-5">
        <section className={`${ui.card} space-y-4`}>
          <h2 className={ui.sectionTitle}>{t("Görünüm")}</h2>
          <div className="flex flex-wrap gap-2">
            {INVITE_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                disabled={readOnly}
                onClick={() => set("style", style)}
                aria-pressed={design.style === style}
                className={`rounded-xl border px-4 py-2 text-sm font-medium ${design.style === style ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700 hover:bg-stone-50"}`}
              >
                {t(STYLE_LABEL[style])}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-stone-600">
              {t("Vurgu rengi")}
              <input
                type="color"
                value={design.accent || data.event.themeColor}
                onChange={(e) => set("accent", e.target.value)}
                disabled={readOnly}
                className="h-9 w-12 cursor-pointer rounded-lg border border-stone-300"
              />
            </label>
          </div>
        </section>

        <section className={`${ui.card} space-y-4`}>
          <h2 className={ui.sectionTitle}>{t("Metin")}</h2>
          {field("headline", "Üst satır", t("Evleniyoruz"), { max: 80 })}
          {field("names", "İsimler", data.event.coupleNames || data.event.title, { max: 120, hint: "Boş bırakırsanız etkinlikteki isimler kullanılır." })}
          {field("message", "Davet metni", t("Hayatımızın en güzel gününde sizi de aramızda görmek istiyoruz."), { max: 1200, area: true })}
          {field("closing", "Kapanış", t("Sevgiyle,"), { max: 200 })}
        </section>

        <section className={`${ui.card} space-y-4`}>
          <h2 className={ui.sectionTitle}>{t("Tarih ve yer")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("dateText", "Tarih", t("Boşsa etkinlik tarihi"), { max: 80 })}
            {field("time", "Saat", "19:00", { max: 40 })}
          </div>
          {field("venue", "Mekân", t("Örn. Bahçe Restoran"), { max: 120 })}
          {field("address", "Adres", "", { max: 240 })}
          {field("mapUrl", "Harita bağlantısı", "https://maps.google.com/…", { max: 500, hint: "Google Haritalar'da konumu paylaşıp bağlantıyı yapıştırın." })}
        </section>

        <section className={`${ui.card} space-y-4`}>
          <h2 className={ui.sectionTitle}>{t("Yanıtlar")}</h2>
          <label className="block">
            <span className={ui.label}>{t("Son yanıt tarihi")}</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={readOnly} className={`${ui.input} sm:max-w-56`} />
            <span className={`${ui.hint} mt-1 block`}>{t("Bu tarihin sonuna kadar misafirler yanıt verip değiştirebilir.")}</span>
          </label>
          <ToggleRow
            checked={accepting}
            onChange={setAccepting}
            disabled={readOnly}
            label={t("Yanıt kabul et")}
            hint={t("Kapatırsanız bağlantılar açılır ama yeni yanıt alınmaz.")}
          />
        </section>

        {!readOnly && (
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("Kaydet")}
          </button>
        )}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-xs font-semibold text-stone-500">{t("Önizleme")}</p>
        <div className="rounded-3xl bg-stone-100 p-4">
          <InvitationCard design={design} event={data.event} greeting={t("Ayşe Yılmaz")} />
        </div>
      </div>
    </div>
  );
}
