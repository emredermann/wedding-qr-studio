"use client";

import { CalendarHeart, ChevronRight, Images, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DriveConnectionCard } from "@/components/host/DriveConnectionCard";
import { HostHeader } from "@/components/host/HostHeader";
import { trackEvent } from "@/lib/client/analytics";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { DriveConnectionStatusDto, HostEventDto, HostEventListItem } from "@/types/domain";

export function EventsDashboard() {
  const router = useRouter();
  const [events, setEvents] = useState<HostEventListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", coupleNames: "", eventDate: "", slug: "" });
  const [formError, setFormError] = useState<string | null>(null);
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
      const res = await apiFetch<{ event: HostEventDto }>("/api/host/events", {
        method: "POST",
        json: {
          title: form.title,
          coupleNames: form.coupleNames || undefined,
          eventDate: form.eventDate || undefined,
          slug: form.slug || undefined,
        },
      });
      trackEvent("event_created", { drive: res.event.driveAccount });
      router.push(`/dashboard/${res.event.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
      setCreating(false);
    }
  };

  const field = "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-stone-500";

  return (
    <div className="min-h-dvh bg-stone-50">
      <HostHeader />
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_22rem]">
        <section>
          <DriveConnectionCard status={drive} onChanged={() => setDriveReload((n) => n + 1)} />
          <h1 className="mb-4 font-serif text-3xl text-stone-900">Etkinliklerim</h1>
          {error && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          {!events && !error && (
            <div className="flex justify-center py-16 text-stone-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {events && events.length === 0 && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-600">
              <CalendarHeart className="mx-auto mb-3 h-8 w-8 text-stone-400" />
              Henüz bir etkinlik yok. Sağdaki formdan ilk düğününüzü oluşturun.
            </div>
          )}
          <ul className="space-y-3">
            {events?.map((ev) => (
              <li key={ev.id}>
                <Link href={`/dashboard/${ev.id}`} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-stone-300 hover:shadow-sm">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: ev.themeColor }}>
                    <CalendarHeart className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-stone-900">{ev.coupleNames || ev.title}</span>
                    <span className="block truncate text-xs text-stone-500">
                      /e/{ev.slug}
                      {ev.eventDate ? ` · ${new Date(`${ev.eventDate}T12:00:00`).toLocaleDateString("tr-TR")}` : ""}
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
            <h2 className="mb-1 flex items-center gap-2 font-serif text-xl text-stone-900">
              <Plus className="h-5 w-5" /> Yeni etkinlik
            </h2>
            <p className="mb-4 text-xs text-stone-500">Google Drive’ınızda otomatik olarak Photos / Videos / VoiceNotes klasörleri açılır.</p>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-600">Etkinlik adı *</span>
                <input required minLength={2} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ayşe & Mehmet Düğünü" className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-600">Çiftin isimleri</span>
                <input maxLength={120} value={form.coupleNames} onChange={(e) => setForm({ ...form, coupleNames: e.target.value })} placeholder="Ayşe & Mehmet" className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-600">Tarih</span>
                <input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-600">Bağlantı adresi (isteğe bağlı)</span>
                <div className="flex items-center rounded-xl border border-stone-300 bg-white pl-3 text-sm focus-within:border-stone-500">
                  <span className="text-stone-400">/e/</span>
                  <input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    maxLength={64}
                    placeholder="ayse-mehmet"
                    className="w-full rounded-r-xl bg-transparent px-1 py-2.5 outline-none"
                  />
                </div>
              </label>
              {formError && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>}
              {needsDrive && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Etkinlik oluşturmak için önce “Google Drive depolama” kartından Drive’ınızı bağlayın.</p>
              )}
              <button type="submit" disabled={creating || needsDrive} className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />} Oluştur
              </button>
            </div>
          </form>
        </aside>
      </main>
    </div>
  );
}
