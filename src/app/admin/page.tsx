"use client";

import {
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Loader2,
  LogOut,
  QrCode,
  ScanFace,
  Shield,
  Sliders,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatBytes } from "@/lib/media-config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AdminEventMetric, PlanTier } from "@/types/database";

interface AdminEventsResponse {
  events: AdminEventMetric[];
  isDemo: boolean;
}

export default function MasterSuperAdminDashboardPage() {
  const [events, setEvents] = useState<AdminEventMetric[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyAlbumId, setBusyAlbumId] = useState<string | null>(null);

  // Clone Event Flow modal state
  const [cloneSourceMetric, setCloneSourceMetric] = useState<AdminEventMetric | null>(null);
  const [cloneTitle, setCloneTitle] = useState<string>("");
  const [cloneSlug, setCloneSlug] = useState<string>("");
  const [cloneDate, setCloneDate] = useState<string>("");
  const [cloning, setCloning] = useState<boolean>(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const cloneCounterRef = useRef<number>(1);

  const loadMetrics = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/events", { cache: "no-store" });
      const data = (await res.json()) as AdminEventsResponse;
      if (res.ok && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMetrics();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMetrics]);

  const totals = useMemo(() => {
    return events.reduce(
      (acc, item) => {
        acc.events += 1;
        acc.storageBytes += item.storageBytes;
        acc.mediaCount += item.mediaCount;
        acc.facesCount += item.facesIndexedCount;
        acc.guestsCount += item.guestRegistrationCount;
        return acc;
      },
      { events: 0, storageBytes: 0, mediaCount: 0, facesCount: 0, guestsCount: 0 },
    );
  }, [events]);

  const handleOverridePayment = async (
    albumId: string,
    isPaid: boolean,
    planTier: PlanTier,
  ) => {
    setBusyAlbumId(albumId);
    try {
      const res = await fetch("/api/admin/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId, isPaid, planTier }),
      });
      if (res.ok) {
        setEvents((prev) =>
          prev.map((m) =>
            m.album.id === albumId
              ? {
                  ...m,
                  album: {
                    ...m.album,
                    is_paid: isPaid,
                    plan_tier: planTier,
                  },
                }
              : m,
          ),
        );
      }
    } finally {
      setBusyAlbumId(null);
    }
  };

  const openCloneModal = (source: AdminEventMetric) => {
    setCloneSourceMetric(source);
    const defaultTitle = `${source.album.title} (Cloned Flow)`;
    setCloneTitle(defaultTitle);
    const suffix = cloneCounterRef.current;
    cloneCounterRef.current += 1;
    setCloneSlug(`${source.album.slug}-copy-${suffix}`);
    setCloneDate(source.album.event_date ?? "");
    setCloneError(null);
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneSourceMetric) return;
    setCloning(true);
    setCloneError(null);

    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAlbumId: cloneSourceMetric.album.id,
          title: cloneTitle.trim(),
          slug: cloneSlug.trim().toLowerCase(),
          eventDate: cloneDate || null,
        }),
      });
      const data = (await res.json()) as {
        createdMetric?: AdminEventMetric;
        error?: { message?: string };
      };
      if (!res.ok || !data.createdMetric) {
        throw new Error(data.error?.message || "Failed to clone event flow.");
      }
      setEvents((prev) => [data.createdMetric!, ...prev]);
      setCloneSourceMetric(null);
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Could not clone event flow.");
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 pb-20 text-stone-100">
      {/* Top Admin Command Bar */}
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-serif text-xl font-semibold">
              <Heart className="h-5 w-5 text-amber-500" />
              <span>Wedding QR Studio</span>
            </Link>
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400">
              <Shield className="h-3.5 w-3.5" />
              Master Super-Admin Command Center
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-stone-700 bg-stone-900 px-4 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
            >
              Couple Studio View
            </Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  await getSupabaseBrowserClient().auth.signOut();
                } finally {
                  window.location.replace("/login");
                }
              }}
              className="flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-3.5 py-2 text-xs font-semibold text-stone-300 transition hover:bg-stone-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pt-10">
        {/* Global KPI Strip */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
            <div className="flex items-center justify-between text-xs font-medium text-stone-400">
              <span>Total Active Events</span>
              <Database className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-3 font-serif text-3xl font-bold">{totals.events}</p>
            <p className="mt-1 text-[11px] text-stone-500">Multi-tenant event workspaces</p>
          </div>

          <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
            <div className="flex items-center justify-between text-xs font-medium text-stone-400">
              <span>Cloudflare R2 Storage</span>
              <HardDrive className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="mt-3 font-serif text-3xl font-bold">{formatBytes(totals.storageBytes)}</p>
            <p className="mt-1 text-[11px] text-stone-500">Zero-egress direct PUT objects</p>
          </div>

          <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
            <div className="flex items-center justify-between text-xs font-medium text-stone-400">
              <span>Total Media &amp; Toasts</span>
              <ImageIcon className="h-4 w-4 text-sky-400" />
            </div>
            <p className="mt-3 font-serif text-3xl font-bold">
              {totals.mediaCount.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-stone-500">Photos, 4K videos &amp; voice toasts</p>
          </div>

          <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
            <div className="flex items-center justify-between text-xs font-medium text-stone-400">
              <span>128-d Faces Indexed</span>
              <ScanFace className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-3 font-serif text-3xl font-bold">
              {totals.facesCount.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-stone-500">
              {totals.guestsCount.toLocaleString()} guestbook sign-ins
            </p>
          </div>
        </section>

        {/* Events Command Table */}
        <section className="mt-10 rounded-3xl border border-stone-800 bg-stone-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-4">
            <div>
              <h1 className="font-serif text-2xl font-semibold">
                Platform Events, R2 Consumption &amp; VIP Overrides
              </h1>
              <p className="mt-1 text-xs text-stone-400">
                Configure per-event guest onboarding flows, manually activate VIP/B2B accounts, or
                clone a winning event flow setup for a new client.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {events.map((metric) => {
                const { album } = metric;
                const enabledStepsCount = album.flow_config.steps.filter((s) => s.enabled).length;

                return (
                  <div
                    key={album.id}
                    className="flex flex-col justify-between gap-5 rounded-2xl border border-stone-800 bg-stone-950/80 p-5 lg:flex-row lg:items-center"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          style={{ backgroundColor: album.theme_config.primaryColor }}
                          className="h-3.5 w-3.5 rounded-full"
                          title={`Brand primary: ${album.theme_config.primaryColor}`}
                        />
                        <h2 className="font-serif text-lg font-semibold text-white">
                          {album.title}
                        </h2>
                        <span className="font-mono text-xs text-stone-400">/e/{album.slug}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-stone-400">
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3.5 w-3.5 text-emerald-400" />
                          R2: <strong className="text-stone-200">{formatBytes(metric.storageBytes)}</strong>
                        </span>
                        <span>
                          Media:{" "}
                          <strong className="text-stone-200">
                            {metric.photoCount} photos · {metric.videoCount} videos ·{" "}
                            {metric.audioCount} voice
                          </strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <ScanFace className="h-3.5 w-3.5 text-amber-400" />
                          <strong className="text-stone-200">{metric.facesIndexedCount}</strong>{" "}
                          faces indexed
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-sky-400" />
                          <strong className="text-stone-200">
                            {metric.guestRegistrationCount}
                          </strong>{" "}
                          guests
                        </span>
                        <span className="rounded-full bg-stone-800 px-2.5 py-0.5 text-[11px] text-stone-300">
                          {enabledStepsCount} active flow steps · {album.theme_config.galleryLayout}
                        </span>
                      </div>
                    </div>

                    {/* Right Controls: VIP Payment Override + Flow Builder + Clone */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Tier Selector */}
                      <select
                        value={album.plan_tier}
                        disabled={busyAlbumId === album.id}
                        onChange={(e) =>
                          void handleOverridePayment(
                            album.id,
                            album.is_paid,
                            e.target.value as PlanTier,
                          )
                        }
                        aria-label="Plan tier override"
                        className="rounded-full border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-semibold uppercase text-amber-400"
                      >
                        <option value="starter">Tier: Starter</option>
                        <option value="pro">Tier: Pro</option>
                        <option value="unlimited">Tier: Unlimited</option>
                      </select>

                      {/* VIP Payment Override Toggle */}
                      <button
                        type="button"
                        disabled={busyAlbumId === album.id}
                        onClick={() =>
                          void handleOverridePayment(album.id, !album.is_paid, album.plan_tier)
                        }
                        className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                          album.is_paid
                            ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                            : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {album.is_paid ? "VIP Paid (Active)" : "Activate VIP Override"}
                      </button>

                      {/* Visual Flow & Theme Builder */}
                      <Link
                        href={`/admin/events/${album.id}/builder`}
                        className="flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-500"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                        Screen &amp; Flow Builder
                      </Link>

                      {/* Print QR Card Studio */}
                      <Link
                        href={`/dashboard/${album.id}?tab=qr_studio`}
                        className="flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-3.5 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
                      >
                        <QrCode className="h-3.5 w-3.5 text-amber-400" />
                        QR Card Studio
                      </Link>

                      {/* Clone Event Flow */}
                      <button
                        type="button"
                        onClick={() => openCloneModal(metric)}
                        className="flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-3.5 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
                      >
                        <Copy className="h-3.5 w-3.5 text-amber-400" />
                        Clone Event Flow
                      </button>

                      <Link
                        href={`/e/${album.slug}`}
                        target="_blank"
                        className="rounded-full border border-stone-800 p-2 text-stone-400 hover:bg-stone-800 hover:text-white"
                        title="Open Guest Experience"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Clone Event Flow Modal */}
      {cloneSourceMetric ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border border-stone-800 bg-stone-900 p-6 text-stone-100 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-amber-400" />
                <h2 className="font-serif text-xl font-semibold">Clone Event Flow &amp; Theme</h2>
              </div>
              <button
                type="button"
                onClick={() => setCloneSourceMetric(null)}
                className="rounded-full p-1 text-stone-400 hover:bg-stone-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-stone-400">
              Duplicates all screen step ordering, custom copy, feature toggles, and brand theme
              from <strong>{cloneSourceMetric.album.title}</strong> into a new client event.
            </p>

            <form onSubmit={(e) => void handleCloneSubmit(e)} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-300">
                  New Client Event Title
                </label>
                <input
                  type="text"
                  required
                  value={cloneTitle}
                  onChange={(e) => setCloneTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300">New Event Slug</label>
                <input
                  type="text"
                  required
                  value={cloneSlug}
                  onChange={(e) => setCloneSlug(e.target.value.toLowerCase())}
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 font-mono text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300">Event Date</label>
                <input
                  type="date"
                  value={cloneDate}
                  onChange={(e) => setCloneDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              {cloneError ? (
                <p className="rounded-xl bg-rose-950/80 p-3 text-xs text-rose-300">{cloneError}</p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCloneSourceMetric(null)}
                  className="rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cloning}
                  className="flex items-center gap-1.5 rounded-full bg-amber-600 px-5 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Create Cloned Event
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
