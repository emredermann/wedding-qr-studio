"use client";

import { Check, EyeOff, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AudioPlayer } from "@/components/media/AudioPlayer";
import { StatusBadge } from "@/components/media/MediaThumb";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { streamUrl } from "@/lib/media-urls";
import type { GuestbookMessageDto, HostEventDto, MediaDto, MediaPage, MediaStatus } from "@/types/domain";
import { useLang, useT } from "@/lib/i18n/provider";
import { ui } from "@/components/ui/styles";

export function GuestbookModerationTab({
  event,
  onMessage,
}: {
  event: HostEventDto;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const t = useT();
  const { locale } = useLang();
  const [messages, setMessages] = useState<GuestbookMessageDto[]>([]);
  const [media, setMedia] = useState<MediaDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, gm] = await Promise.all([
          apiFetch<{ items: GuestbookMessageDto[] }>(`/api/host/events/${event.id}/guestbook`),
          apiFetch<MediaPage>(`/api/host/events/${event.id}/media?guestbook=1&limit=100`),
        ]);
        if (cancelled) return;
        setMessages(m.items);
        setMedia(gm.items);
      } catch (error) {
        if (!cancelled) onMessage(errorMessage(error), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event.id, onMessage]);

  const updateMessage = async (msg: GuestbookMessageDto, status: MediaStatus) => {
    try {
      const res = await apiFetch<{ item: GuestbookMessageDto }>(`/api/host/guestbook/${msg.id}`, { method: "PATCH", json: { status } });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? res.item : m)));
    } catch (error) {
      onMessage(errorMessage(error), "error");
    }
  };

  const deleteMessage = async (msg: GuestbookMessageDto) => {
    if (!window.confirm(t("Bu mesaj silinsin mi?"))) return;
    try {
      await apiFetch(`/api/host/guestbook/${msg.id}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (error) {
      onMessage(errorMessage(error), "error");
    }
  };

  const updateMedia = async (item: MediaDto, status: MediaStatus) => {
    try {
      const res = await apiFetch<{ media: MediaDto }>(`/api/host/media/${item.id}`, { method: "PATCH", json: { status } });
      setMedia((prev) => prev.map((m) => (m.id === item.id ? res.media : m)));
    } catch (error) {
      onMessage(errorMessage(error), "error");
    }
  };

  const deleteMedia = async (item: MediaDto) => {
    if (!window.confirm(t("Bu kayıt Drive çöp kutusuna taşınsın mı?"))) return;
    try {
      await apiFetch(`/api/host/media/${item.id}`, { method: "DELETE" });
      setMedia((prev) => prev.filter((m) => m.id !== item.id));
    } catch (error) {
      onMessage(errorMessage(error), "error");
    }
  };

  const actions = (status: MediaStatus, onSet: (s: MediaStatus) => void, onDelete: () => void) => (
    <div className="flex shrink-0 gap-1">
      {status !== "approved" && (
        <button type="button" onClick={() => onSet("approved")} className="rounded-full p-2 text-emerald-700 hover:bg-emerald-50" aria-label={t("Onayla")}>
          <Check className="h-4 w-4" />
        </button>
      )}
      {status !== "hidden" && (
        <button type="button" onClick={() => onSet("hidden")} className="rounded-full p-2 text-stone-600 hover:bg-stone-100" aria-label={t("Gizle")}>
          <EyeOff className="h-4 w-4" />
        </button>
      )}
      <button type="button" onClick={onDelete} className="rounded-full p-2 text-rose-600 hover:bg-rose-50" aria-label={t("Sil")}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className={`mb-3 ${ui.sectionTitle}`}>{t("Yazılı notlar ({n})", { n: messages.length })}</h3>
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 py-10 text-center text-sm text-stone-500">{t("Henüz not yok.")}</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((msg) => (
              <li key={msg.id} className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm whitespace-pre-line text-stone-800">{msg.message}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    {msg.guestName} · {new Date(msg.createdAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
                    <StatusBadge status={msg.status} />
                  </p>
                </div>
                {actions(msg.status, (s) => void updateMessage(msg, s), () => void deleteMessage(msg))}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className={`mb-3 ${ui.sectionTitle}`}>{t("Sesli & video mesajlar ({n})", { n: media.length })}</h3>
        {media.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 py-10 text-center text-sm text-stone-500">{t("Henüz kayıt yok.")}</p>
        ) : (
          <ul className="space-y-2">
            {media.map((item) => (
              <li key={item.id} className="rounded-2xl border border-stone-200 bg-white p-3">
                {item.kind === "audio" ? (
                  <AudioPlayer src={streamUrl(item.fileId)} allowDownload className="w-full" />
                ) : (
                  <video src={streamUrl(item.fileId)} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black" />
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    {item.guestName ?? t("Misafir")} · {new Date(item.createdAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
                    <StatusBadge status={item.status} />
                  </p>
                  {actions(item.status, (s) => void updateMedia(item, s), () => void deleteMedia(item))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
