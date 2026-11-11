"use client";

import { Loader2, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { apiFetch, errorMessage } from "@/lib/client/api";
import { useT } from "@/lib/i18n/provider";
import { ui } from "@/components/ui/styles";

interface Cohost {
  userId: string;
  username: string;
}

/** Owner-only card: add / remove co-hosts by their Mira username. */
export function CoHostsCard({
  eventId,
  onMessage,
}: {
  eventId: string;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const t = useT();
  const [items, setItems] = useState<Cohost[] | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ items: Cohost[] }>(`/api/host/events/${eventId}/cohosts`);
        if (!cancelled) setItems(res.items);
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          onMessage(errorMessage(error), "error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, onMessage]);

  const add = async () => {
    const value = username.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ items: Cohost[] }>(`/api/host/events/${eventId}/cohosts`, { method: "POST", json: { username: value } });
      setItems(res.items);
      setUsername("");
      onMessage(t("Ortak yönetici eklendi."), "success");
    } catch (error) {
      onMessage(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Cohost) => {
    if (!window.confirm(t("{name} ortak yöneticilikten çıkarılsın mı?", { name: c.username }))) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ items: Cohost[] }>(`/api/host/events/${eventId}/cohosts?userId=${encodeURIComponent(c.userId)}`, { method: "DELETE" });
      setItems(res.items);
    } catch (error) {
      onMessage(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={ui.card}>
      <h3 className={ui.sectionTitle}>{t("Ortak yöneticiler")}</h3>
      <p className={`mt-1 ${ui.hint}`}>
        {t("Mira hesabı olan birini giriş yaptığı kullanıcı adı (ya da e-posta) ile ekleyin. Moderasyon, ayarlar ve indirme yapabilir; etkinliği silemez, yönetici ekleyemez. Dosyalar her zaman sizin Drive’ınızda kalır.")}
      </p>
      <ul className="mt-3 space-y-1.5">
        {items === null && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
        {items?.length === 0 && <li className="text-xs text-stone-500">{t("Henüz ortak yönetici yok.")}</li>}
        {items?.map((c) => (
          <li key={c.userId} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-800">
            {c.username}
            <button type="button" disabled={busy} onClick={() => void remove(c)} className="rounded-full p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700" aria-label={t("{name} çıkar", { name: c.username })}>
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          value={username}
          maxLength={64}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder={t("Kullanıcı adı veya e-posta")}
          autoCapitalize="none"
          className={ui.input}
        />
        <button type="button" disabled={busy || !username.trim()} onClick={() => void add()} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-stone-300 px-3 text-sm disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} {t("Ekle")}
        </button>
      </div>
    </div>
  );
}
