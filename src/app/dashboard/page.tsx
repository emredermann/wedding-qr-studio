"use client";

import {
  AlertCircle,
  Calendar,
  Clock,
  ExternalLink,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Plus,
  QrCode,
  Shield,
  Sliders,
  Sparkles,
  Unlock,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandCrest } from "@/components/ui/BrandLogo";
import {
  FieldError,
  ToastRegion,
  useModalAccessibility,
  useToastQueue,
} from "@/components/ui/Feedback";
import { DEMO_FULL_ALBUM } from "@/lib/demo-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  sanitizeSlugInput,
  validateEventTitleField,
  validateSlugField,
} from "@/lib/validation/forms";
import type { Album, PrivacyMode } from "@/types/database";

interface AlbumsListResponse {
  albums: Album[];
  maxAlbumsPerAccount: number;
  actorEmail: string | null;
  isSuperAdmin: boolean;
}

export default function CoupleDashboardPage() {
  const { toasts, pushToast, dismissToast } = useToastQueue();

  const [albums, setAlbums] = useState<Album[]>([]);
  const [maxAlbums, setMaxAlbums] = useState<number>(5);
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  // Create new album form state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newSlug, setNewSlug] = useState<string>("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState<boolean>(false);
  const [newDate, setNewDate] = useState<string>("");
  const [newPrivacyMode, setNewPrivacyMode] = useState<PrivacyMode>("public");
  const [newRevealAt, setNewRevealAt] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [titleFieldError, setTitleFieldError] = useState<string | null>(null);
  const [slugFieldError, setSlugFieldError] = useState<string | null>(null);

  const createModalRef = useRef<HTMLDivElement | null>(null);
  const closeCreateModal = useCallback(() => {
    if (creating) return;
    setShowCreateModal(false);
    setCreateError(null);
    setTitleFieldError(null);
    setSlugFieldError(null);
  }, [creating]);

  useModalAccessibility({
    isOpen: showCreateModal,
    onClose: closeCreateModal,
    containerRef: createModalRef,
  });

  const [nowMs, setNowMs] = useState<number>(0);

  const loadAlbums = useCallback(async () => {
    await Promise.resolve();
    setNowMs(Date.now());
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/albums", { cache: "no-store" });
      if (res.status === 401) {
        setAlbums([DEMO_FULL_ALBUM]);
        setActorEmail("host@lumina.app");
        setIsSuperAdmin(true);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as AlbumsListResponse | { error?: { message?: string } };
      if (!res.ok || !("albums" in data)) {
        throw new Error(("error" in data && data.error?.message) || "Failed to load albums.");
      }
      setAlbums(data.albums);
      setMaxAlbums(data.maxAlbumsPerAccount);
      setActorEmail(data.actorEmail || "host@lumina.app");
      setIsSuperAdmin(data.isSuperAdmin);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load albums.");
      setAlbums([DEMO_FULL_ALBUM]);
      setActorEmail("host@lumina.app");
      setIsSuperAdmin(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAlbums();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAlbums]);

  const handleTitleChangeAutoSlug = (val: string) => {
    setNewTitle(val);
    if (titleFieldError) {
      setTitleFieldError(validateEventTitleField(val));
    }
    if (!slugManuallyEdited) {
      const generated = sanitizeSlugInput(val, true);
      if (generated.length >= 2) {
        setNewSlug(generated);
        if (slugFieldError) {
          setSlugFieldError(validateSlugField(generated));
        }
      }
    }
  };

  const handleSlugChange = (val: string) => {
    setSlugManuallyEdited(true);
    const sanitized = sanitizeSlugInput(val, false);
    setNewSlug(sanitized);
    if (slugFieldError) {
      setSlugFieldError(validateSlugField(sanitized));
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const normalizedSlug = sanitizeSlugInput(newSlug, true);
    setNewSlug(normalizedSlug);

    const tErr = validateEventTitleField(newTitle);
    const sErr = validateSlugField(normalizedSlug);
    setTitleFieldError(tErr);
    setSlugFieldError(sErr);

    if (tErr || sErr) {
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          slug: normalizedSlug,
          eventDate: newDate || null,
          privacyMode: newPrivacyMode,
          revealAt: newRevealAt ? new Date(newRevealAt).toISOString() : null,
        }),
      });
      const data = (await res.json()) as { album?: Album; error?: { message?: string } };
      if (!res.ok || !data.album) {
        throw new Error(data.error?.message || "Could not create album.");
      }
      setAlbums((prev) => [data.album!, ...prev]);
      setShowCreateModal(false);
      setNewTitle("");
      setNewSlug("");
      setSlugManuallyEdited(false);
      setNewDate("");
      setNewRevealAt("");
      pushToast(`Created album "${data.album.title}"`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create album.";
      setCreateError(msg);
      pushToast(msg, "error");
    } finally {
      setCreating(false);
    }
  };



  return (
    <div className="min-h-screen bg-stone-50 pb-20 text-stone-900">
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />

      {/* Top Navbar */}
      <header className="wqr-safe-top border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center gap-2.5 font-serif text-xl font-semibold tracking-tight transition hover:opacity-90"
            >
              <BrandCrest className="h-8 w-8" />
              <span>Lumina</span>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isSuperAdmin ? (
              <Link
                href="/admin"
                className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-stone-300 bg-stone-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-800"
              >
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                Master Admin Portal
              </Link>
            ) : null}
            {actorEmail ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="max-w-[180px] truncate text-xs font-medium text-stone-500">{actorEmail}</span>
                <Link
                  href="/login"
                  className="inline-flex min-h-12 items-center rounded-full border border-stone-300 px-4 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
                >
                  Sign In
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
                  className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-stone-300 px-4 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
                >
                  {signingOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center rounded-full border border-stone-300 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
        {/* Header & Quota Meter */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Your Wedding Events
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Event Albums &amp; QR Galleries
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              Create up to {maxAlbums} separate albums per account (e.g., Engagement, Welcome
              Dinner, Ceremony, Reception, Farewell Brunch).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-12 items-center rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600">
              {albums.length} / {maxAlbums} Albums Used
            </span>
            <button
              type="button"
              disabled={albums.length >= maxAlbums && !isSuperAdmin}
              onClick={() => setShowCreateModal(true)}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-700 px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-amber-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              New Event Album
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-6 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {loading ? (
          <div
            aria-busy="true"
            aria-label="Loading wedding event albums"
            className="mt-8 grid gap-6 md:grid-cols-2"
          >
            {[0, 1].map((skeletonIdx) => (
              <div
                key={skeletonIdx}
                className="flex min-h-[260px] animate-pulse flex-col justify-between rounded-3xl border border-stone-200 bg-white p-6"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-32 rounded-full bg-stone-200" />
                    <div className="h-4 w-24 rounded-full bg-stone-200" />
                  </div>
                  <div className="mt-5 h-7 w-3/4 rounded-xl bg-stone-200" />
                  <div className="mt-2 h-4 w-40 rounded-lg bg-stone-100" />
                </div>
                <div className="mt-6 flex gap-2 border-t border-stone-100 pt-4">
                  <div className="h-12 flex-1 rounded-full bg-stone-200" />
                  <div className="h-12 w-32 rounded-full bg-stone-200" />
                </div>
              </div>
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-stone-300 bg-white p-12 text-center">
            <Layers className="mx-auto h-10 w-10 text-amber-700" />
            <h2 className="mt-3 font-serif text-2xl font-semibold text-stone-900">
              No Event Albums Created Yet
            </h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-stone-600">
              Create your first wedding event album to generate your custom QR link, biometric
              face-find gallery, and 300-DPI table cards.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-700 px-6 py-3 text-xs font-semibold text-white shadow-md hover:bg-amber-800"
            >
              <Plus className="h-4 w-4" />
              Create Your First Event Album
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {albums.map((album) => {
              const isDisposableActive =
                album.reveal_at !== null && Date.parse(album.reveal_at) > nowMs;

              return (
                <article
                  key={album.id}
                  className="flex min-w-0 flex-col justify-between rounded-3xl border border-stone-200 bg-white p-5 shadow-xs transition hover:shadow-md sm:p-6"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Active Vault · Full Access
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-stone-500">
                        {album.privacy_mode === "private" ? (
                          <span className="flex items-center gap-1 text-rose-700">
                            <Lock className="h-3.5 w-3.5" />
                            Private Vault
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-700">
                            <Unlock className="h-3.5 w-3.5" />
                            Biometric Gate
                          </span>
                        )}
                      </div>
                    </div>

                    <h2 className="mt-4 break-words font-serif text-2xl font-semibold text-stone-900">
                      {album.title}
                    </h2>
                    <p className="mt-1 truncate font-mono text-xs text-stone-500">
                      /e/{album.slug}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-stone-600">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-stone-400" />
                        {album.event_date
                          ? new Date(album.event_date).toLocaleDateString()
                          : "Date TBD"}
                      </span>
                      {isDisposableActive && album.reveal_at ? (
                        <span className="flex items-center gap-1.5 text-amber-700">
                          <Clock className="h-3.5 w-3.5" />
                          Reveals {new Date(album.reveal_at).toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-6 space-y-3 border-t border-stone-100 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/${album.id}?tab=qr_studio`}
                        className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-amber-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-amber-800"
                      >
                        <QrCode className="h-3.5 w-3.5 shrink-0" />
                        <span>Create &amp; Print QR Card</span>
                      </Link>

                      <Link
                        href={`/dashboard/${album.id}`}
                        className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-stone-800"
                      >
                        Manage Album
                      </Link>

                      <Link
                        href={`/admin/events/${album.id}/builder`}
                        className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
                      >
                        <Sliders className="h-3.5 w-3.5 text-amber-700" />
                        Flow &amp; Theme Builder
                      </Link>

                      <Link
                        href={`/e/${album.slug}`}
                        target="_blank"
                        aria-label={`Open Guest Experience for ${album.title}`}
                        title="Open Guest Experience"
                        className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-stone-200 px-3.5 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Create New Album Modal */}
      {showCreateModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-album-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreateModal();
          }}
        >
          <div
            ref={createModalRef}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl sm:p-7"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-amber-700" />
                <h2 id="create-album-modal-title" className="font-serif text-xl font-semibold">
                  Create Wedding Event Album
                </h2>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                aria-label="Close modal"
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleCreateAlbum(e)}
              noValidate
              className="mt-4 space-y-4"
            >
              <div>
                <label
                  htmlFor="new-album-title"
                  className="block text-xs font-medium text-stone-700"
                >
                  Event Title (e.g., Welcome Party, Wedding Reception, Sunday Brunch)
                </label>
                <input
                  id="new-album-title"
                  type="text"
                  required
                  value={newTitle}
                  aria-invalid={Boolean(titleFieldError)}
                  aria-describedby={titleFieldError ? "new-album-title-error" : undefined}
                  onChange={(e) => handleTitleChangeAutoSlug(e.target.value)}
                  onBlur={() => setTitleFieldError(validateEventTitleField(newTitle))}
                  placeholder="Clara & Julian — Wedding Reception"
                  className="mt-1 min-h-12 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700"
                />
                <FieldError id="new-album-title-error" message={titleFieldError} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="new-album-slug"
                    className="block text-xs font-medium text-stone-700"
                  >
                    Custom QR URL Slug
                  </label>
                  <div className="mt-1 flex min-h-12 items-center rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-amber-700">
                    <span className="text-xs text-stone-400">/e/</span>
                    <input
                      id="new-album-slug"
                      type="text"
                      required
                      value={newSlug}
                      aria-invalid={Boolean(slugFieldError)}
                      aria-describedby={slugFieldError ? "new-album-slug-error" : undefined}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      onBlur={() => {
                        const clean = sanitizeSlugInput(newSlug, true);
                        setNewSlug(clean);
                        setSlugFieldError(validateSlugField(clean));
                      }}
                      placeholder="clara-and-julian"
                      className="w-full bg-transparent font-mono text-sm text-stone-900 focus:outline-none"
                    />
                  </div>
                  <FieldError id="new-album-slug-error" message={slugFieldError} />
                </div>

                <div>
                  <label
                    htmlFor="new-album-date"
                    className="block text-xs font-medium text-stone-700"
                  >
                    Event Date
                  </label>
                  <input
                    id="new-album-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="mt-1 min-h-12 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="new-album-privacy"
                    className="block text-xs font-medium text-stone-700"
                  >
                    Privacy Mode
                  </label>
                  <select
                    id="new-album-privacy"
                    value={newPrivacyMode}
                    onChange={(e) => setNewPrivacyMode(e.target.value as PrivacyMode)}
                    className="mt-1 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700"
                  >
                    <option value="public">
                      Biometric Face Gate (Guests unlock photos of themselves)
                    </option>
                    <option value="private">Private Vault (Only Couple sees uploads)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="new-album-reveal"
                    className="block text-xs font-medium text-stone-700"
                  >
                    Disposable Camera Reveal (Optional)
                  </label>
                  <input
                    id="new-album-reveal"
                    type="datetime-local"
                    value={newRevealAt}
                    onChange={(e) => setNewRevealAt(e.target.value)}
                    className="mt-1 min-h-12 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              {createError ? (
                <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                  {createError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="inline-flex min-h-12 items-center rounded-full border border-stone-300 px-5 py-2.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-700 px-6 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-amber-800 disabled:opacity-50"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {creating ? "Creating Album…" : "Create Album"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
