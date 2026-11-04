"use client";

import { AlertCircle, ArrowRight, Heart, Loader2, Lock, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DEMO_ALBUM_ID } from "@/lib/demo-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function resolveNextPath(): string {
  if (typeof window === "undefined") return "/dashboard";
  try {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    return next && next.startsWith("/") && !next.startsWith("/login") ? next : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    try {
      const supabase = getSupabaseBrowserClient();
      void supabase.auth.getUser().then(({ data }) => {
        if (active && data.user) {
          window.location.replace(resolveNextPath());
        }
      });
    } catch {
      // Ignore if env is not configured
    }
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const targetPath = resolveNextPath();

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        window.location.assign(targetPath);
        return;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() || undefined },
          },
        });
        if (error) throw error;
        if (data.session) {
          window.location.assign(targetPath);
          return;
        } else {
          setInfoMessage(
            "Account created! Check your email inbox to confirm your address, then sign in.",
          );
          setMode("signin");
          setLoading(false);
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Authentication failed. Check your Supabase credentials in .env.local.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-stone-50 px-6 py-12 text-stone-900">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-serif text-xl font-semibold">
          <Heart className="h-5 w-5 text-amber-700" />
          <span>Wedding QR Studio</span>
        </Link>
        <Link
          href={`/dashboard/${DEMO_ALBUM_ID}`}
          className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-100"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-700" />
          Explore Interactive Demo Dashboard
        </Link>
      </header>

      <main className="mx-auto my-12 w-full max-w-md">
        <div className="rounded-3xl border border-stone-200 bg-white p-8 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Couple & Host Portal
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">
            {mode === "signin" ? "Welcome Back" : "Create Your Wedding Studio"}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            Manage up to 5 wedding events, design 300-DPI table QR cards, moderate uploads, and
            download your 10GB+ full-resolution archive.
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-full bg-stone-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setErrorMessage(null);
              }}
              className={`rounded-full py-2 transition ${
                mode === "signin" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setErrorMessage(null);
              }}
              className={`rounded-full py-2 transition ${
                mode === "signup" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500"
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
            {mode === "signup" ? (
              <div>
                <label className="block text-xs font-medium text-stone-700">Couple Names</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Clara & Julian"
                  className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-700"
                />
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-stone-700">Email Address</label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-stone-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="couple@example.com"
                  className="w-full rounded-xl border border-stone-300 py-2.5 pr-3.5 pl-10 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700">Password</label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-stone-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-stone-300 py-2.5 pr-3.5 pl-10 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-700"
                />
              </div>
            </div>

            {errorMessage ? (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {infoMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                {infoMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-amber-700 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-800 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "signin" ? "Sign In to Dashboard" : "Create Couple Account"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </main>

      <footer className="mx-auto text-center text-xs text-stone-400">
        Wedding QR Studio · End-to-End Encrypted Cloud Vault
      </footer>
    </div>
  );
}
