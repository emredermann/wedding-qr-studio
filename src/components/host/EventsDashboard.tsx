"use client";

import { CalendarHeart, ChevronRight, Images, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DriveConnectionCard } from "@/components/host/DriveConnectionCard";
import { PresetIcon } from "@/components/event/PresetIcon";
import { EventTypePicker, ThemeSwatches } from "@/components/host/EventPresetPickers";
import { ChallengesEditor, ScheduleEditor } from "@/components/host/EventExtrasEditors";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { HostHeader } from "@/components/host/HostHeader";
import { trackEvent } from "@/lib/client/analytics";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { newExtraId, type Challenge, type ScheduleItem } from "@/lib/event-extras";
import { EVENT_PRESETS, presetFor, type EventType, type ThemeId } from "@/lib/event-presets";
import type { DriveConnectionStatusDto, HostEventDto, HostEventListItem } from "@/types/domain";
import { useLang, useT } from "@/lib/i18n/provider";
import { ui } from "@/components/ui/styles";

export function EventsDashboard() {
  const router = useRouter();
  const t = useT();
  const { lang, locale } = useLang();
  const [events, setEvents] = useState<HostEventListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", coupleNames: "", eventDate: "", slug: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  // Step 1: the event type. Its preset fills in theme, modules and starter challenges.
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>("minimal");
  const [modules, setModules] = useState({ schedule: false, challenges: false, guestbook: true });
  const preset = presetFor(eventType);

  const chooseType = (type: EventType) => {
    const next = EVENT_PRESETS[type];
    setEventType(type);
    setThemeId(next.defaultTheme);
    setModules({ ...next.modules });
    // Starter challenges follow the type until the host edits them.
    const untouched =
      challenges.length === 0 ||
      (eventType !== null && JSON.stringify(challenges.map((c) => c.title)) === JSON.stringify(presetFor(eventType).defaultChallenges.map((k) => t(k))));
    if (untouched) setChallenges(next.defaultChallenges.map((key) => ({ id: newExtraId(), title: t(key) })));
  };
  const [coHosts, setCoHosts] = useState<string[]>([]);
  const [coHostDraft, setCoHostDraft] = useState("");
  const [created, setCreated] = useState<{ id: string; notAdded: string[] } | null>(null);

  const addCoHostDraft = () => {
    const value = coHostDraft.trim().toLocaleLowerCase("tr-TR").slice(0, 64);
    if (!value || coHosts.includes(value) || coHosts.length >= 5) return;
    setCoHosts([...coHosts, value]);
    setCoHostDraft("");
  };
  const [drive, setDrive] = useState<DriveConnectionStatusDto | null>(null);
  const [driveReload, setDriveReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<DriveConnectionStatusDto>("/api/host/drive");
        if (!cancelled) setDrive(res);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driveReload]);

  const needsDrive = drive !== null && !drive.connected && !drive.platformDriveAvailable;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ items: HostEventListItem[] }>("/api/host/events");
        if (!cancelled) setEvents(res.items);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      const res = await apiFetch<{ event: HostEventDto; coHostsNotAdded?: string[] }>("/api/host/events", {
        method: "POST",
        json: {
          title: form.title,
          coupleNames: form.coupleNames || undefined,
          eventDate: form.eventDate || undefined,
          slug: form.slug || undefined,
          ...(eventType ? { eventType } : {}),
          themeId,
          modules: { schedule: modules.schedule, challenges: modules.challenges },
          guestbookEnabled: modules.guestbook,
          ...(modules.schedule && schedule.length > 0 ? { schedule } : {}),
          ...(modules.challenges && challenges.length > 0 ? { challenges } : {}),
          ...(coHosts.length > 0 ? { coHosts } : {}),
        },
      });
      trackEvent("event_created", { drive: res.event.driveAccount });
      const notAdded = res.coHostsNotAdded ?? [];
      if (notAdded.length > 0) {
        // Let the host read which co-hosts could not be added before moving on.
        setCreated({ id: res.event.id, notAdded });
        setCreating(false);
        return;
      }
      router.push(`/dashboard/${res.event.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
      setCreating(false);
    }
  };

  const field = ui.input;

  return (
    <div className="min-h-dvh bg-stone-50">
      <HostHeader />
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_22rem]">
        <section>
          <DriveConnectionCard status={drive} onChanged={() => setDriveReload((n) => n + 1)} />
          <h1 className="mb-4 font-serif text-3xl text-stone-900">{t("Etkinliklerim")}</h1>
          {error && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          {!events && !error && (
            <div className="flex justify-center py-16 text-stone-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {events && events.length === 0 && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600">
              <CalendarHeart className="mx-auto mb-3 h-8 w-8 text-stone-400" />
              {t("Henüz bir etkinlik yok. Formdan ilk etkinliğinizi oluşturun.")}
            </div>
          )}
          <ul className="space-y-3">
            {events?.map((ev) => (
              <li key={ev.id}>
                <Link href={`/dashboard/${ev.id}`} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-stone-300 hover:shadow-sm">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: ev.themeColor }}>
                    {ev.eventType ? <PresetIcon eventType={ev.eventType} className="h-6 w-6" /> : <CalendarHeart className="h-6 w-6" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-stone-900">{ev.coupleNames || ev.title}</span>
                      {ev.role === "cohost" && (
                        <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">{t("Ortak yönetici")}</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-stone-500">
                      /e/{ev.slug}
                      {ev.eventDate ? ` · ${new Date(`${ev.eventDate}T12:00:00`).toLocaleDateString(locale)}` : ""}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                    <Images className="h-4 w-4" /> {ev.mediaCount}
                  </span>
                  <ChevronRight className="h-4 w-4 text-stone-400" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <aside>
          <form onSubmit={create} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className={`mb-1 flex items-center gap-2 ${ui.sectionTitle}`}>
              <Plus className="h-4 w-4" /> {t("Yeni etkinlik")}
            </h2>
            <p className={`mb-4 ${ui.hint}`}>{t("Google Drive’ınızda otomatik olarak Photos / Videos / VoiceNotes klasörleri açılır.")}</p>
            <div className="space-y-3">
              <div>
                <p className={`mb-2 ${ui.label}`}>{t("1 · Etkinlik türü")}</p>
                <EventTypePicker value={eventType} onChange={chooseType} compact />
                {eventType && <p className="mt-2 text-[11px] leading-snug text-stone-500">{t(preset.blurb)}</p>}
              </div>
              {!eventType && <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">{t("Türü seçin; tema, görevler ve modüller ona göre hazırlanır. Hepsini sonra değiştirebilirsiniz.")}</p>}
              {eventType && (
                <div className="eqr-step-enter space-y-3">
              <p className={`pt-1 ${ui.label}`}>{t("2 · Detaylar")}</p>
              <label className="block">
                <span className={ui.label}>{t("Etkinlik adı *")}</span>
                <input required minLength={2} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t(preset.titlePlaceholder)} className={field} />
              </label>
              <label className="block">
                <span className={ui.label}>{t(preset.nameLabel)}</span>
                <input maxLength={120} value={form.coupleNames} onChange={(e) => setForm({ ...form, coupleNames: e.target.value })} placeholder={t(preset.namePlaceholder)} className={field} />
              </label>
              <label className="block">
                <span className={ui.label}>{t("Tarih")}</span>
                <input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} className={field} />
              </label>
              <label className="block">
                <span className={ui.label}>{t("Bağlantı adresi (isteğe bağlı)")}</span>
                <div className="flex items-center rounded-xl border border-stone-300 bg-white pl-3 text-sm focus-within:border-stone-500">
                  <span className="text-stone-400">/e/</span>
                  <input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    maxLength={64}
                    placeholder="ayse-mehmet"
                    className="w-full rounded-r-xl bg-transparent px-1 py-2.5 text-base outline-none sm:text-sm"
                  />
                </div>
                <span className="mt-1 block text-[11px] text-stone-500">{t("Boş bırakırsanız tahmin edilemeyen bir adres oluşturulur (önerilir).")}</span>
              </label>
              <div>
                <p className={`mb-2 ${ui.label}`}>{t("Misafir sayfası teması")}</p>
                <ThemeSwatches value={themeId} onChange={setThemeId} />
              </div>
              <div className="rounded-xl border border-stone-200 px-3 py-1">
                <ToggleRow
                  checked={modules.schedule}
                  onChange={(on) => setModules({ ...modules, schedule: on })}
                  label={t(preset.scheduleLabel)}
                  hint={t("Saatli program; misafir sayfasında şu anki ve sıradaki madde vurgulanır.")}
                />
                {modules.schedule && (
                  <div className="pb-3">
                    <ScheduleEditor value={schedule} onChange={setSchedule} categories={lang === "en" ? preset.categories.en : preset.categories.tr} example={preset.scheduleExample} />
                  </div>
                )}
                <ToggleRow
                  checked={modules.challenges}
                  onChange={(on) => setModules({ ...modules, challenges: on })}
                  label={t("Görevler")}
                  hint={t("Misafirleri harekete geçiren fotoğraf görevleri; galeri görevlere göre filtrelenir.")}
                />
                {modules.challenges && (
                  <div className="pb-3">
                    {challenges.length > 0 && <p className="mb-2 text-[11px] text-stone-500">{t("{n} görev hazır; dilediğinizi düzenleyin ya da kaldırın.", { n: challenges.length })}</p>}
                    <ChallengesEditor value={challenges} onChange={setChallenges} ideas={preset.challengeIdeas} />
                  </div>
                )}
                <ToggleRow
                  checked={modules.guestbook}
                  onChange={(on) => setModules({ ...modules, guestbook: on })}
                  label={t("Dijital anı defteri")}
                  hint={t("Yazılı, sesli ve video mesajlar.")}
                />
              </div>
              <details className="group rounded-xl border border-stone-200 px-3 py-2">
                <summary className="cursor-pointer list-none text-xs font-semibold text-stone-600 [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5 transition group-open:rotate-45" /> {t("Ortak yöneticiler (isteğe bağlı)")}
                  </span>
                  {coHosts.length > 0 && <span className="ml-1 font-normal text-stone-400">· {t("{n} kişi", { n: coHosts.length })}</span>}
                </summary>
                <div className="space-y-2 pt-3">
                  <p className="text-xs text-stone-500">{t("Mira hesabı olan birini giriş yaptığı kullanıcı adı (ya da e-posta) ile ekleyin. Moderasyon ve ayarları yönetebilir; etkinliği silemez. En fazla 5 kişi.")}</p>
                  {coHosts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {coHosts.map((u) => (
                        <span key={u} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-1 pr-1 pl-3 text-xs text-stone-800">
                          {u}
                          <button type="button" onClick={() => setCoHosts(coHosts.filter((x) => x !== u))} className="rounded-full p-0.5 hover:bg-stone-200" aria-label={t("{name} kaldır", { name: u })}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {coHosts.length < 5 && (
                    <div className="flex gap-2">
                      <input
                        value={coHostDraft}
                        maxLength={64}
                        autoCapitalize="none"
                        onChange={(e) => setCoHostDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCoHostDraft();
                          }
                        }}
                        placeholder={t("Kullanıcı adı veya e-posta")}
                        className={field}
                      />
                      <button type="button" onClick={addCoHostDraft} className="shrink-0 rounded-xl border border-stone-300 px-3 text-sm">
                        {t("Ekle")}
                      </button>
                    </div>
                  )}
                </div>
              </details>
                </div>
              )}
              {formError && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>}
              {created && (
                <div role="status" className="space-y-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p>
                    {t("Etkinlik oluşturuldu, ancak şu kullanıcı adları ortak yönetici olarak eklenemedi:")} <strong>{created.notAdded.join(", ")}</strong>.{" "}
                    {t("Hesap açtıktan sonra Ayarlar’dan ekleyebilirsiniz.")}
                  </p>
                  <button type="button" onClick={() => router.push(`/dashboard/${created.id}`)} className="rounded-full bg-stone-900 px-3 py-1.5 text-white">
                    {t("Etkinliğe git")}
                  </button>
                </div>
              )}
              {needsDrive && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("Etkinlik oluşturmak için önce “Google Drive depolama” kartından Drive’ınızı bağlayın.")}</p>
              )}
              <button type="submit" disabled={creating || needsDrive || created !== null || !eventType} className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />} {t("Oluştur")}
              </button>
            </div>
          </form>
        </aside>
      </main>
    </div>
  );
}
