"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  LogOut,
  QrCode,
  ScanFace,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrandCrest } from "@/components/ui/BrandLogo";
import {
  FieldError,
  ToastRegion,
  useModalAccessibility,
  useToastQueue,
} from "@/components/ui/Feedback";
import { formatBytes } from "@/lib/media-config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  sanitizeSlugInput,
  validateEventTitleField,
  validateSlugField,
} from "@/lib/validation/forms";
import type { AdminEventMetric } from "@/types/database";

interface AdminEventsResponse {
  events: AdminEventMetric[];
  isDemo: boolean;
}

export default function MasterSuperAdminDashboardPage() {
  const { toasts, pushToast, dismissToast } = useToastQueue();

  const [events, setEvents] = useState<AdminEventMetric[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [signingOut, setSigningOut] = useState<boolean>(false);

  // Clone Event Flow modal state
  const [cloneSourceMetric, setCloneSourceMetric] = useState<AdminEventMetric | null>(null);
  const [cloneTitle, setCloneTitle] = useState<string>("");
  const [cloneSlug, setCloneSlug] = useState<string>("");
  const [cloneDate, setCloneDate] = useState<string>("");
  const [cloning, setCloning] = useState<boolean>(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneTitleError, setCloneTitleError] = useState<string | null>(null);
  const [cloneSlugError, setCloneSlugError] = useState<string | null>(null);
  const cloneCounterRef = useRef<number>(1);
  const cloneModalRef = useRef<HTMLDivElement | null>(null);

  const closeCloneModal = useCallback(() => {
    if (cloning) return;
    setCloneSourceMetric(null);
    setCloneError(null);
    setCloneTitleError(null);
    setCloneSlugError(null);
  }, [cloning]);

  useModalAccessibility({
    isOpen: Boolean(cloneSourceMetric),
    onClose: closeCloneModal,
    containerRef: cloneModalRef,
  });

  // Delete Event modal state
  const [deleteTarget, setDeleteTarget] = useState<AdminEventMetric | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const deleteModalRef = useRef<HTMLDivElement | null>(null);

  const closeDeleteModal = useCallback(() => {
    if (isDeleting) return;
    setDeleteTarget(null);
  }, [isDeleting]);

  useModalAccessibility({
    isOpen: Boolean(deleteTarget),
    onClose: closeDeleteModal,
    containerRef: deleteModalRef,
  });

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



  const openCloneModal = (source: AdminEventMetric) => {
    setCloneSourceMetric(source);
    const defaultTitle = `${source.album.title} (Cloned Flow)`;
    setCloneTitle(defaultTitle);
    const suffix = cloneCounterRef.current;
    cloneCounterRef.current += 1;
    setCloneSlug(sanitizeSlugInput(`${source.album.slug}-copy-${suffix}`, true));
    setCloneDate(source.album.event_date ?? "");
    setCloneError(null);
    setCloneTitleError(null);
    setCloneSlugError(null);
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneSourceMetric) return;
    setCloneError(null);

    const normalizedSlug = sanitizeSlugInput(cloneSlug, true);
    setCloneSlug(normalizedSlug);

    const tErr = validateEventTitleField(cloneTitle);
    const sErr = validateSlugField(normalizedSlug);
    setCloneTitleError(tErr);
    setCloneSlugError(sErr);

    if (tErr || sErr) return;

    setCloning(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAlbumId: cloneSourceMetric.album.id,
          title: cloneTitle.trim(),
          slug: normalizedSlug,
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
      pushToast(`Cloned event flow into "${data.createdMetric.album.title}"`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not clone event flow.";
      setCloneError(msg);
      pushToast(msg, "error");
    } finally {
      setCloning(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId: deleteTarget.album.id }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(errData?.error?.message || "Failed to delete event.");
      }
      setEvents((prev) => prev.filter((m) => m.album.id !== deleteTarget.album.id));
      pushToast(`"${deleteTarget.album.title}" permanently deleted.`, "success");
      setDeleteTarget(null);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not delete event.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 pb-20 text-stone-100">
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />

      {/* Top Admin Command Bar */}
      <header className="wqr-safe-top border-b border-stone-800 bg-stone-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center gap-2.5 font-serif text-xl font-semibold tracking-tight"
            >
              <BrandCrest className="h-8 w-8" />
              <span>Lumina</span>
            </Link>
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400">
              <Shield className="h-3.5 w-3.5" />
              Master Super-Admin Command Center
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/dashboard"
              className="inline-flex min-h-12 items-center rounded-full border border-stone-700 bg-stone-900 px-4 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
            >
              Dashboard View
            </Link>
            <button
              type="button"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await getSupabaseBrowserClient().auth.signOut();
                } finally {
                  window.location.replace("/login");
                }
              }}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-4 py-2 text-xs font-semibold text-stone-300 transition hover:bg-stone-800 disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10">
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
        <section className="mt-10 rounded-3xl border border-stone-800 bg-stone-900/60 p-5 sm:p-6">
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
            <div className="mt-6 space-y-4">
              {[0, 1].map((idx) => (
                <div
                  key={idx}
                  className="h-24 animate-pulse rounded-2xl border border-stone-800 bg-stone-950/80"
                />
              ))}
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
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          style={{ backgroundColor: album.theme_config.primaryColor }}
                          className="h-3.5 w-3.5 shrink-0 rounded-full"
                          title={`Brand primary: ${album.theme_config.primaryColor}`}
                        />
                        <h2 className="break-words font-serif text-lg font-semibold text-white">
                          {album.title}
                        </h2>
                        <span className="font-mono text-xs text-stone-400">/e/{album.slug}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-stone-400">
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3.5 w-3.5 text-emerald-400" />
                          R2:{" "}
                          <strong className="text-stone-200">
                            {formatBytes(metric.storageBytes)}
                          </strong>
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

                    {/* Right Controls: Status Badge + Flow Builder + Manage + QR + ZIP + Clone + Guest View + Delete */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        Active
                      </span>

                      {/* Visual Flow & Theme Builder */}
                      <Link
                        href={`/admin/events/${album.id}/builder`}
                        className="inline-flex min-h-12 items-center gap-1.5 rounded-full bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-amber-500"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                        Builder
                      </Link>

                      {/* Manage Media & Studio */}
                      <Link
                        href={`/dashboard/${album.id}`}
                        className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-3.5 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-sky-400" />
                        Media
                      </Link>

                      {/* Print QR Card Studio */}
                      <Link
                        href={`/dashboard/${album.id}?tab=qr_studio`}
                        className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-3.5 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
                      >
                        <QrCode className="h-3.5 w-3.5 text-amber-400" />
                        QR Cards
                      </Link>

                      {/* Export ZIP Archive */}
                      <a
                        href={`/api/albums/${album.id}/download`}
                        download
                        title="Download streaming ZIP archive of all event media"
                        className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-3.5 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
                      >
                        <Download className="h-3.5 w-3.5 text-emerald-400" />
                        Export ZIP
                      </a>

                      {/* Clone Event Flow */}
                      <button
                        type="button"
                        onClick={() => openCloneModal(metric)}
                        className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-3.5 py-2 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
                      >
                        <Copy className="h-3.5 w-3.5 text-stone-400" />
                        Clone
                      </button>

                      {/* Open Guest Experience */}
                      <Link
                        href={`/e/${album.slug}`}
                        target="_blank"
                        aria-label={`Open Guest Experience for ${album.title}`}
                        title="Open Guest Experience"
                        className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-stone-800 bg-stone-900 p-2 text-stone-400 transition hover:bg-stone-800 hover:text-white"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>

                      {/* Delete Event Button */}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(metric)}
                        className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-rose-900/60 bg-rose-950/30 px-3.5 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-900/50 hover:text-rose-100"
                        title="Permanently Delete Event"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        Delete
                      </button>
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
          aria-labelledby="clone-event-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCloneModal();
          }}
        >
          <div
            ref={cloneModalRef}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-stone-800 bg-stone-900 p-6 text-stone-100 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-amber-400" />
                <h2 id="clone-event-modal-title" className="font-serif text-xl font-semibold">
                  Clone Event Flow &amp; Theme
                </h2>
              </div>
              <button
                type="button"
                onClick={closeCloneModal}
                aria-label="Close modal"
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full text-stone-400 hover:bg-stone-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-stone-400">
              Duplicates all screen step ordering, custom copy, feature toggles, and brand theme
              from <strong>{cloneSourceMetric.album.title}</strong> into a new client event.
            </p>

            <form
              onSubmit={(e) => void handleCloneSubmit(e)}
              noValidate
              className="mt-5 space-y-4"
            >
              <div>
                <label
                  htmlFor="clone-event-title"
                  className="block text-xs font-medium text-stone-300"
                >
                  New Client Event Title
                </label>
                <input
                  id="clone-event-title"
                  type="text"
                  required
                  value={cloneTitle}
                  aria-invalid={Boolean(cloneTitleError)}
                  aria-describedby={cloneTitleError ? "clone-event-title-error" : undefined}
                  onChange={(e) => {
                    setCloneTitle(e.target.value);
                    if (cloneTitleError) {
                      setCloneTitleError(validateEventTitleField(e.target.value));
                    }
                  }}
                  onBlur={() => setCloneTitleError(validateEventTitleField(cloneTitle))}
                  className="mt-1 min-h-12 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <FieldError id="clone-event-title-error" message={cloneTitleError} dark />
              </div>

              <div>
                <label
                  htmlFor="clone-event-slug"
                  className="block text-xs font-medium text-stone-300"
                >
                  New Event Slug
                </label>
                <input
                  id="clone-event-slug"
                  type="text"
                  required
                  value={cloneSlug}
                  aria-invalid={Boolean(cloneSlugError)}
                  aria-describedby={cloneSlugError ? "clone-event-slug-error" : undefined}
                  onChange={(e) => {
                    const clean = sanitizeSlugInput(e.target.value, false);
                    setCloneSlug(clean);
                    if (cloneSlugError) {
                      setCloneSlugError(validateSlugField(clean));
                    }
                  }}
                  onBlur={() => {
                    const clean = sanitizeSlugInput(cloneSlug, true);
                    setCloneSlug(clean);
                    setCloneSlugError(validateSlugField(clean));
                  }}
                  className="mt-1 min-h-12 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 font-mono text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <FieldError id="clone-event-slug-error" message={cloneSlugError} dark />
              </div>

              <div>
                <label
                  htmlFor="clone-event-date"
                  className="block text-xs font-medium text-stone-300"
                >
                  Event Date
                </label>
                <input
                  id="clone-event-date"
                  type="date"
                  value={cloneDate}
                  onChange={(e) => setCloneDate(e.target.value)}
                  className="mt-1 min-h-12 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {cloneError ? (
                <p role="alert" className="rounded-xl bg-rose-950/80 p-3 text-xs text-rose-300">
                  {cloneError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCloneModal}
                  className="inline-flex min-h-12 items-center rounded-full border border-stone-700 px-4 py-2 text-xs font-medium text-stone-300 hover:bg-stone-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cloning}
                  className="inline-flex min-h-12 items-center gap-1.5 rounded-full bg-amber-600 px-5 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {cloning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {cloning ? "Cloning Event…" : "Create Cloned Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete Event Confirmation Modal */}
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-event-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setDeleteTarget(null);
          }}
        >
          <div
            ref={deleteModalRef}
            className="w-full max-w-md rounded-3xl border border-rose-900/50 bg-stone-900 p-6 text-stone-100 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="h-5 w-5" />
                <h2 id="delete-event-modal-title" className="font-serif text-xl font-semibold">
                  Delete Event
                </h2>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                aria-label="Close modal"
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full p-2 text-stone-400 transition hover:bg-stone-800 hover:text-white disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-stone-300">
              Are you sure you want to permanently delete{" "}
              <strong className="text-white">{deleteTarget.album.title}</strong> (
              <code className="rounded bg-stone-950 px-1.5 py-0.5 font-mono text-amber-400">
                /e/{deleteTarget.album.slug}
              </code>
              )?
            </p>

            <div className="mt-4 space-y-1.5 rounded-2xl border border-rose-950/60 bg-rose-950/20 p-4 text-xs text-rose-300">
              <p className="font-semibold text-rose-200">This action cannot be undone:</p>
              <ul className="list-disc space-y-1 pl-4 text-stone-400">
                <li>
                  {deleteTarget.mediaCount} media items will be purged from Cloudflare R2
                </li>
                <li>{deleteTarget.guestRegistrationCount} registered guest sessions removed</li>
                <li>{deleteTarget.facesIndexedCount} biometric face vectors deleted</li>
                <li>QR cards and event URLs will immediately stop resolving</li>
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="inline-flex min-h-12 items-center rounded-full border border-stone-700 bg-stone-800 px-5 py-2.5 text-xs font-semibold text-stone-300 transition hover:bg-stone-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDeleteEvent()}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-rose-500 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting Event…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
