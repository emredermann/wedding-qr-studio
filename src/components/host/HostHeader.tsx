"use client";

import { Heart, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function HostHeader({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const signOut = async () => {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-stone-900">
          <Heart className="h-5 w-5 fill-amber-600 text-amber-600" />
          <span className="font-serif text-lg">Wedding QR</span>
        </Link>
        <div className="flex items-center gap-2">
          {children}
          <button type="button" onClick={signOut} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100">
            <LogOut className="h-4 w-4" /> Çıkış
          </button>
        </div>
      </div>
    </header>
  );
}
