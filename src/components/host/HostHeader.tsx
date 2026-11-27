"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BrandLogo } from "@/components/brand/BrandMark";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useT } from "@/lib/i18n/provider";

export function HostHeader({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const t = useT();
  const signOut = async () => {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-stone-900">
          <BrandLogo className="text-base" markClassName="h-8 w-8" />
        </Link>
        <div className="flex items-center gap-2">
          {children}
          <LanguageSwitcher />
          <button type="button" onClick={signOut} aria-label={t("Çıkış")} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100">
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">{t("Çıkış")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
