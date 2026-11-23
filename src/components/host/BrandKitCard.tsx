"use client";

import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ProBadge, ProLock } from "@/components/host/ProGate";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { ui } from "@/components/ui/styles";
import { MAX_SPONSORS, type BrandingInput } from "@/lib/branding";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { imageFileToDataUrl } from "@/lib/client/frame";
import { newExtraId } from "@/lib/event-extras";
import { useT } from "@/lib/i18n/provider";
import type { HostEventDto } from "@/types/domain";

const LOGO_CHARS = 280_000;
const SPONSOR_CHARS = 150_000;

/**
 * Brand kit (Pro): event logo and sponsor logos. Shown on the guest page,
 * live wall, share frames, highlights video and photobook. Saved on its own
 * (images are uploaded separately from the other settings).
 */
export function BrandKitCard({
  event,
  onSaved,
  onMessage,
}: {
  event: HostEventDto;
  onSaved: (event: HostEventDto) => void;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const t = useT();
  const pro = event.plan === "pro";
  const [draft, setDraft] = useState<BrandingInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [sponsorName, setSponsorName] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);
  const sponsorInput = useRef<HTMLInputElement>(null);
  // Parent callbacks may change identity on every render; only the latest is needed.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (!pro) return;
    let cancelled = false;
    apiFetch<{ branding: BrandingInput }>(`/api/host/events/${event.id}/branding`)
      .then((res) => {
        if (!cancelled) setDraft(res.branding);
      })
      .catch((error) => {
        if (!cancelled) onMessageRef.current(errorMessage(error), "error");
      });
    return () => {
      cancelled = true;
    };
  }, [event.id, pro]);

  const readImage = async (file: File | undefined, maxChars: number) => {
    if (!file) return null;
    try {
      return await imageFileToDataUrl(file, 512, maxChars);
    } catch (error) {
      onMessage(errorMessage(error), "error");
      return null;
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ event: HostEventDto }>(`/api/host/events/${event.id}/branding`, { method: "PUT", json: draft });
      onSaved(res.event);
      onMessage(t("Marka kiti kaydedildi."), "success");
    } catch (error) {
      onMessage(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`space-y-3 ${ui.card}`}>
      <h3 className={`flex items-center gap-2 ${ui.sectionTitle}`}>
        {t("Marka kiti")} <ProBadge />
      </h3>
      <p className={ui.hint}>{t("Logonuz ve sponsor logoları misafir sayfasında, canlı ekranda, paylaşım çerçevelerinde, öne çıkanlar videosunda ve fotokitapta görünür.")}</p>
      {!pro && <ProLock text={t("Etkinliğinizi kendi logonuz ve sponsorlarınızla markalayın.")} />}
      {pro && !draft && (
        <div className="flex justify-center py-6 text-stone-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {pro && draft && (
        <>
          <div>
            <span className={ui.label}>{t("Etkinlik logosu")}</span>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-28 items-center justify-center rounded-xl border border-stone-200 bg-[repeating-conic-gradient(#f2efe9_0%_25%,#fff_0%_50%)] bg-[length:12px_12px]">
                {draft.logo ? <img src={draft.logo} alt="" className="max-h-14 max-w-24 object-contain" /> : <ImagePlus className="h-5 w-5 text-stone-400" />}
              </div>
              <button type="button" onClick={() => logoInput.current?.click()} className="rounded-xl border border-stone-300 px-3 py-1.5 text-xs">
                {draft.logo ? t("Değiştir") : t("Logo yükle")}
              </button>
              {draft.logo && (
                <button type="button" onClick={() => setDraft({ ...draft, logo: null })} className="rounded-xl px-2 py-1.5 text-xs text-stone-500 hover:bg-stone-100">
                  {t("Kaldır")}
                </button>
              )}
              <input
                ref={logoInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={async (e) => {
                  const logo = await readImage(e.target.files?.[0], LOGO_CHARS);
                  e.target.value = "";
                  if (logo) setDraft((d) => (d ? { ...d, logo } : d));
                }}
              />
            </div>
            <p className={`mt-1 ${ui.hint}`}>{t("Şeffaf arka planlı PNG önerilir; 512 px’e küçültülür.")}</p>
          </div>

          <div>
            <span className={ui.label}>{t("Sponsorlar")}</span>
            {draft.sponsors.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {draft.sponsors.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border border-stone-200 px-2 py-1.5">
                    <img src={s.logo} alt="" className="h-8 w-16 object-contain" />
                    <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{s.name}</span>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, sponsors: draft.sponsors.filter((x) => x.id !== s.id) })}
                      aria-label={t("{name} kaldır", { name: s.name })}
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {draft.sponsors.length < MAX_SPONSORS && (
              <div className="flex gap-2">
                <input value={sponsorName} maxLength={60} onChange={(e) => setSponsorName(e.target.value)} placeholder={t("Sponsor adı")} className={ui.inputCompact} />
                <button
                  type="button"
                  disabled={!sponsorName.trim()}
                  onClick={() => sponsorInput.current?.click()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-stone-300 px-3 text-xs disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> {t("Logosunu seç")}
                </button>
                <input
                  ref={sponsorInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={async (e) => {
                    const logo = await readImage(e.target.files?.[0], SPONSOR_CHARS);
                    e.target.value = "";
                    const name = sponsorName.trim().slice(0, 60);
                    if (!logo || !name) return;
                    setDraft((d) => (d ? { ...d, sponsors: [...d.sponsors, { id: newExtraId(), name, logo }] } : d));
                    setSponsorName("");
                  }}
                />
              </div>
            )}
            <label className="mt-2 block">
              <span className={ui.label}>{t("Sponsor başlığı (isteğe bağlı)")}</span>
              <input
                value={draft.sponsorsLabel ?? ""}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, sponsorsLabel: e.target.value || null })}
                placeholder={t("ör. Destekleyenler")}
                className={ui.inputCompact}
              />
            </label>
          </div>
          <ToggleRow
            checked={draft.showOnLiveWall}
            onChange={(on) => setDraft({ ...draft, showOnLiveWall: on })}
            label={t("Canlı ekranda göster")}
            hint={t("Logo köşede, sponsorlar alt şeritte döner.")}
          />
          <button type="button" onClick={save} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t("Marka kitini kaydet")}
          </button>
        </>
      )}
    </div>
  );
}
