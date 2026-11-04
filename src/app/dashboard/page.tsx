"use client";

import {
  AlertCircle,
  Calendar,
  Clock,
  ExternalLink,
  Heart,
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
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DEMO_FULL_ALBUM } from "@/lib/demo-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Album, CheckoutSessionResponse, PlanTier, PrivacyMode } from "@/types/database";

interface AlbumsListResponse {
  albums: Album[];
  maxAlbumsPerAccount: number;
  actorEmail: string | null;
  isSuperAdmin: boolean;
}

export default function CoupleDashboardPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [maxAlbums, setMaxAlbums] = useState<number>(5);
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create new album form state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newSlug, setNewSlug] = useState<string>("");
  const [newDate, setNewDate] = useState<string>("");
  const [newPrivacyMode, setNewPrivacyMode] = useState<PrivacyMode>("public");
  const [newRevealAt, setNewRevealAt] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Checkout loading state
  const [checkoutAlbumId, setCheckoutAlbumId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(0);

  const loadAlbums = useCallback(async () => {
    await Promise.resolve();
    setNowMs(Date.now());
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/albums", { cache: "no-store" });
      if (res.status === 401) {
        // Fallback to demo album if viewing unauthenticated in preview
        setAlbums([DEMO_FULL_ALBUM]);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as AlbumsListResponse | { error?: { message?: string } };
      if (!res.ok || !("albums" in data)) {
        throw new Error(("error" in data && data.error?.message) || "Failed to load albums.");
      }
      setAlbums(data.albums);
      setMaxAlbums(data.maxAlbumsPerAccount);
      setActorEmail(data.actorEmail);
      setIsSuperAdmin(data.isSuperAdmin);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load albums.");
      setAlbums([DEMO_FULL_ALBUM]);
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
    const generated = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    if (generated.length >= 3) {
      setNewSlug(generated);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          slug: newSlug.trim().toLowerCase(),
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
      setNewDate("");
      setNewRevealAt("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create album.");
    } finally {
      setCreating(false);
    }
  };

  const handleStartCheckout = async (albumId: string, planTier: PlanTier) => {
    setCheckoutAlbumId(albumId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId, planTier }),
      });
      const data = (await res.json()) as CheckoutSessionResponse | { error?: { message?: string } };
      if (!res.ok || !("checkoutUrl" in data)) {
        throw new Error(("error" in data && data.error?.message) || "Checkout failed.");
      }
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not initiate checkout.");
    } finally {
      setCheckoutAlbumId(null);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-20 text-stone-900">
      {/* Top Navbar */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-serif text-xl font-semibold">
              <Heart className="h-5 w-5 text-amber-700" />
              <span>Wedding QR Studio</span>
            </Link>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
              Couple Studio
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isSuperAdmin ? (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-800"
              >
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                Master Admin Portal
              </Link>
            ) : null}
            {actorEmail ? (
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-stone-500">{actorEmail}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await getSupabaseBrowserClient().auth.signOut();
                    } finally {
                      window.location.replace("/login");
                    }
                  }}
                  className="flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-full border border-stone-300 px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-10">
        {/* Header & Quota Meter */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Your Wedding Events
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Event Albums & QR Galleries
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              Create up to {maxAlbums} separate albums per account (e.g., Engagement, Welcome
              Dinner, Ceremony, Reception, Farewell Brunch).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full border border-stone-200 bg-white px-3.5 py-2 text-xs font-medium text-stone-600">
              {albums.length} / {maxAlbums} Albums Used
            </span>
            <button
              type="button"
              disabled={albums.length >= maxAlbums && !isSuperAdmin}
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-full bg-amber-700 px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-amber-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              New Event Album
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-16 flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
            <p className="mt-3 text-sm text-stone-500">Loading your wedding albums…</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {albums.map((album) => {
              const isDisposableActive =
                album.reveal_at !== null && Date.parse(album.reveal_at) > nowMs;
              return (
                <article
                  key={album.id}
                  className="flex flex-col justify-between rounded-3xl border border-stone-200 bg-white p-6 shadow-xs transition hover:shadow-md"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                          {album.plan_tier}
                        </span>
                        {album.is_paid ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                            Paid · Active 24 Mo
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                            Trial / Unpaid
                          </span>
                        )}
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
                            Public Gallery
                          </span>
                        )}
                      </div>
                    </div>

                    <h2 className="mt-4 font-serif text-2xl font-semibold text-stone-900">
                      {album.title}
                    </h2>
                    <p className="mt-1 font-mono text-xs text-stone-500">/e/{album.slug}</p>

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
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-amber-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-amber-800"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        Create &amp; Print QR Card
                      </Link>

                      <Link
                        href={`/dashboard/${album.id}`}
                        className="flex items-center justify-center gap-1.5 rounded-full bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-stone-800"
                      >
                        Manage Album
                      </Link>

                      <Link
                        href={`/admin/events/${album.id}/builder`}
                        className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
                      >
                        <Sliders className="h-3.5 w-3.5 text-amber-700" />
                        Flow &amp; Theme Builder
                      </Link>

                      <Link
                        href={`/e/${album.slug}`}
                        target="_blank"
                        className="flex items-center gap-1 rounded-full border border-stone-200 px-3.5 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
                        title="Open Guest Experience"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    {!album.is_paid ? (
                      <div className="flex items-center justify-between rounded-2xl bg-amber-50/90 px-4 py-2.5 text-xs">
                        <span className="font-medium text-amber-950">
                          Unlock 24-month retention & unlimited high-res downloads:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={checkoutAlbumId === album.id}
                            onClick={() => void handleStartCheckout(album.id, "pro")}
                            className="rounded-full bg-amber-700 px-3 py-1 font-semibold text-white hover:bg-amber-800"
                          >
                            Pro $69
                          </button>
                          <button
                            type="button"
                            disabled={checkoutAlbumId === album.id}
                            onClick={() => void handleStartCheckout(album.id, "unlimited")}
                            className="rounded-full bg-stone-900 px-3 py-1 font-semibold text-white hover:bg-stone-800"
                          >
                            Unlimited $99
                          </button>
                        </div>
                      </div>
                    ) : null}
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
        >
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-7 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-amber-700" />
                <h2 className="font-serif text-xl font-semibold">Create Wedding Event Album</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs font-medium text-stone-400 hover:text-stone-700"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateAlbum(e)} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700">
                  Event Title (e.g., Welcome Party, Wedding Reception, Sunday Brunch)
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => handleTitleChangeAutoSlug(e.target.value)}
                  placeholder="Clara & Julian — Wedding Reception"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-stone-700">
                    Custom QR URL Slug
                  </label>
                  <div className="mt-1 flex items-center rounded-xl border border-stone-300 bg-stone-50 px-3 py-2.5 text-sm">
                    <span className="text-xs text-stone-400">/e/</span>
                    <input
                      type="text"
                      required
                      value={newSlug}
                      onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
                      placeholder="clara-and-julian"
                      className="w-full bg-transparent text-sm text-stone-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700">Event Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-stone-700">Privacy Mode</label>
                  <select
                    value={newPrivacyMode}
                    onChange={(e) => setNewPrivacyMode(e.target.value as PrivacyMode)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700"
                  >
                    <option value="public">Public Gallery (Guests can browse)</option>
                    <option value="private">Private Vault (Only Couple sees uploads)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700">
                    Disposable Camera Reveal (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newRevealAt}
                    onChange={(e) => setNewRevealAt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              {createError ? (
                <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{createError}</p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-full border border-stone-300 px-5 py-2.5 text-xs font-medium text-stone-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 rounded-full bg-amber-700 px-6 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-amber-800 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Create Album
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
