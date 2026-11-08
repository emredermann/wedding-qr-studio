"use client";

import { Heart, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "Giriş bağlantısı geçersiz veya süresi dolmuş." : null);
  const [info, setInfo] = useState<string | null>(null);

  const rawNext = params.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 8) {
      setError("Şifre en az 8 karakter olmalı.");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        router.replace(next);
        router.refresh();
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setInfo("Hesabınız oluşturuldu. E-postanıza gelen bağlantıya tıklayarak hesabınızı doğrulayın.");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        /invalid login/i.test(message)
          ? "E-posta veya şifre hatalı."
          : /already registered/i.test(message)
            ? "Bu e-posta zaten kayıtlı. Giriş yapın."
            : /email not confirmed/i.test(message)
              ? "E-posta adresiniz henüz doğrulanmadı."
              : message || "İşlem başarısız.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-50 px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-stone-900">
          <Heart className="h-6 w-6 fill-amber-600 text-amber-600" />
          <span className="font-serif text-2xl">Wedding QR</span>
        </Link>
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-6 grid grid-cols-2 rounded-full bg-stone-100 p-1 text-sm font-medium">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full py-2 transition ${mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}
              >
                {m === "signin" ? "Giriş yap" : "Hesap oluştur"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">E-posta</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-stone-500" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">Şifre</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-stone-500"
              />
            </label>
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            {info && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{info}</p>}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Giriş yap" : "Ücretsiz hesap oluştur"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-stone-500">Misafirlerin hesap açmasına gerek yoktur; yalnızca düğün sahibi giriş yapar.</p>
      </div>
    </main>
  );
}
