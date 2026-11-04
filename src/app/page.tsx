"use client";

import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Download,
  Mic,
  QrCode,
  ScanFace,
  ShieldCheck,
  Sliders,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BrandCrest } from "@/components/ui/BrandLogo";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: ReadonlyArray<FaqItem> = [
  {
    question: "Do our guests have to download an app or create an account?",
    answer:
      "Never. Guests simply point their iPhone or Android camera at your table QR card. The mobile gallery opens immediately in Safari or Chrome — zero app store friction, zero passwords.",
  },
  {
    question: "How does 'Find Me' AI Face Recognition protect guest privacy?",
    answer:
      "When a guest scans their selfie, our WebGL neural engine runs entirely on their phone to compute a 128-dimensional mathematical vector. The selfie image itself is never uploaded or stored on any server.",
  },
  {
    question: "Are photos and videos compressed like WhatsApp or Instagram?",
    answer:
      "No. Every photo, 4K video, and voice toast uploads directly from the guest's browser to Cloudflare R2 in 100% original resolution. You download the entire collection as a categorized streaming ZIP.",
  },
  {
    question: "What is Disposable Camera Mode?",
    answer:
      "When enabled, guests can snap and upload photos all night while the public gallery stays locked behind a live countdown timer. At your chosen reveal time the next morning, the entire gallery unlocks at once.",
  },
  {
    question: "How does duplicate detection and AI categorization work?",
    answer:
      "Each uploaded photo is fingerprinted with a 64-bit Perceptual Hash (pHash) to group burst shots in your moderation studio, while Vision AI automatically sorts moments into Getting Ready, Ceremony, Reception, Party, and Venue.",
  },
  {
    question: "Are there any storage limits or upload restrictions?",
    answer:
      "None. Lumina provides unlimited uncompressed 4K photo, video, and audio uploads, with direct Cloudflare R2 streaming and on-device AI face search completely unrestricted.",
  },
];

const COMPARISON_ROWS = [
  {
    feature: "Guest App Download or Login Required",
    studio: "None — Instant Camera Scan",
    cloud: "Requires Google / Apple Sign-In",
    apps: "Requires App Store Download",
  },
  {
    feature: "Original 4K Video & RAW Photo Quality",
    studio: "100% Uncompressed Direct-to-R2",
    cloud: "Often Compressed by Account Quota",
    apps: "Heavily Compressed",
  },
  {
    feature: "On-Device AI Face Search ('Find Me')",
    studio: "Included (128-d pgvector)",
    cloud: "Not Shared Across Guests",
    apps: "Rare / Paid Add-on",
  },
  {
    feature: "Voice Guestbook Toasts",
    studio: "Built-In Audio Recorder",
    cloud: "Not Supported",
    apps: "Not Supported",
  },
  {
    feature: "Disposable Camera Morning-After Reveal",
    studio: "Built-In Countdown Lock",
    cloud: "Not Supported",
    apps: "Limited",
  },
  {
    feature: "300-DPI Print-Ready 5×7\" Table Cards",
    studio: "3 Luxury Themes Included",
    cloud: "DIY Generic QR",
    apps: "Extra Print Fee",
  },
] as const;

export default function LandingPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 selection:bg-amber-200 selection:text-stone-950">
      {/* Editorial Navigation */}
      <header className="wqr-safe-top sticky top-0 z-40 border-b border-stone-200/80 bg-[#FAF8F5]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-12 items-center gap-3 transition hover:opacity-90"
          >
            <BrandCrest className="h-8 w-8 shadow-xs" />
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-xl font-semibold tracking-tight text-stone-900">
                Lumina
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-stone-700">
                Biometric Memory Vault
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-xs font-medium text-stone-600 md:flex">
            <a href="#how-it-works" className="py-2 transition hover:text-stone-950">
              How It Works
            </a>
            <a href="#face-recognition" className="py-2 transition hover:text-stone-950">
              AI Face Match
            </a>
            <a href="#disposable-mode" className="py-2 transition hover:text-stone-950">
              Disposable Mode
            </a>
            <a href="#comparison" className="py-2 transition hover:text-stone-950">
              Compare
            </a>
            <a href="#faq" className="py-2 transition hover:text-stone-950">
              FAQ
            </a>
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin"
              className="hidden min-h-12 items-center gap-1 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-100 sm:inline-flex"
            >
              <Sliders className="h-3.5 w-3.5 text-amber-700" />
              Flow Builder
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-h-12 items-center gap-1.5 rounded-full bg-stone-900 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-stone-800"
            >
              <span>Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden border-b border-stone-200/70 pt-14 pb-20 sm:pt-24 sm:pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h1 className="font-serif text-4xl leading-[1.12] font-semibold tracking-tight text-stone-950 sm:text-6xl">
                Every candid moment your guests captured, in one heirloom vault.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
                Place our 300-DPI editorial QR cards on your reception tables. Guests scan with
                their native camera to share full-resolution photos, videos, and voice toasts — and
                find every photo of themselves in seconds with private WebGL face recognition.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3.5">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-stone-950 px-7 py-4 text-sm font-semibold text-white shadow-lg transition hover:bg-stone-800"
                >
                  <span>Create Your Wedding QR</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-6 text-xs text-stone-500">
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-700" />
                  Unlimited 4K uploads &amp; downloads
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-700" />
                  24-month full-resolution archive
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-700" />
                  Up to 5 events per couple
                </span>
              </div>
            </div>

            {/* Editorial Preview Card */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-md rounded-[2rem] border border-stone-300/90 bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                      Villa Aurelia · Rome
                    </p>
                    <p className="font-serif text-xl font-semibold">Clara &amp; Julian</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-900">
                    412 Live Uploads
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80"
                    alt="Ceremony candid"
                    className="aspect-[4/5] w-full rounded-2xl bg-stone-100 object-cover"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=80"
                    alt="Reception toast"
                    className="aspect-[4/5] w-full rounded-2xl bg-stone-100 object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS IN 3 STEPS */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
            Effortless From Table to Archive
          </p>
          <h2 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">
            How It Works in Three Steps
          </h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {[
            {
              step: "01",
              icon: QrCode,
              title: "Print 300-DPI Table Cards",
              body: "Customize your couple names, wedding date, and editorial theme in our 5×7\" QR Card Studio, or tailor a bespoke guest onboarding flow.",
            },
            {
              step: "02",
              icon: Camera,
              title: "Guests Scan & Share Instantly",
              body: "No apps or logins. Guests upload multiple 4K videos, burst photos, and voice toasts directly to cloud storage with a 3-stream mobile memory guard.",
            },
            {
              step: "03",
              icon: Download,
              title: "AI Sorts & You Stream One ZIP",
              body: "Vision AI categorizes every photo by wedding moment, flags duplicate shots via 64-bit pHash, and streams your entire 10GB+ archive as a single ZIP.",
            },
          ].map(({ step, icon: Icon, title, body }) => (
            <div
              key={step}
              className="rounded-3xl border border-stone-200/90 bg-white p-8 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-serif text-3xl font-bold text-amber-700/40">{step}</span>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-800">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <h3 className="mt-6 font-serif text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. ZERO-APP GUEST EXPERIENCE + VOICE TOASTS */}
      <section className="border-y border-stone-200/80 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
                Zero-App Guest Experience
              </p>
              <h2 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">
                Built for Champagne Hands &amp; Spotty Venue Wi-Fi
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-stone-600">
                Traditional photo-sharing apps lose 80% of guests at the App Store login screen.
                Lumina opens in under a second and streams files straight from the
                browser to Cloudflare R2 via Presigned PUT URLs.
              </p>

              <ul className="mt-6 space-y-4 text-sm text-stone-700">
                <li className="flex items-start gap-3">
                  <Camera className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <span>
                    <strong>3-Stream Concurrency Queue:</strong> Guests can select 50 high-res
                    photos at once without crashing mobile Safari or running out of RAM.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Mic className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <span>
                    <strong>Audio Guestbook Voice Toasts:</strong> Guests record spoken marriage
                    advice and late-night toasts right from their table.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Sliders className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <span>
                    <strong>Per-Event Onboarding Flow Builder:</strong> Customize splash screens,
                    WhatsApp/Email guestbook sign-in, and brand colors per event.
                  </span>
                </li>
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-stone-200 bg-[#FAF8F5] p-6">
                <Mic className="h-7 w-7 text-amber-700" />
                <h3 className="mt-4 font-serif text-lg font-semibold">Voice Toasts</h3>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">
                  Every spoken toast is saved into a dedicated{" "}
                  <code className="font-mono">Voice_Toasts/</code> folder inside your master ZIP
                  download.
                </p>
              </div>
              <div className="rounded-3xl border border-stone-200 bg-[#FAF8F5] p-6">
                <Sparkles className="h-7 w-7 text-amber-700" />
                <h3 className="mt-4 font-serif text-lg font-semibold">AI Moment Sorting</h3>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">
                  Vision AI tags uploads into Getting Ready, Ceremony, Reception, Party, and Venue
                  automatically.
                </p>
              </div>
              <div className="rounded-3xl border border-stone-200 bg-[#FAF8F5] p-6 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-lg font-semibold">
                      Interactive Per-Event Flow Studio
                    </h3>
                    <p className="mt-1 text-xs text-stone-600">
                      Preview your guest journey inside a live iPhone 16 Pro frame.
                    </p>
                  </div>
                  <Link
                    href="/admin"
                    className="inline-flex min-h-12 items-center rounded-full bg-stone-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-stone-800"
                  >
                    Open Builder
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. AI FACE RECOGNITION SPOTLIGHT */}
      <section id="face-recognition" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="rounded-[2.5rem] bg-stone-950 p-6 text-stone-100 shadow-2xl sm:p-14">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3.5 py-1 text-xs font-semibold text-amber-300">
                <ScanFace className="h-4 w-4" />
                <span>128-Dimensional WebGL Biometric Vector Search</span>
              </div>

              <h2 className="mt-4 font-serif text-3xl font-semibold sm:text-4xl">
                Guests Find Their Own Photos Instantly
              </h2>

              <p className="mt-4 text-sm leading-relaxed text-stone-300">
                Nobody wants to scroll through 1,500 wedding photos to find the 8 pictures they are
                in. With a 1-second selfie scan, guests filter the entire wedding gallery by cosine
                similarity in Postgres <code className="font-mono text-amber-300">pgvector</code>.
              </p>

              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-stone-800 bg-stone-900/90 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <p className="text-xs leading-relaxed text-stone-300">
                  <strong>GDPR &amp; KVKK Privacy by Design:</strong> Your selfie is never uploaded
                  or stored; it is converted into an instant mathematical signature on your device
                  solely to filter your photos.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-3xl border border-stone-800 bg-stone-900 p-6 text-center lg:col-span-5">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-amber-400/70 bg-amber-500/10">
                <ScanFace className="h-11 w-11 text-amber-400" />
              </div>
              <p className="mt-4 font-mono text-xs text-amber-300">
                [0.084, -0.119, 0.204, … 128 floats]
              </p>
              <p className="mt-2 text-xs text-stone-400">
                Group photos index every face automatically in the background after upload.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. DISPOSABLE CAMERA MODE */}
      <section id="disposable-mode" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="rounded-3xl border border-stone-200 bg-amber-50/60 p-8 sm:p-12">
          <div className="grid items-center gap-8 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
                <Clock className="h-4 w-4" />
                <span>Disposable Camera Mode</span>
              </div>
              <h2 className="mt-2 font-serif text-3xl font-semibold">
                Capture Tonight. Reveal Together Tomorrow Morning.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-stone-700">
                Recreate the nostalgia of 35mm table cameras. Keep uploads wide open during the
                reception while hiding the public feed behind an elegant live countdown timer until
                brunch the next day.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-stone-950 p-6 text-center text-amber-400 lg:col-span-4">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                Gallery Unlocks In
              </span>
              <span className="mt-2 font-mono text-3xl font-bold">11h 42m 18s</span>
              <span className="mt-1 text-[11px] text-stone-400">Sunday Brunch · 10:00 AM</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. COMPETITOR COMPARISON MATRIX */}
      <section id="comparison" className="border-t border-stone-200/80 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
              Why Couples Switch
            </p>
            <h2 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">
              Compared to Shared Drives &amp; Native Apps
            </h2>
          </div>

          <div className="mt-12 overflow-x-auto rounded-3xl border border-stone-200 shadow-xs">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-100/80">
                  <th className="p-4 font-semibold text-stone-700">Capability</th>
                  <th className="bg-amber-50/90 p-4 font-serif text-base font-semibold text-amber-950">
                    Lumina
                  </th>
                  <th className="p-4 font-semibold text-stone-500">Google Photos / iCloud</th>
                  <th className="p-4 font-semibold text-stone-500">Traditional Wedding Apps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature}>
                    <td className="p-4 font-medium text-stone-900">{row.feature}</td>
                    <td className="bg-amber-50/40 p-4 font-semibold text-emerald-800">
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="h-4 w-4 text-emerald-600" />
                        {row.studio}
                      </span>
                    </td>
                    <td className="p-4 text-stone-500">
                      <span className="inline-flex items-center gap-1.5">
                        <X className="h-4 w-4 text-stone-400" />
                        {row.cloud}
                      </span>
                    </td>
                    <td className="p-4 text-stone-500">
                      <span className="inline-flex items-center gap-1.5">
                        <X className="h-4 w-4 text-stone-400" />
                        {row.apps}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>



      {/* 8. ACCORDION FAQ */}
      <section id="faq" className="border-t border-stone-200/80 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
              Questions &amp; Answers
            </p>
            <h2 className="mt-2 font-serif text-3xl font-semibold">Frequently Asked Questions</h2>
          </div>

          <div className="mt-10 divide-y divide-stone-200 rounded-3xl border border-stone-200 bg-[#FAF8F5] px-6">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIndex === idx;
              const panelId = `faq-panel-${idx}`;
              return (
                <div key={item.question} className="py-3">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="flex min-h-12 w-full items-center justify-between gap-4 py-2 text-left font-serif text-base font-semibold text-stone-900"
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-stone-500 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {isOpen ? (
                    <p
                      id={panelId}
                      className="pb-3 text-sm leading-relaxed text-stone-600"
                    >
                      {item.answer}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-[#FAF8F5] py-12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-stone-500 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandCrest className="h-7 w-7" />
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-base font-semibold text-stone-900">
                Lumina
              </span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-stone-700">
                Editorial &amp; Biometric Vault
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center hover:text-stone-900"
            >
              Dashboard
            </Link>
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center hover:text-stone-900"
            >
              Master Admin Portal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
