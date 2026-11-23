"use client";

import { useEffect, useRef, useState } from "react";

import { ToggleRow } from "@/components/ui/ToggleRow";
import { ui } from "@/components/ui/styles";
import { FRAME_STYLES, type FrameStyle, type ShareFrameSettings } from "@/lib/branding";
import { drawFramedPhoto, loadOptionalImage, samplePhoto } from "@/lib/client/frame";
import { useLang, useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";
import type { HostEventDto } from "@/types/domain";

const STYLE_NAMES: Record<FrameStyle, MsgKey> = {
  none: "Çerçevesiz",
  classic: "Klasik",
  polaroid: "Polaroid",
  band: "Alt şerit",
};

/**
 * Share frame settings with a live preview. Frames are drawn only on the
 * copies guests or hosts share/download; originals in Drive stay untouched.
 */
export function ShareFrameEditor({
  event,
  value,
  onChange,
}: {
  event: HostEventDto;
  value: ShareFrameSettings;
  onChange: (next: ShareFrameSettings) => void;
}) {
  const t = useT();
  const { locale } = useLang();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOptionalImage(event.brand?.logoUrl).then((img) => {
      if (!cancelled) setLogo(img);
    });
    return () => {
      cancelled = true;
    };
  }, [event.brand?.logoUrl]);

  useEffect(() => {
    const target = previewRef.current;
    if (!target) return;
    const dateText = event.eventDate
      ? new Date(`${event.eventDate}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
      : null;
    const framed = drawFramedPhoto(samplePhoto(), value, { title: event.coupleNames || event.title, dateText, logo });
    target.width = framed.width;
    target.height = framed.height;
    target.getContext("2d")?.drawImage(framed, 0, 0);
  }, [value, event.coupleNames, event.title, event.eventDate, logo, locale]);

  return (
    <div className="space-y-3">
      <p className={ui.hint}>{t("Paylaşılan ve indirilen kopyalara eklenir; Drive’daki orijinal dosyalar hiç değişmez.")}</p>
      <div className="grid grid-cols-[1fr_7.5rem] items-start gap-3">
        <div className="grid grid-cols-2 gap-2">
          {FRAME_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => onChange({ ...value, style })}
              aria-pressed={value.style === style}
              className={`rounded-xl border px-2 py-2 text-xs font-medium ${value.style === style ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-300"}`}
            >
              {t(STYLE_NAMES[style])}
            </button>
          ))}
        </div>
        <canvas ref={previewRef} className="h-auto w-full rounded-lg border border-stone-200 shadow-sm" aria-label={t("Çerçeve önizlemesi")} />
      </div>
      <label className="block">
        <span className={ui.label}>{t("Çerçeve yazısı")}</span>
        <input
          value={value.text ?? ""}
          maxLength={60}
          onChange={(e) => onChange({ ...value, text: e.target.value || null })}
          placeholder={t("Boş bırakırsanız etkinlik adı ve tarihi yazılır")}
          className={ui.inputCompact}
        />
      </label>
      <ToggleRow checked={value.showLogo} onChange={(on) => onChange({ ...value, showLogo: on })} label={t("Çerçevede logoyu göster")} hint={event.brand?.logoUrl ? undefined : t("Önce Marka kitinden bir logo yükleyin.")} />
      <ToggleRow
        checked={value.guestShare}
        onChange={(on) => onChange({ ...value, guestShare: on })}
        label={t("Misafirler çerçeveli kopya paylaşabilsin")}
        hint={t("Açıksa misafirler galeride bir fotoğrafı çerçeveli olarak kaydedebilir ya da paylaşabilir. Kapalıyken misafirler kareleri indiremez.")}
      />
    </div>
  );
}
