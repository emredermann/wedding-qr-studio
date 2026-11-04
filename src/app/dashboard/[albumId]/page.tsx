"use client";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckSquare,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Loader2,
  Mail,
  QrCode,
  Save,
  Settings,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  UserPlus,
  Users,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { QrCardBuilder } from "@/components/QrCardBuilder";
import { formatBytes } from "@/lib/media-config";
import { groupDuplicateMediaByPhash } from "@/lib/phash";
import type {
  Album,
  CoHost,
  GuestRegistration,
  Media,
  MediaCategory,
  PrivacyMode,
} from "@/types/database";

type StudioTab = "moderation" | "duplicates" | "qr_studio" | "settings" | "guests";

interface AlbumDetailResponse {
  album: Album;
  media: Media[];
  coHosts: CoHost[];
  guestRegistrations: GuestRegistration[];
  isOwner: boolean;
}

export default function AlbumManagementPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
          <p className="mt-3 text-sm text-stone-600">Loading Album Studio…</p>
        </div>
      }
    >
      <AlbumManagementPageContent />
    </Suspense>
  );
}

function AlbumManagementPageContent() {
  const params = useParams<{ albumId: string }>();
  const albumId = typeof params.albumId === "string" ? params.albumId : "";

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [coHosts, setCoHosts] = useState<CoHost[]>([]);
  const [guestRegistrations, setGuestRegistrations] = useState<GuestRegistration[]>([]);
  const [isOwner, setIsOwner] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<StudioTab>(() => {
    if (typeof window === "undefined") return "moderation";
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (
      tab === "moderation" ||
      tab === "duplicates" ||
      tab === "qr_studio" ||
      tab === "settings" ||
      tab === "guests"
    ) {
      return tab;
    }
    return "moderation";
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterVisibility, setFilterVisibility] = useState<"all" | "visible" | "hidden">("all");
  const [filterCategory, setFilterCategory] = useState<"all" | MediaCategory>("all");
  const [actionBusy, setActionBusy] = useState<boolean>(false);

  // Settings form state
  const [titleInput, setTitleInput] = useState<string>("");
  const [slugInput, setSlugInput] = useState<string>("");
  const [eventDateInput, setEventDateInput] = useState<string>("");
  const [privacyModeInput, setPrivacyModeInput] = useState<PrivacyMode>("public");
  const [revealAtInput, setRevealAtInput] = useState<string>("");
  const [coHostEmailInput, setCoHostEmailInput] = useState<string>("");
  const [settingsSavedBanner, setSettingsSavedBanner] = useState<string | null>(null);

  const loadAlbumDetail = useCallback(async () => {
    if (!albumId) return;
    await Promise.resolve();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/albums/${encodeURIComponent(albumId)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as AlbumDetailResponse | { error?: { message?: string } };
      if (!res.ok || !("album" in data)) {
        throw new Error(("error" in data && data.error?.message) || "Could not load album.");
      }
      setAlbum(data.album);
      setMedia(data.media);
      setCoHosts(data.coHosts);
      setGuestRegistrations(data.guestRegistrations);
      setIsOwner(data.isOwner);

      setTitleInput(data.album.title);
      setSlugInput(data.album.slug);
      setEventDateInput(data.album.event_date ?? "");
      setPrivacyModeInput(data.album.privacy_mode);
      setRevealAtInput(
        data.album.reveal_at ? new Date(data.album.reveal_at).toISOString().slice(0, 16) : "",
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load album.");
    } finally {
      setLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAlbumDetail();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAlbumDetail]);

  const filteredMedia = useMemo(() => {
    return media.filter((item) => {
      if (filterVisibility === "visible" && item.is_hidden) return false;
      if (filterVisibility === "hidden" && !item.is_hidden) return false;
      if (filterCategory !== "all" && item.category !== filterCategory) return false;
      return true;
    });
  }, [filterCategory, filterVisibility, media]);

  const duplicateGroups = useMemo(() => groupDuplicateMediaByPhash(media, 10), [media]);

  const totalStorageBytes = useMemo(
    () => media.reduce((sum, item) => sum + (item.size_bytes || 0), 0),
    [media],
  );

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllInView = () => {
    const viewIds = filteredMedia.map((m) => m.id);
    const allSelected = viewIds.length > 0 && viewIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(viewIds));
    }
  };

  const handleBulkHideToggle = async (hide: boolean, targetIds?: string[]) => {
    const ids = targetIds ?? Array.from(selectedIds);
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/albums/${encodeURIComponent(albumId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hide ? { hideMediaIds: ids } : { unhideMediaIds: ids }),
      });
      if (res.ok) {
        const idSet = new Set(ids);
        setMedia((prev) =>
          prev.map((m) => (idSet.has(m.id) ? { ...m, is_hidden: hide } : m)),
        );
        setSelectedIds(new Set());
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleBulkPermanentDelete = async (targetIds?: string[]) => {
    const ids = targetIds ?? Array.from(selectedIds);
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/albums/${encodeURIComponent(albumId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds: ids }),
      });
      if (res.ok) {
        const idSet = new Set(ids);
        setMedia((prev) => prev.filter((m) => !idSet.has(m.id)));
        setSelectedIds(new Set());
      }
    } finally {
      setActionBusy(false);
    }
  };

  const selectAllDuplicateCopiesExceptFirst = () => {
    const duplicateIds: string[] = [];
    for (const group of duplicateGroups) {
      for (let i = 1; i < group.items.length; i += 1) {
        duplicateIds.push(group.items[i].media.id);
      }
    }
    setSelectedIds(new Set(duplicateIds));
  };

  const handleSaveAlbumSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    setSettingsSavedBanner(null);
    try {
      const res = await fetch(`/api/albums/${encodeURIComponent(albumId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleInput.trim(),
          slug: slugInput.trim().toLowerCase(),
          eventDate: eventDateInput || null,
          privacyMode: privacyModeInput,
          revealAt: revealAtInput ? new Date(revealAtInput).toISOString() : null,
        }),
      });
      const data = (await res.json()) as { album?: Album; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to save settings.");
      }
      if (data.album) setAlbum(data.album);
      setSettingsSavedBanner("Album settings saved.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleInviteCoHost = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = coHostEmailInput.trim().toLowerCase();
    if (!email) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/albums/${encodeURIComponent(albumId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addCoHostEmail: email }),
      });
      if (res.ok) {
        setCoHostEmailInput("");
        await loadAlbumDetail();
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleRemoveCoHost = async (coHostId: string) => {
    setActionBusy(true);
    try {
      await fetch(`/api/albums/${encodeURIComponent(albumId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeCoHostId: coHostId }),
      });
      setCoHosts((prev) => prev.filter((c) => c.id !== coHostId));
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
        <p className="mt-3 text-sm text-stone-600">Loading Album Studio…</p>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <h1 className="mt-3 font-serif text-2xl font-semibold">Album Not Found</h1>
        <p className="mt-1 text-xs text-stone-500">{errorMessage}</p>
        <Link
          href="/dashboard"
          className="mt-5 rounded-full bg-stone-900 px-5 py-2.5 text-xs font-semibold text-white"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20 text-stone-900">
      {/* Top Studio Bar */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-stone-200 p-2 text-stone-600 transition hover:bg-stone-100"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="font-serif text-xl font-semibold">{album.title}</h1>
              <p className="font-mono text-xs text-stone-500">
                /e/{album.slug} · {media.length} uploads · {formatBytes(totalStorageBytes)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={`/admin/events/${album.id}/builder`}
              className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
            >
              <Sliders className="h-3.5 w-3.5 text-amber-700" />
              Event Flow & Theme Builder
            </Link>

            <Link
              href={`/e/${album.slug}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Live Guest Page
            </Link>

            <a
              href={`/api/albums/${encodeURIComponent(album.id)}/download`}
              className="flex items-center gap-2 rounded-full bg-amber-700 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-800"
            >
              <Download className="h-3.5 w-3.5" />
              Download All (Streaming ZIP)
            </a>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("moderation")}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "moderation"
                ? "border-amber-700 text-amber-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            Media Moderation ({media.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("duplicates")}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "duplicates"
                ? "border-amber-700 text-amber-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate Review ({duplicateGroups.length} groups)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("qr_studio")}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "qr_studio"
                ? "border-amber-700 text-amber-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <QrCode className="h-3.5 w-3.5" />
            Print QR Table Card Studio (300 DPI)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "settings"
                ? "border-amber-700 text-amber-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            Settings, Privacy & Co-Hosts ({coHosts.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("guests")}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === "guests"
                ? "border-amber-700 text-amber-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Guestbook Sign-Ins ({guestRegistrations.length})
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-8">
        {/* ================================================================= */}
        {/* TAB 1: MEDIA MODERATION GRID                                      */}
        {/* ================================================================= */}
        {activeTab === "moderation" ? (
          <section>
            {/* Bulk Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAllInView}
                  className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {selectedIds.size > 0 ? `Selected (${selectedIds.size})` : "Select All in View"}
                </button>

                <select
                  value={filterVisibility}
                  onChange={(e) =>
                    setFilterVisibility(e.target.value as "all" | "visible" | "hidden")
                  }
                  className="rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700"
                >
                  <option value="all">Status: All ({media.length})</option>
                  <option value="visible">
                    Visible ({media.filter((m) => !m.is_hidden).length})
                  </option>
                  <option value="hidden">
                    Hidden / Pending ({media.filter((m) => m.is_hidden).length})
                  </option>
                </select>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as "all" | MediaCategory)}
                  className="rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700"
                >
                  <option value="all">Category: All Moments</option>
                  <option value="getting_ready">Getting Ready</option>
                  <option value="ceremony">Ceremony</option>
                  <option value="reception">Reception</option>
                  <option value="party">Party</option>
                  <option value="venue">Venue</option>
                  <option value="general">General</option>
                </select>
              </div>

              {selectedIds.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleBulkHideToggle(false)}
                    className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Approve / Unhide ({selectedIds.size})
                  </button>

                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleBulkHideToggle(true)}
                    className="flex items-center gap-1.5 rounded-full bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Hide from Public ({selectedIds.size})
                  </button>

                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleBulkPermanentDelete()}
                    className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Permanently (R2 + DB)
                  </button>
                </div>
              ) : null}
            </div>

            {/* Grid */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {filteredMedia.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <article
                    key={item.id}
                    className={`group relative overflow-hidden rounded-2xl border bg-white shadow-2xs transition ${
                      isSelected
                        ? "border-amber-700 ring-2 ring-amber-700/30"
                        : "border-stone-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelectOne(item.id)}
                      className="absolute top-2.5 left-2.5 z-10 rounded-lg bg-black/65 p-1.5 text-white backdrop-blur-xs"
                      aria-label="Select media item"
                    >
                      {isSelected ? (
                        <Check className="h-4 w-4 text-amber-400" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>

                    {item.is_hidden ? (
                      <span className="absolute top-2.5 right-2.5 z-10 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-stone-950">
                        Hidden
                      </span>
                    ) : null}

                    {item.media_type === "photo" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.file_url}
                        alt={item.guest_name || "Guest upload"}
                        loading="lazy"
                        onClick={() => toggleSelectOne(item.id)}
                        className={`aspect-square w-full cursor-pointer object-cover ${
                          item.is_hidden ? "opacity-55 grayscale" : ""
                        }`}
                      />
                    ) : null}

                    {item.media_type === "video" ? (
                      <div className="relative aspect-square w-full bg-stone-950">
                        <video
                          src={item.file_url}
                          controls
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                        <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
                          <Film className="h-3 w-3" />
                          Video
                        </span>
                      </div>
                    ) : null}

                    {item.media_type === "audio" ? (
                      <div className="flex aspect-square flex-col justify-between bg-stone-900 p-4 text-white">
                        <div className="mt-7 flex items-center gap-1.5 text-amber-400">
                          <Volume2 className="h-4 w-4" />
                          <span className="text-xs font-semibold">Voice Toast</span>
                        </div>
                        <audio src={item.file_url} controls className="w-full" />
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between border-t border-stone-100 px-3 py-2 text-xs">
                      <div className="truncate">
                        <p className="truncate font-semibold text-stone-800">
                          {item.guest_name || "Guest"}
                        </p>
                        <p className="text-[10px] capitalize text-stone-500">
                          {item.category.replace("_", " ")} · {formatBytes(item.size_bytes)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleBulkHideToggle(!item.is_hidden, [item.id])}
                          className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                          title={item.is_hidden ? "Approve / Unhide" : "Hide from public"}
                        >
                          {item.is_hidden ? (
                            <Eye className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleBulkPermanentDelete([item.id])}
                          className="rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Permanently delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ================================================================= */}
        {/* TAB 2: DUPLICATE REVIEW (Perceptual Hash Proximity Grouping)      */}
        {/* ================================================================= */}
        {activeTab === "duplicates" ? (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-700" />
                  <h2 className="text-base font-semibold">
                    64-Bit Perceptual Hash (`pHash`) Duplicate Review
                  </h2>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  Groups burst shots and visually identical uploads whose 64-bit difference hashes
                  have a Hamming distance ≤ 10 bits.
                </p>
              </div>

              {duplicateGroups.length > 0 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllDuplicateCopiesExceptFirst}
                    className="rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100"
                  >
                    Select Extra Copies (Keep 1 Best per Group)
                  </button>

                  {selectedIds.size > 0 ? (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleBulkPermanentDelete()}
                      className="flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Selected Duplicates ({selectedIds.size})
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {duplicateGroups.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-12 text-center">
                <Check className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-2 text-sm font-semibold">No Near-Duplicate Photos Detected</p>
                <p className="mt-1 text-xs text-stone-500">
                  Every photo in your album has a distinct perceptual signature.
                </p>
              </div>
            ) : (
              duplicateGroups.map((group, groupIdx) => (
                <div
                  key={group.anchorId}
                  className="rounded-3xl border border-stone-200 bg-white p-5 shadow-2xs"
                >
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <span className="text-xs font-semibold text-stone-800">
                      Duplicate Cluster #{groupIdx + 1} · {group.items.length} visually identical
                      shots
                    </span>
                    <span className="font-mono text-[11px] text-stone-400">
                      pHash: {group.anchorPhash}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {group.items.map(({ media: item, distanceFromAnchor }, idx) => {
                      const isSelected = selectedIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleSelectOne(item.id)}
                          className={`cursor-pointer overflow-hidden rounded-2xl border transition ${
                            isSelected
                              ? "border-rose-600 ring-2 ring-rose-600/30"
                              : "border-stone-200"
                          }`}
                        >
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.file_url}
                              alt="Duplicate candidate"
                              className="aspect-square w-full object-cover"
                            />
                            <span
                              className={`absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                idx === 0
                                  ? "bg-emerald-600 text-white"
                                  : "bg-stone-900/80 text-amber-300"
                              }`}
                            >
                              {idx === 0
                                ? "Primary Keep"
                                : `Δ ${distanceFromAnchor} bit(s) · ${
                                    isSelected ? "Marked to Delete" : "Click to Select"
                                  }`}
                            </span>
                          </div>
                          <div className="p-2.5 text-[11px] text-stone-600">
                            <p className="font-medium">{item.guest_name || "Guest"}</p>
                            <p className="font-mono text-[10px] text-stone-400">
                              {item.phash} · {formatBytes(item.size_bytes)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </section>
        ) : null}

        {/* ================================================================= */}
        {/* TAB 3: HIGH-DPI PRINT QR TABLE CARD STUDIO                        */}
        {/* ================================================================= */}
        {activeTab === "qr_studio" ? (
          <QrCardBuilder
            albumSlug={album.slug}
            defaultCoupleNames={album.title.split("—")[0]?.trim() || album.title}
            defaultEventDate={album.event_date}
            eventThemeConfig={album.theme_config}
          />
        ) : null}

        {/* ================================================================= */}
        {/* TAB 4: SETTINGS, PRIVACY, DISPOSABLE CAMERA & CO-HOSTS            */}
        {/* ================================================================= */}
        {activeTab === "settings" ? (
          <div className="grid gap-8 lg:grid-cols-12">
            <form
              onSubmit={(e) => void handleSaveAlbumSettings(e)}
              className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-2xs lg:col-span-7"
            >
              <h2 className="font-serif text-xl font-semibold">
                Event Configuration & Disposable Camera Mode
              </h2>

              <div>
                <label className="block text-xs font-medium text-stone-700">Event Title</label>
                <input
                  type="text"
                  required
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-stone-700">Custom QR Slug</label>
                  <input
                    type="text"
                    required
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700">Event Date</label>
                  <input
                    type="date"
                    value={eventDateInput}
                    onChange={(e) => setEventDateInput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-stone-700">Privacy Mode</label>
                  <select
                    value={privacyModeInput}
                    onChange={(e) => setPrivacyModeInput(e.target.value as PrivacyMode)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm"
                  >
                    <option value="public">
                      Biometric Face Gate (Guests unlock only photos of themselves)
                    </option>
                    <option value="private">
                      Vault Only (Uploads open; only Couple &amp; Co-Hosts view)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700">
                    Disposable Camera Reveal Timestamp
                  </label>
                  <input
                    type="datetime-local"
                    value={revealAtInput}
                    onChange={(e) => setRevealAtInput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-stone-500">
                    Leave blank for instant live gallery, or set a future time to lock the gallery
                    until the morning after!
                  </p>
                </div>
              </div>

              {settingsSavedBanner ? (
                <p className="rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                  {settingsSavedBanner}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={actionBusy}
                className="flex items-center gap-2 rounded-full bg-amber-700 px-6 py-3 text-xs font-semibold text-white shadow-md hover:bg-amber-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save Event Settings
              </button>
            </form>

            {/* Co-Host Invitations */}
            <div className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-2xs lg:col-span-5">
              <div>
                <h2 className="font-serif text-xl font-semibold">Invite Co-Hosts</h2>
                <p className="mt-1 text-xs text-stone-500">
                  Co-hosts (your partner, wedding planner, or photographer) can moderate uploads and
                  download the full-resolution ZIP archive.
                </p>
              </div>

              {isOwner ? (
                <form onSubmit={(e) => void handleInviteCoHost(e)} className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-stone-400" />
                    <input
                      type="email"
                      required
                      value={coHostEmailInput}
                      onChange={(e) => setCoHostEmailInput(e.target.value)}
                      placeholder="partner@email.com"
                      className="w-full rounded-xl border border-stone-300 py-2.5 pr-3 pl-9 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={actionBusy}
                    className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-stone-800"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Invite
                  </button>
                </form>
              ) : null}

              <ul className="divide-y divide-stone-100 text-xs">
                {coHosts.length === 0 ? (
                  <li className="py-4 text-stone-400">No co-hosts invited yet.</li>
                ) : (
                  coHosts.map((coHost) => (
                    <li key={coHost.id} className="flex items-center justify-between py-3">
                      <span className="font-medium text-stone-800">{coHost.email}</span>
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => void handleRemoveCoHost(coHost.id)}
                          className="text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        ) : null}

        {/* ================================================================= */}
        {/* TAB 5: GUESTBOOK SIGN-INS                                         */}
        {/* ================================================================= */}
        {activeTab === "guests" ? (
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-2xs">
            <h2 className="font-serif text-xl font-semibold">
              Registered Wedding Guests ({guestRegistrations.length})
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              Guests who signed in during the onboarding flow to receive gallery updates.
            </p>

            {guestRegistrations.length === 0 ? (
              <p className="mt-6 text-xs text-stone-400">
                No guest sign-in submissions recorded yet.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-2.5 pr-4">Guest Name</th>
                      <th className="py-2.5 pr-4">WhatsApp / Email</th>
                      <th className="py-2.5 pr-4">Table</th>
                      <th className="py-2.5">Signed In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {guestRegistrations.map((reg) => (
                      <tr key={reg.id}>
                        <td className="py-2.5 pr-4 font-medium">{reg.guest_name || "—"}</td>
                        <td className="py-2.5 pr-4">{reg.contact || "—"}</td>
                        <td className="py-2.5 pr-4">{reg.table_number || "—"}</td>
                        <td className="py-2.5 text-stone-400">
                          {new Date(reg.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
