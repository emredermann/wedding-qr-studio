"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  Check,
  ExternalLink,
  Heart,
  Layers,
  Loader2,
  Mic,
  Palette,
  QrCode,
  Save,
  ScanFace,
  ShieldCheck,
  Sliders,
  Smartphone,
  Upload,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { DEMO_ALBUM_ID, DEMO_MEDIA_ITEMS } from "@/lib/demo-data";
import type { Album, PresignUploadResponse } from "@/types/database";
import {
  BUTTON_STYLES,
  type BiometricOptInStep,
  type ButtonStyle,
  DEFAULT_FLOW_CONFIG,
  DEFAULT_THEME_CONFIG,
  type EventFlowConfig,
  type EventThemeConfig,
  type FeatureToggles,
  type FlowStepConfig,
  type FlowStepType,
  GALLERY_LAYOUTS,
  type GalleryLayout,
  type GuestRegistrationStep,
  type MainHubStep,
  THEME_FONTS,
  type ThemeFontFamily,
  type WelcomeSplashStep,
} from "@/types/flow";

type BuilderTab = "sequencer" | "theme" | "features";

function getButtonRadiusClass(style: ButtonStyle): string {
  switch (style) {
    case "pill":
      return "rounded-full";
    case "sharp":
      return "rounded-none";
    case "rounded":
    default:
      return "rounded-xl";
  }
}

function getFontFamilyClass(font: ThemeFontFamily): string {
  switch (font) {
    case "serif":
      return "font-serif";
    case "mono":
      return "font-mono";
    case "display":
      return "font-serif tracking-wide";
    case "sans":
    default:
      return "font-sans";
  }
}

export default function EventFlowBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-stone-950 p-6 text-stone-200">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
          <p className="mt-3 text-sm">Loading Visual Event Flow &amp; Screen Studio…</p>
        </div>
      }
    >
      <EventFlowBuilderPageContent />
    </Suspense>
  );
}

function EventFlowBuilderPageContent() {
  const params = useParams<{ albumId: string }>();
  const albumId = typeof params.albumId === "string" ? params.albumId : "";

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [album, setAlbum] = useState<Album | null>(null);
  const [themeConfig, setThemeConfig] = useState<EventThemeConfig>(DEFAULT_THEME_CONFIG);
  const [flowConfig, setFlowConfig] = useState<EventFlowConfig>(DEFAULT_FLOW_CONFIG);

  const [activeTab, setActiveTab] = useState<BuilderTab>("sequencer");
  const [selectedStepType, setSelectedStepType] = useState<FlowStepType>("welcome_splash");
  const [uploadingAssetField, setUploadingAssetField] = useState<"logoUrl" | "coverMediaUrl" | null>(
    null,
  );

  const loadBuilderState = useCallback(async () => {
    if (!albumId) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const res = await fetch(`/api/albums/${encodeURIComponent(albumId)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { album?: Album; error?: { message?: string } };
      if (!res.ok || !data.album) {
        throw new Error(data.error?.message || "Failed to load event configuration.");
      }
      setAlbum(data.album);
      setThemeConfig(data.album.theme_config);
      setFlowConfig(data.album.flow_config);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load builder.");
    } finally {
      setLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBuilderState();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBuilderState]);

  const handleSaveConfiguration = async () => {
    if (!album) return;
    setSaving(true);
    setSavedNotice(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/albums/${encodeURIComponent(album.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeConfig,
          flowConfig,
        }),
      });
      const data = (await res.json()) as { album?: Album; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(data.error?.message || "Could not save configuration.");
      }
      if (data.album) setAlbum(data.album);
      setSavedNotice("Published to live guest page!");
      window.setTimeout(() => setSavedNotice(null), 3500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  };

  // Upload Logo or Cover Media directly to Cloudflare R2 via Presigned PUT URL
  const handleUploadBrandAsset = async (
    field: "logoUrl" | "coverMediaUrl",
    file: File,
  ) => {
    if (!album) return;
    setUploadingAssetField(field);
    setErrorMessage(null);

    try {
      if (album.id === DEMO_ALBUM_ID) {
        const localPreviewUrl = URL.createObjectURL(file);
        setThemeConfig((prev) => ({ ...prev, [field]: localPreviewUrl }));
        return;
      }

      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albumId: album.id,
          fileName: file.name,
          fileType: file.type || "image/jpeg",
          fileSize: file.size,
        }),
      });

      const presignData = (await presignRes.json()) as
        | PresignUploadResponse
        | { error?: { message?: string } };
      if (!presignRes.ok || !("uploadUrl" in presignData)) {
        throw new Error(
          ("error" in presignData && presignData.error?.message) ||
            "Could not sign brand asset upload.",
        );
      }

      const putRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: presignData.headers,
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Cloudflare R2 upload failed (${putRes.status}).`);
      }

      setThemeConfig((prev) => ({ ...prev, [field]: presignData.publicUrl }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Asset upload failed.");
    } finally {
      setUploadingAssetField(null);
    }
  };

  // Step Sequencer helpers
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= flowConfig.steps.length) return;
    const nextSteps = [...flowConfig.steps];
    const [moved] = nextSteps.splice(index, 1);
    nextSteps.splice(target, 0, moved);
    setFlowConfig((prev) => ({ ...prev, steps: nextSteps }));
  };

  const toggleStepEnabled = (type: FlowStepType) => {
    if (type === "main_hub") return; // main_hub is always required
    setFlowConfig((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.type === type ? { ...s, enabled: !s.enabled } : s)),
    }));
  };

  const updateStepConfig = (updated: FlowStepConfig) => {
    setFlowConfig((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.type === updated.type ? updated : s)),
    }));
  };

  const updateFeatureToggle = <K extends keyof FeatureToggles>(
    key: K,
    value: FeatureToggles[K],
  ) => {
    setFlowConfig((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [key]: value,
      },
    }));
  };

  if (loading || !album) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-stone-950 p-6 text-stone-200">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        <p className="mt-3 text-sm">Loading Visual Event Flow &amp; Screen Studio…</p>
      </div>
    );
  }

  const activePreviewStep =
    flowConfig.steps.find((s) => s.type === selectedStepType) ?? flowConfig.steps[0];
  const btnRadius = getButtonRadiusClass(themeConfig.buttonStyle);
  const fontClass = getFontFamilyClass(themeConfig.fontFamily);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Top Studio Header */}
      <header className="sticky top-0 z-30 border-b border-stone-800 bg-stone-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="rounded-full border border-stone-700 p-2 text-stone-300 transition hover:bg-stone-800"
              aria-label="Back to admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Visual Event Flow &amp; Screen Studio
                </span>
                <span className="font-mono text-xs text-stone-500">/e/{album.slug}</span>
              </div>
              <h1 className="font-serif text-lg font-semibold">{album.title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {savedNotice ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                {savedNotice}
              </span>
            ) : null}

            <Link
              href={`/dashboard/${album.id}?tab=qr_studio`}
              className="flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-4 py-2 text-xs font-semibold text-stone-200 hover:bg-stone-800"
            >
              <QrCode className="h-3.5 w-3.5 text-amber-400" />
              QR Card Studio
            </Link>

            <Link
              href={`/e/${album.slug}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 px-4 py-2 text-xs font-semibold text-stone-200 hover:bg-stone-800"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Live Guest Page
            </Link>

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveConfiguration()}
              className="flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-md transition hover:bg-amber-500 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Publish Flow &amp; Theme
            </button>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div className="mx-auto mt-4 max-w-7xl px-6">
          <div className="rounded-2xl border border-rose-800 bg-rose-950/70 p-3 text-xs text-rose-200">
            {errorMessage}
          </div>
        </div>
      ) : null}

      {/* Split-Screen Interactive Studio */}
      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-12">
        {/* ================================================================= */}
        {/* LEFT PANEL: CONFIGURATION CONTROLS (7 cols)                       */}
        {/* ================================================================= */}
        <div className="space-y-6 lg:col-span-7">
          {/* Control Section Switcher */}
          <div className="grid grid-cols-3 rounded-2xl border border-stone-800 bg-stone-900 p-1.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("sequencer")}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition ${
                activeTab === "sequencer"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <Layers className="h-4 w-4" />
              1. Flow Sequencer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("theme")}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition ${
                activeTab === "theme"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <Palette className="h-4 w-4" />
              2. Theme &amp; Branding
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("features")}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition ${
                activeTab === "features"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <Sliders className="h-4 w-4" />
              3. Rules &amp; Toggles
            </button>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* LEFT TAB 1: FLOW SEQUENCER                                      */}
          {/* --------------------------------------------------------------- */}
          {activeTab === "sequencer" ? (
            <div className="space-y-6">
              <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
                <h2 className="font-serif text-lg font-semibold">
                  Guest Onboarding Screen Sequence
                </h2>
                <p className="mt-1 text-xs text-stone-400">
                  Enable, disable, or reorder the screens guests experience when scanning the QR
                  code. Click any step to edit its copy and preview it live on the iPhone 16 Pro
                  frame.
                </p>

                <div className="mt-4 space-y-2.5">
                  {flowConfig.steps.map((step, idx) => {
                    const isSelected = step.type === selectedStepType;
                    return (
                      <div
                        key={step.id}
                        onClick={() => setSelectedStepType(step.type)}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                          isSelected
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-stone-800 bg-stone-950/70 hover:border-stone-700"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-800 font-mono text-xs font-bold text-amber-400">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-white">{step.title}</p>
                            <p className="font-mono text-[11px] text-stone-400">{step.type}</p>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveStep(idx, -1)}
                            className="rounded-lg border border-stone-700 p-1.5 text-stone-300 hover:bg-stone-800 disabled:opacity-30"
                            aria-label="Move step up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={idx === flowConfig.steps.length - 1}
                            onClick={() => moveStep(idx, 1)}
                            className="rounded-lg border border-stone-700 p-1.5 text-stone-300 hover:bg-stone-800 disabled:opacity-30"
                            aria-label="Move step down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>

                          <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={step.enabled}
                              disabled={step.type === "main_hub"}
                              onChange={() => toggleStepEnabled(step.type)}
                              className="h-4 w-4 accent-amber-500"
                            />
                            <span className="text-stone-300">
                              {step.enabled ? "Active" : "Skipped"}
                            </span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Step Inspector */}
              <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
                <h3 className="font-serif text-lg font-semibold">
                  Customize Step: {activePreviewStep.title}
                </h3>

                {activePreviewStep.type === "welcome_splash" ? (
                  <div className="mt-4 space-y-4 text-xs">
                    <div>
                      <label className="block font-medium text-stone-300">Splash Headline</label>
                      <input
                        type="text"
                        value={(activePreviewStep as WelcomeSplashStep).settings.headline}
                        onChange={(e) =>
                          updateStepConfig({
                            ...(activePreviewStep as WelcomeSplashStep),
                            settings: {
                              ...(activePreviewStep as WelcomeSplashStep).settings,
                              headline: e.target.value,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-stone-300">Greeting Subtitle</label>
                      <textarea
                        rows={2}
                        value={(activePreviewStep as WelcomeSplashStep).settings.subtitle}
                        onChange={(e) =>
                          updateStepConfig({
                            ...(activePreviewStep as WelcomeSplashStep),
                            settings: {
                              ...(activePreviewStep as WelcomeSplashStep).settings,
                              subtitle: e.target.value,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2 text-sm text-white"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-medium text-stone-300">CTA Button Text</label>
                        <input
                          type="text"
                          value={(activePreviewStep as WelcomeSplashStep).settings.ctaText}
                          onChange={(e) =>
                            updateStepConfig({
                              ...(activePreviewStep as WelcomeSplashStep),
                              settings: {
                                ...(activePreviewStep as WelcomeSplashStep).settings,
                                ctaText: e.target.value,
                              },
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>
                      <label className="mt-6 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={(activePreviewStep as WelcomeSplashStep).settings.showEventDate}
                          onChange={(e) =>
                            updateStepConfig({
                              ...(activePreviewStep as WelcomeSplashStep),
                              settings: {
                                ...(activePreviewStep as WelcomeSplashStep).settings,
                                showEventDate: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-amber-500"
                        />
                        <span>Display Event Date Above Headline</span>
                      </label>
                    </div>
                  </div>
                ) : null}

                {activePreviewStep.type === "guest_registration" ? (
                  <div className="mt-4 space-y-4 text-xs">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block font-medium text-stone-300">Form Title</label>
                        <input
                          type="text"
                          value={(activePreviewStep as GuestRegistrationStep).settings.title}
                          onChange={(e) =>
                            updateStepConfig({
                              ...(activePreviewStep as GuestRegistrationStep),
                              settings: {
                                ...(activePreviewStep as GuestRegistrationStep).settings,
                                title: e.target.value,
                              },
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-stone-300">
                          Contact Field Label
                        </label>
                        <input
                          type="text"
                          value={
                            (activePreviewStep as GuestRegistrationStep).settings.contactLabel
                          }
                          onChange={(e) =>
                            updateStepConfig({
                              ...(activePreviewStep as GuestRegistrationStep),
                              settings: {
                                ...(activePreviewStep as GuestRegistrationStep).settings,
                                contactLabel: e.target.value,
                              },
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={(activePreviewStep as GuestRegistrationStep).settings.mandatory}
                          onChange={(e) =>
                            updateStepConfig({
                              ...(activePreviewStep as GuestRegistrationStep),
                              settings: {
                                ...(activePreviewStep as GuestRegistrationStep).settings,
                                mandatory: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-amber-500"
                        />
                        <span>Mandatory (Hide Skip Button)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={(activePreviewStep as GuestRegistrationStep).settings.askName}
                          onChange={(e) =>
                            updateStepConfig({
                              ...(activePreviewStep as GuestRegistrationStep),
                              settings: {
                                ...(activePreviewStep as GuestRegistrationStep).settings,
                                askName: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-amber-500"
                        />
                        <span>Ask Guest Name</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={
                            (activePreviewStep as GuestRegistrationStep).settings.askContact
                          }
                          onChange={(e) =>
                            updateStepConfig({
                              ...(activePreviewStep as GuestRegistrationStep),
                              settings: {
                                ...(activePreviewStep as GuestRegistrationStep).settings,
                                askContact: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-amber-500"
                        />
                        <span>Ask Phone / Email</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={
                            (activePreviewStep as GuestRegistrationStep).settings.askTableNumber
                          }
                          onChange={(e) =>
                            updateStepConfig({
                              ...(activePreviewStep as GuestRegistrationStep),
                              settings: {
                                ...(activePreviewStep as GuestRegistrationStep).settings,
                                askTableNumber: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-amber-500"
                        />
                        <span>Ask Table Number</span>
                      </label>
                    </div>
                  </div>
                ) : null}

                {activePreviewStep.type === "biometric_opt_in" ? (
                  <div className="mt-4 space-y-4 text-xs">
                    <div>
                      <label className="block font-medium text-stone-300">Prompt Title</label>
                      <input
                        type="text"
                        value={(activePreviewStep as BiometricOptInStep).settings.title}
                        onChange={(e) =>
                          updateStepConfig({
                            ...(activePreviewStep as BiometricOptInStep),
                            settings: {
                              ...(activePreviewStep as BiometricOptInStep).settings,
                              title: e.target.value,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-stone-300">Prompt Subtitle</label>
                      <textarea
                        rows={2}
                        value={(activePreviewStep as BiometricOptInStep).settings.subtitle}
                        onChange={(e) =>
                          updateStepConfig({
                            ...(activePreviewStep as BiometricOptInStep),
                            settings: {
                              ...(activePreviewStep as BiometricOptInStep).settings,
                              subtitle: e.target.value,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2 text-sm text-white"
                      />
                    </div>
                  </div>
                ) : null}

                {activePreviewStep.type === "main_hub" ? (
                  <div className="mt-4 space-y-4 text-xs">
                    <div>
                      <label className="block font-medium text-stone-300">Welcome Banner</label>
                      <input
                        type="text"
                        value={(activePreviewStep as MainHubStep).settings.welcomeBanner}
                        onChange={(e) =>
                          updateStepConfig({
                            ...(activePreviewStep as MainHubStep),
                            settings: {
                              ...(activePreviewStep as MainHubStep).settings,
                              welcomeBanner: e.target.value,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-stone-300">
                        Primary Upload Button Label
                      </label>
                      <input
                        type="text"
                        value={(activePreviewStep as MainHubStep).settings.uploadCtaText}
                        onChange={(e) =>
                          updateStepConfig({
                            ...(activePreviewStep as MainHubStep),
                            settings: {
                              ...(activePreviewStep as MainHubStep).settings,
                              uploadCtaText: e.target.value,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* --------------------------------------------------------------- */}
          {/* LEFT TAB 2: THEME & BRANDING                                    */}
          {/* --------------------------------------------------------------- */}
          {activeTab === "theme" ? (
            <div className="space-y-6 rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
              <h2 className="font-serif text-lg font-semibold">
                Event Theme, Colors, Typography &amp; R2 Brand Assets
              </h2>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-stone-300">
                    Primary Brand Color
                  </label>
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2">
                    <input
                      type="color"
                      value={themeConfig.primaryColor}
                      onChange={(e) =>
                        setThemeConfig((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className="h-7 w-9 cursor-pointer border-0 bg-transparent"
                    />
                    <span className="font-mono text-xs">{themeConfig.primaryColor}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-300">
                    Background Color
                  </label>
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2">
                    <input
                      type="color"
                      value={themeConfig.backgroundColor}
                      onChange={(e) =>
                        setThemeConfig((prev) => ({ ...prev, backgroundColor: e.target.value }))
                      }
                      className="h-7 w-9 cursor-pointer border-0 bg-transparent"
                    />
                    <span className="font-mono text-xs">{themeConfig.backgroundColor}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-300">Text Color</label>
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2">
                    <input
                      type="color"
                      value={themeConfig.textColor}
                      onChange={(e) =>
                        setThemeConfig((prev) => ({ ...prev, textColor: e.target.value }))
                      }
                      className="h-7 w-9 cursor-pointer border-0 bg-transparent"
                    />
                    <span className="font-mono text-xs">{themeConfig.textColor}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-stone-300">Font Family</label>
                  <select
                    value={themeConfig.fontFamily}
                    onChange={(e) =>
                      setThemeConfig((prev) => ({
                        ...prev,
                        fontFamily: e.target.value as ThemeFontFamily,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-xs text-white capitalize"
                  >
                    {THEME_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-300">Button Style</label>
                  <select
                    value={themeConfig.buttonStyle}
                    onChange={(e) =>
                      setThemeConfig((prev) => ({
                        ...prev,
                        buttonStyle: e.target.value as ButtonStyle,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-xs text-white capitalize"
                  >
                    {BUTTON_STYLES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-300">Gallery Layout</label>
                  <select
                    value={themeConfig.galleryLayout}
                    onChange={(e) =>
                      setThemeConfig((prev) => ({
                        ...prev,
                        galleryLayout: e.target.value as GalleryLayout,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-xs text-white capitalize"
                  >
                    {GALLERY_LAYOUTS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cover Media & Logo Uploaders (Presigned R2 PUT) */}
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-stone-800 bg-stone-950 p-4">
                  <p className="text-xs font-semibold text-stone-200">Monogram / Event Logo</p>
                  <input
                    type="url"
                    value={themeConfig.logoUrl ?? ""}
                    onChange={(e) =>
                      setThemeConfig((prev) => ({ ...prev, logoUrl: e.target.value || null }))
                    }
                    placeholder="https://... or upload below"
                    className="mt-2 w-full rounded-lg border border-stone-800 bg-stone-900 px-3 py-1.5 text-xs text-white"
                  />
                  <label className="mt-2.5 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-medium text-stone-200 hover:bg-stone-800">
                    {uploadingAssetField === "logoUrl" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    <span>Upload Logo to R2</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadBrandAsset("logoUrl", file);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-stone-800 bg-stone-950 p-4">
                  <p className="text-xs font-semibold text-stone-200">Splash Cover Photo</p>
                  <input
                    type="url"
                    value={themeConfig.coverMediaUrl ?? ""}
                    onChange={(e) =>
                      setThemeConfig((prev) => ({
                        ...prev,
                        coverMediaUrl: e.target.value || null,
                      }))
                    }
                    placeholder="https://... or upload below"
                    className="mt-2 w-full rounded-lg border border-stone-800 bg-stone-900 px-3 py-1.5 text-xs text-white"
                  />
                  <label className="mt-2.5 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-medium text-stone-200 hover:bg-stone-800">
                    {uploadingAssetField === "coverMediaUrl" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    <span>Upload Cover Photo to R2</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadBrandAsset("coverMediaUrl", file);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {/* --------------------------------------------------------------- */}
          {/* LEFT TAB 3: FEATURE & RULE TOGGLES                              */}
          {/* --------------------------------------------------------------- */}
          {activeTab === "features" ? (
            <div className="space-y-4 rounded-3xl border border-stone-800 bg-stone-900/70 p-6">
              <h2 className="font-serif text-lg font-semibold">
                Modular Feature &amp; Moderation Rule Toggles
              </h2>

              {[
                {
                  key: "requireModerationBeforePublic" as const,
                  title: "Require Pre-Moderation Before Public Gallery",
                  desc: "New guest uploads start hidden until approved by the couple or admin.",
                },
                {
                  key: "enableFaceRecognition" as const,
                  title: "AI Face Recognition ('Find Me' Tab & Biometric Scanner)",
                  desc: "Enables client-side WebGL 128-d face indexing and pgvector gallery search.",
                },
                {
                  key: "enableVoiceToasts" as const,
                  title: "Audio Guestbook Voice Toasts",
                  desc: "Allows guests to record spoken voice messages from their browser.",
                },
                {
                  key: "enablePhotoUpload" as const,
                  title: "Allow Photo Uploads",
                  desc: "Accepts high-resolution JPEG, PNG, WebP, and HEIC photos.",
                },
                {
                  key: "enableVideoUpload" as const,
                  title: "Allow 4K Video Uploads",
                  desc: "Accepts MP4, MOV, and WebM video clips directly to R2.",
                },
                {
                  key: "enableLiveSlideshow" as const,
                  title: "Live Reception Slideshow Mode",
                  desc: "Displays a full-screen auto-advancing slideshow button in the header.",
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-stone-800 bg-stone-950/70 p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-stone-400">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={flowConfig.features[item.key]}
                    onChange={(e) => updateFeatureToggle(item.key, e.target.checked)}
                    className="h-5 w-5 accent-amber-500"
                  />
                </label>
              ))}

              <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-white">
                    Max Single File Upload Size Limit (MB)
                  </label>
                  <span className="font-mono text-sm font-bold text-amber-400">
                    {flowConfig.features.maxUploadSizeMb} MB
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={2048}
                  step={10}
                  value={flowConfig.features.maxUploadSizeMb}
                  onChange={(e) => updateFeatureToggle("maxUploadSizeMb", Number(e.target.value))}
                  className="mt-3 w-full accent-amber-500"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* ================================================================= */}
        {/* RIGHT PANEL: LIVE INTERACTIVE IPHONE 16 PRO PREVIEW (5 cols)      */}
        {/* ================================================================= */}
        <div className="flex flex-col items-center lg:col-span-5">
          <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
            <span className="mr-1 flex items-center gap-1 text-xs font-medium text-stone-400">
              <Smartphone className="h-3.5 w-3.5 text-amber-400" />
              iPhone 16 Pro Live Preview:
            </span>
            {flowConfig.steps.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStepType(s.type)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  selectedStepType === s.type
                    ? "bg-amber-600 text-white"
                    : "bg-stone-900 text-stone-400 hover:text-white"
                }`}
              >
                {s.title}
                {!s.enabled ? " (Off)" : ""}
              </button>
            ))}
          </div>

          {/* iPhone 16 Pro Titanium Bezel Frame */}
          <div className="relative h-[740px] w-[360px] overflow-hidden rounded-[3.2rem] border-[10px] border-stone-800 bg-black shadow-[0_0_80px_rgba(0,0,0,0.85)] ring-2 ring-stone-700">
            {/* Dynamic Island */}
            <div className="pointer-events-none absolute top-2.5 left-1/2 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-black ring-1 ring-stone-800/80" />

            {/* Live Screen Surface */}
            <div
              style={{
                backgroundColor: themeConfig.backgroundColor,
                color: themeConfig.textColor,
              }}
              className={`flex h-full w-full flex-col justify-between overflow-y-auto px-5 pt-12 pb-8 ${fontClass}`}
            >
              {/* Preview Top Progress Dots */}
              <div className="flex items-center justify-between text-[10px] opacity-70">
                <span className="truncate font-semibold uppercase tracking-wider">
                  {album.title}
                </span>
                <div className="flex gap-1">
                  {flowConfig.steps
                    .filter((s) => s.enabled)
                    .map((s) => (
                      <span
                        key={s.id}
                        style={{
                          backgroundColor:
                            s.type === activePreviewStep.type
                              ? themeConfig.primaryColor
                              : "rgba(120,113,108,0.3)",
                        }}
                        className="h-1.5 w-4 rounded-full"
                      />
                    ))}
                </div>
              </div>

              {/* Preview Step 1: Welcome Splash */}
              {activePreviewStep.type === "welcome_splash" ? (
                <div className="my-auto flex flex-col items-center text-center">
                  {themeConfig.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={themeConfig.logoUrl}
                      alt="Logo"
                      className="mb-4 h-12 w-auto object-contain"
                    />
                  ) : null}

                  {themeConfig.coverMediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={themeConfig.coverMediaUrl}
                      alt="Cover"
                      className="mb-5 aspect-[4/5] w-full rounded-2xl object-cover shadow-md"
                    />
                  ) : (
                    <div
                      style={{ borderColor: `${themeConfig.primaryColor}40` }}
                      className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2"
                    >
                      <Heart style={{ color: themeConfig.primaryColor }} className="h-7 w-7" />
                    </div>
                  )}

                  {(activePreviewStep as WelcomeSplashStep).settings.showEventDate ? (
                    <p className="text-[10px] uppercase tracking-[0.2em] opacity-65">
                      {album.event_date || "Wedding Celebration"}
                    </p>
                  ) : null}

                  <h3 className="mt-2 text-2xl font-semibold leading-tight">
                    {(activePreviewStep as WelcomeSplashStep).settings.headline}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed opacity-80">
                    {(activePreviewStep as WelcomeSplashStep).settings.subtitle}
                  </p>

                  <button
                    type="button"
                    onClick={() => setSelectedStepType("guest_registration")}
                    style={{ backgroundColor: themeConfig.primaryColor }}
                    className={`mt-6 w-full py-3 text-xs font-semibold text-white shadow-md ${btnRadius}`}
                  >
                    {(activePreviewStep as WelcomeSplashStep).settings.ctaText}
                  </button>
                </div>
              ) : null}

              {/* Preview Step 2: Guest Registration */}
              {activePreviewStep.type === "guest_registration" ? (
                <div className="my-auto rounded-2xl border border-stone-300/60 bg-white/85 p-5 text-stone-900 shadow-md">
                  <div className="flex items-center gap-2">
                    <UserCheck style={{ color: themeConfig.primaryColor }} className="h-4 w-4" />
                    <h3 className="text-base font-semibold">
                      {(activePreviewStep as GuestRegistrationStep).settings.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-600">
                    {(activePreviewStep as GuestRegistrationStep).settings.subtitle}
                  </p>

                  <div className="mt-4 space-y-2.5 text-xs">
                    {(activePreviewStep as GuestRegistrationStep).settings.askName ? (
                      <input
                        type="text"
                        readOnly
                        placeholder="Your Name"
                        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs"
                      />
                    ) : null}
                    {(activePreviewStep as GuestRegistrationStep).settings.askContact ? (
                      <input
                        type="text"
                        readOnly
                        placeholder={
                          (activePreviewStep as GuestRegistrationStep).settings.contactLabel
                        }
                        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs"
                      />
                    ) : null}
                    {(activePreviewStep as GuestRegistrationStep).settings.askTableNumber ? (
                      <input
                        type="text"
                        readOnly
                        placeholder="Table Number"
                        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs"
                      />
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedStepType("biometric_opt_in")}
                    style={{ backgroundColor: themeConfig.primaryColor }}
                    className={`mt-4 w-full py-2.5 text-xs font-semibold text-white ${btnRadius}`}
                  >
                    {(activePreviewStep as GuestRegistrationStep).settings.submitText}
                  </button>
                  {!(activePreviewStep as GuestRegistrationStep).settings.mandatory ? (
                    <p className="mt-2 text-center text-[11px] text-stone-500">
                      {(activePreviewStep as GuestRegistrationStep).settings.skipText}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Preview Step 3: Biometric Opt-In */}
              {activePreviewStep.type === "biometric_opt_in" ? (
                <div className="my-auto rounded-2xl border border-stone-300/60 bg-white/85 p-5 text-center text-stone-900 shadow-md">
                  <div
                    style={{ backgroundColor: `${themeConfig.primaryColor}20` }}
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
                  >
                    <ScanFace style={{ color: themeConfig.primaryColor }} className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">
                    {(activePreviewStep as BiometricOptInStep).settings.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-stone-600">
                    {(activePreviewStep as BiometricOptInStep).settings.subtitle}
                  </p>
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-stone-100 p-2 text-left text-[10px] text-stone-600">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Instant on-device mathematical signature — never uploaded.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStepType("main_hub")}
                    style={{ backgroundColor: themeConfig.primaryColor }}
                    className={`mt-4 flex w-full items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-white ${btnRadius}`}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {(activePreviewStep as BiometricOptInStep).settings.ctaScanText}
                  </button>
                </div>
              ) : null}

              {/* Preview Step 4: Main Hub */}
              {activePreviewStep.type === "main_hub" ? (
                <div className="my-auto space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold">{album.title}</h3>
                    <p className="text-[11px] opacity-75">
                      {(activePreviewStep as MainHubStep).settings.welcomeBanner}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {flowConfig.features.enablePhotoUpload ||
                    flowConfig.features.enableVideoUpload ? (
                      <span
                        style={{ backgroundColor: themeConfig.primaryColor }}
                        className={`inline-flex items-center gap-1 px-3 py-2 text-[11px] font-semibold text-white ${btnRadius}`}
                      >
                        <Upload className="h-3 w-3" />
                        {(activePreviewStep as MainHubStep).settings.uploadCtaText}
                      </span>
                    ) : null}
                    {flowConfig.features.enableVoiceToasts ? (
                      <span
                        className={`inline-flex items-center gap-1 bg-stone-900 px-3 py-2 text-[11px] font-semibold text-white ${btnRadius}`}
                      >
                        <Mic className="h-3 w-3 text-amber-400" />
                        Voice Toast
                      </span>
                    ) : null}
                  </div>

                  {/* Preview Gallery Grid */}
                  <div
                    className={
                      themeConfig.galleryLayout === "carousel"
                        ? "flex gap-2 overflow-x-auto pb-2"
                        : "grid grid-cols-2 gap-2"
                    }
                  >
                    {DEMO_MEDIA_ITEMS.slice(0, 4).map((m) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={m.id}
                        src={m.file_url}
                        alt="Preview"
                        className={`rounded-xl object-cover ${
                          themeConfig.galleryLayout === "carousel"
                            ? "h-36 w-28 shrink-0"
                            : "aspect-square w-full"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="text-center text-[10px] opacity-50">
                Layout: {themeConfig.galleryLayout} · Font: {themeConfig.fontFamily}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
