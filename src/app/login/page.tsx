"use client";

import { AlertCircle, ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandCrest } from "@/components/ui/BrandLogo";
import { FieldError, ToastRegion, useToastQueue } from "@/components/ui/Feedback";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  validateEmailField,
  validateEventTitleField,
  validatePasswordField,
} from "@/lib/validation/forms";

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
  const router = useRouter();
  const { toasts, pushToast, dismissToast } = useToastQueue();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const nextNameErr =
      mode === "signup" && fullName.trim().length > 0
        ? validateEventTitleField(fullName)
        : null;
    const nextEmailErr = validateEmailField(email, "Email address");
    const nextPassErr = validatePasswordField(password, mode === "signup");

    setNameError(nextNameErr);
    setEmailError(nextEmailErr);
    setPasswordError(nextPassErr);

    if (nextNameErr || nextEmailErr || nextPassErr) {
      return;
    }

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
        pushToast("Signed in! Redirecting to your studio…", "success");
        router.push(targetPath);
        router.refresh();
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
          pushToast("Couple account created! Opening your studio…", "success");
          router.push(targetPath);
          router.refresh();
          return;
        } else {
          const msg =
            "Account created! Check your email inbox to confirm your address, then sign in.";
          setInfoMessage(msg);
          pushToast("Account created! Please check your email inbox.", "info");
          setMode("signin");
          setLoading(false);
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Authentication failed. Check your Supabase credentials in .env.local.";
      setErrorMessage(msg);
      pushToast(msg, "error");
      setLoading(false);
    }
  };

  return (
    <div className="wqr-safe-top wqr-safe-bottom flex min-h-screen flex-col justify-between bg-stone-50 px-4 py-8 text-stone-900 sm:px-6 sm:py-12">
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />

      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="flex min-h-12 items-center gap-2.5 font-serif text-xl font-semibold tracking-tight transition hover:opacity-90"
        >
          <BrandCrest className="h-8 w-8" />
          <span>Lumina</span>
        </Link>
      </header>

      <main className="mx-auto my-8 w-full max-w-md sm:my-12">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Lumina · Host Portal
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">
            {mode === "signin" ? "Welcome Back" : "Create Your Wedding Vault"}
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
                setEmailError(null);
                setPasswordError(null);
                setNameError(null);
              }}
              className={`min-h-11 rounded-full py-2.5 transition ${
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
                setEmailError(null);
                setPasswordError(null);
                setNameError(null);
              }}
              className={`min-h-11 rounded-full py-2.5 transition ${
                mode === "signup" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500"
              }`}
            >
              Create Account
            </button>
          </div>

          <form
            noValidate
            onSubmit={(e) => void handleSubmit(e)}
            className="mt-6 space-y-4"
          >
            {mode === "signup" ? (
              <div>
                <label
                  htmlFor="login-couple-names"
                  className="block text-xs font-medium text-stone-700"
                >
                  Couple Names (Optional)
                </label>
                <input
                  id="login-couple-names"
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? "login-name-error" : undefined}
                  placeholder="Clara & Julian"
                  className={`mt-1.5 min-h-12 w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-700 ${
                    nameError ? "border-rose-400 bg-rose-50/30" : "border-stone-300"
                  }`}
                />
                <FieldError id="login-name-error" message={nameError} />
              </div>
            ) : null}

            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-stone-700"
              >
                Email Address
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-stone-400" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  onBlur={() => {
                    if (email.trim()) setEmailError(validateEmailField(email));
                  }}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? "login-email-error" : undefined}
                  placeholder="couple@example.com"
                  className={`min-h-12 w-full rounded-xl border py-2.5 pr-3.5 pl-10 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-700 ${
                    emailError ? "border-rose-400 bg-rose-50/30" : "border-stone-300"
                  }`}
                />
              </div>
              <FieldError id="login-email-error" message={emailError} />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-stone-700"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-stone-400" />
                <input
                  id="login-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  onBlur={() => {
                    if (password) {
                      setPasswordError(validatePasswordField(password, mode === "signup"));
                    }
                  }}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? "login-password-error" : undefined}
                  placeholder="•••••••• (min. 6 characters)"
                  className={`min-h-12 w-full rounded-xl border py-2.5 pr-3.5 pl-10 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-700 ${
                    passwordError ? "border-rose-400 bg-rose-50/30" : "border-stone-300"
                  }`}
                />
              </div>
              <FieldError id="login-password-error" message={passwordError} />
            </div>

            {errorMessage ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {infoMessage ? (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
              >
                {infoMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-700 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-800 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>{mode === "signin" ? "Sign In to Dashboard" : "Create Couple Account"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 border-t border-stone-100 pt-4 text-center">
            <button
              type="button"
              onClick={() => {
                pushToast("Continuing to Studio as Demo Host…", "info");
                router.push("/dashboard");
              }}
              className="text-xs font-medium text-stone-500 transition hover:text-amber-800 hover:underline"
            >
              Or preview studio as Demo Host (Clara &amp; Julian) →
            </button>
          </div>
        </div>
      </main>

      <footer className="mx-auto text-center text-xs text-stone-400">
        Lumina · Private Biometric &amp; End-to-End Encrypted Cloud Vault
      </footer>
    </div>
  );
}
