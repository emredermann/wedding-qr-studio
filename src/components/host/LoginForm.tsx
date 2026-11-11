"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/brand/BrandMark";
import { trackEvent } from "@/lib/client/analytics";
import { isValidUsername, normaliseUsername, usernameToLoginEmail } from "@/lib/login-identity";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { BRAND } from "@/lib/brand";
import { useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";

function authErrorMessage(err: unknown): MsgKey {
  const message = err instanceof Error ? err.message : "";
  if (/invalid login|invalid credentials/i.test(message)) return "Kullanıcı adı veya şifre hatalı.";
  if (/email not confirmed/i.test(message)) return "Bu hesap henüz etkinleştirilmemiş. Yöneticinizle iletişime geçin.";
  if (/rate limit|too many|security purposes/i.test(message)) return "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.";
  if (/fetch|network/i.test(message)) return "Bağlantı hatası. İnternet bağlantınızı kontrol edin.";
  return "Giriş yapılamadı. Lütfen tekrar deneyin.";
}

/**
 * Host sign-in with username + password. There is no self sign-up: accounts
 * are created by the administrator (`npm run user -- create …`).
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? t("Oturum bağlantısı geçersiz veya süresi dolmuş. Tekrar giriş yapın.") : null);

  const next = safeNextPath(params.get("next"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = normaliseUsername(username);
    if (!name.includes("@") && !isValidUsername(name)) {
      setError(t("Kullanıcı adı 3–32 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi içerebilir."));
      return;
    }
    if (!password) {
      setError(t("Şifrenizi girin."));
      return;
    }
    setBusy(true);
    try {
      const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email: usernameToLoginEmail(name),
        password,
      });
      if (signInError) throw signInError;
      trackEvent("host_signed_in");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(t(authErrorMessage(err)));
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-stone-500";

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-stone-50 px-5 py-10">
      <LanguageSwitcher className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-stone-900">
          <BrandLogo showTagline tagline={t(BRAND.tagline)} className="text-xl" markClassName="h-12 w-12" />
        </Link>
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">{t("Kullanıcı adı")}</span>
              <input
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={64}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">{t("Şifre")}</span>
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${field} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("Şifreyi gizle") : t("Şifreyi göster")}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-stone-500 hover:text-stone-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Giriş yap")}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-stone-500">
          {t("Hesaplar yönetici tarafından oluşturulur. Misafirlerin giriş yapmasına gerek yoktur; masadaki QR kodu okutmaları yeterli.")}
        </p>
      </div>
    </main>
  );
}
