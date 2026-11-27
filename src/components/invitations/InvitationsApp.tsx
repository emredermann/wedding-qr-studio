"use client";

import { Armchair, ChevronLeft, ClipboardCheck, Crown, Loader2, Mail, Palette, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { HostHeader } from "@/components/host/HostHeader";
import { DesignEditor } from "@/components/invitations/DesignEditor";
import { InviteesTab } from "@/components/invitations/InviteesTab";
import { RepliesTab } from "@/components/invitations/RepliesTab";
import { ToastRegion, useToastQueue } from "@/components/ui/Feedback";
import { apiFetch, ApiError, errorMessage } from "@/lib/client/api";
import { useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";
import type { InvitationsDto } from "@/lib/invitations/model";

type Tab = "design" | "invitees" | "replies";

const TABS: Array<{ id: Tab; label: MsgKey; icon: typeof Mail }> = [
  { id: "design", label: "Davetiye", icon: Palette },
  { id: "invitees", label: "Davetliler", icon: Users },
  { id: "replies", label: "Yanıtlar", icon: ClipboardCheck },
];

export type Notify = (text: string, variant?: "success" | "error" | "info") => void;

/** Calls a host invitations endpoint and returns the fresh module state. */
export type Mutate = (path: string, init: RequestInit & { json?: unknown }, success?: string) => Promise<boolean>;

/**
 * "Davetiye & Oturma" module of an event: design the invitation, manage
 * invitees and their personal links, follow replies (mirrored to a Google
 * Sheet) and open the seating plan, whose guest list fills from replies.
 */
export function InvitationsApp({ eventId }: { eventId: string }) {
  const t = useT();
  const [data, setData] = useState<InvitationsDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("invitees");
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const { toasts, pushToast, dismissToast } = useToastQueue();
  const notify = useCallback<Notify>((text, variant = "info") => pushToast(text, variant), [pushToast]);
  const base = `/api/host/events/${eventId}/invitations`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<InvitationsDto>(base);
        if (cancelled) return;
        setData(res);
        setState("ready");
      } catch (e) {
        if (cancelled) return;
        setError(errorMessage(e));
        setState(e instanceof ApiError && e.code === "INVITATIONS_NOT_SET_UP" ? "unavailable" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base]);

  const mutate = useCallback<Mutate>(
    async (path, init, success) => {
      try {
        const res = await apiFetch<InvitationsDto>(`${base}${path}`, init);
        setData(res);
        if (success) notify(success, "success");
        return true;
      } catch (e) {
        notify(errorMessage(e), "error");
        return false;
      }
    },
    [base, notify],
  );

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh bg-stone-50">
      <HostHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Link href={`/dashboard/${eventId}`} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800">
          <ChevronLeft className="h-4 w-4" /> {t("Etkinliğe dön")}
        </Link>
        {children}
      </main>
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );

  if (state === "loading") {
    return shell(
      <div className="flex justify-center py-24 text-stone-400">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>,
    );
  }
  if (state !== "ready" || !data) {
    return shell(
      <div className="mx-auto max-w-lg rounded-3xl border border-stone-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-stone-900">{state === "unavailable" ? t("Davetiye modülü henüz kurulmadı") : t("Davetiyeler yüklenemedi")}</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">
          {state === "unavailable" ? t("Veritabanında supabase/migrations/0009_invitations.sql dosyasını çalıştırın, sonra sayfayı yenileyin.") : error}
        </p>
        <Link href={`/dashboard/${eventId}/davetiye/oturma`} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700">
          <Armchair className="h-4 w-4" /> {t("Oturma Planı")}
        </Link>
      </div>,
    );
  }

  const s = data.summary;
  return shell(
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("Düğün öncesi")}</p>
          <h1 className="font-serif text-3xl text-stone-900">{t("Davetiye & Oturma")}</h1>
          <p className="mt-1 text-sm text-stone-500">{data.event.coupleNames || data.event.title}</p>
        </div>
        <Link
          href={`/dashboard/${eventId}/davetiye/oturma`}
          className="inline-flex items-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700"
        >
          <Armchair className="h-4 w-4" /> {t("Oturma Planı")}
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums">{t("{n} kişi", { n: s.people })}</span>
        </Link>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("Davetiye"), s.links],
          [t("Katılıyor"), s.yes],
          [t("Gelecek kişi"), s.people],
          [t("Yanıt bekleniyor"), s.pending],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <dt className="text-xs text-stone-500">{label}</dt>
            <dd className="mt-0.5 text-2xl font-semibold text-stone-900 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {!data.pro && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Crown className="h-5 w-5 shrink-0" />
          <span className="flex-1">{t("Davetiye modülü Pro pakete dahildir. Görüntüleyebilirsiniz; davetiye oluşturmak ve düzenlemek için Pro paket gerekir.")}</span>
        </div>
      )}

      <nav className="-mx-4 mt-6 mb-6 overflow-x-auto border-b border-stone-200 px-4">
        <ul className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                  tab === id ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
                }`}
              >
                <Icon className="h-4 w-4" /> {t(label)}
                {id === "replies" && s.responded > 0 && <span className="rounded-full bg-stone-200 px-1.5 text-[10px] font-bold text-stone-700">{s.responded}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "design" && <DesignEditor key={JSON.stringify(data.settings.design)} data={data} readOnly={!data.pro} mutate={mutate} />}
      {tab === "invitees" && <InviteesTab data={data} origin={origin} readOnly={!data.pro} mutate={mutate} notify={notify} />}
      {tab === "replies" && <RepliesTab data={data} readOnly={!data.pro} mutate={mutate} />}
    </>,
  );
}
