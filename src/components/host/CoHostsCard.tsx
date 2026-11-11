"use client";

import { Loader2, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { apiFetch, errorMessage } from "@/lib/client/api";

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
      onMessage("Ortak yönetici eklendi.", "success");
    } catch (error) {
      onMessage(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Cohost) => {
    if (!window.confirm(`${c.username} ortak yöneticilikten çıkarılsın mı?`)) return;
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
    <div className="rounded-3xl border border-stone-200 bg-white p-5">
      <h3 className="font-serif text-lg text-stone-900">Ortak yöneticiler</h3>
      <p className="mt-1 text-xs text-stone-500">
        Mira hesabı olan birini kullanıcı adıyla ekleyin. Moderasyon, ayarlar ve indirme yapabilir; etkinliği silemez, yönetici ekleyemez. Dosyalar her zaman sizin Drive’ınızda kalır.
      </p>
      <ul className="mt-3 space-y-1.5">
        {items === null && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
        {items?.length === 0 && <li className="text-xs text-stone-500">Henüz ortak yönetici yok.</li>}
        {items?.map((c) => (
          <li key={c.userId} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-800">
            {c.username}
            <button type="button" disabled={busy} onClick={() => void remove(c)} className="rounded-full p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700" aria-label={`${c.username} çıkar`}>
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
          placeholder="Kullanıcı adı"
          autoCapitalize="none"
          className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-stone-500"
        />
        <button type="button" disabled={busy || !username.trim()} onClick={() => void add()} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-stone-300 px-3 text-sm disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Ekle
        </button>
      </div>
    </div>
  );
}
