"use client";

import { Feather, Loader2, Mic, Send, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Recorder, type Recording } from "@/components/guest/Recorder";
import { AudioPlayer } from "@/components/media/AudioPlayer";
import { StatusBadge } from "@/components/media/MediaThumb";
import { trackEvent } from "@/lib/client/analytics";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { uploadToDrive } from "@/lib/client/drive-upload";
import { useLang, useT } from "@/lib/i18n/provider";
import { streamUrl } from "@/lib/media-urls";
import type { GuestbookMessageDto, MediaDto, MediaPage, PublicEventDto } from "@/types/domain";

type Entry =
  | { type: "text"; createdAt: string; message: GuestbookMessageDto }
  | { type: "media"; createdAt: string; media: MediaDto };

export function GuestbookPanel({
  event,
  guestName,
  tableNo,
  onMessage,
}: {
  event: PublicEventDto;
  guestName: string;
  tableNo: number | null;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const t = useT();
  const { locale } = useLang();
  const [messages, setMessages] = useState<GuestbookMessageDto[]>([]);
  const [mediaEntries, setMediaEntries] = useState<MediaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recorderMode, setRecorderMode] = useState<"audio" | "video" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const slug = encodeURIComponent(event.slug);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [textRes, mediaRes] = await Promise.all([
          apiFetch<{ items: GuestbookMessageDto[] }>(`/api/events/${slug}/guestbook`),
          apiFetch<MediaPage>(`/api/events/${slug}/media?guestbook=1&limit=100`),
        ]);
        if (cancelled) return;
        setMessages(textRes.items);
        setMediaEntries(mediaRes.items);
      } catch (error) {
        if (!cancelled) onMessage(errorMessage(error), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, onMessage]);

  const submitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch<{ item: GuestbookMessageDto }>(`/api/events/${slug}/guestbook`, {
        method: "POST",
        json: { guestName, message: text.trim() },
      });
      setMessages((prev) => [res.item, ...prev]);
      trackEvent("guestbook_note_sent");
      setText("");
      onMessage(event.requireApproval ? t("Mesajınız onaydan sonra görünecek. Teşekkürler!") : t("Mesajınız anı defterine eklendi 💛"), "success");
    } catch (error) {
      onMessage(errorMessage(error), "error");
    } finally {
      setSending(false);
    }
  };

  const closeRecorder = useCallback(() => setRecorderMode(null), []);
  const recorderError = useCallback((message: string) => onMessage(message, "error"), [onMessage]);

  const uploadRecording = async (recording: Recording) => {
    setRecorderMode(null);
    setUploadProgress(0);
    try {
      const file = new File([recording.blob], recording.fileName, { type: recording.mimeType });
      const media = await uploadToDrive({
        file,
        fileName: recording.fileName,
        eventSlug: event.slug,
        guestName,
        tableNo,
        isGuestbook: true,
        onProgress: setUploadProgress,
      });
      setMediaEntries((prev) => [media, ...prev]);
      trackEvent("guestbook_recording_sent", { kind: media.kind === "audio" ? "audio" : "video" });
      onMessage(t("Mesajınız kaydedildi. Teşekkürler!"), "success");
    } catch (error) {
      onMessage(errorMessage(error), "error");
    } finally {
      setUploadProgress(null);
    }
  };

  if (!event.guestbookEnabled) {
    return <p className="rounded-3xl bg-white/80 p-8 text-center text-stone-600">{t("Anı defteri bu etkinlikte kapalı.")}</p>;
  }

  const entries: Entry[] = [
    ...messages.map((message) => ({ type: "text" as const, createdAt: message.createdAt, message })),
    ...mediaEntries.map((media) => ({ type: "media" as const, createdAt: media.createdAt, media })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-5">
      <form onSubmit={submitText} className="rounded-3xl border border-stone-200 bg-white p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-800">
          <Feather className="h-4 w-4" /> {t("Etkinlik sahibine bir not bırakın")}
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder={t("Harika bir gündü, her şey için teşekkürler…")}
          className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-stone-500"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-stone-400">{text.length}/1000</span>
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("Gönder")}
          </button>
        </div>
      </form>

      {recorderMode ? (
        <Recorder mode={recorderMode} onDone={uploadRecording} onCancel={closeRecorder} onError={recorderError} />
      ) : uploadProgress !== null ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-4 text-sm text-stone-700">
          <p className="mb-2 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Mesajınız yükleniyor…")}{" "}
            {new Intl.NumberFormat(locale, { style: "percent" }).format(Math.round(uploadProgress * 100) / 100)}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full" style={{ width: `${Math.round(uploadProgress * 100)}%`, backgroundColor: "var(--accent)" }} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setRecorderMode("audio")} className="flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white py-4 text-sm font-semibold text-stone-800">
            <Mic className="h-5 w-5" style={{ color: "var(--accent)" }} /> {t("Sesli mesaj")}
          </button>
          <button type="button" onClick={() => setRecorderMode("video")} className="flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white py-4 text-sm font-semibold text-stone-800">
            <Video className="h-5 w-5" style={{ color: "var(--accent)" }} /> {t("Video mesaj")}
          </button>
        </div>
      )}

      <section>
        <h3 className="mb-3 font-serif text-lg text-stone-900">{t("Anı Defteri")}</h3>
        {loading ? (
          <div className="flex justify-center py-10 text-stone-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 py-10 text-center text-sm text-stone-500">{t("İlk mesajı siz bırakın.")}</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) =>
              entry.type === "text" ? (
                <li key={`t-${entry.message.id}`} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="font-serif text-[15px] leading-relaxed whitespace-pre-line text-stone-800">“{entry.message.message}”</p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-stone-500">
                    — {entry.message.guestName} <StatusBadge status={entry.message.status} />
                  </p>
                </li>
              ) : (
                <li key={`m-${entry.media.id}`} className="rounded-2xl bg-white p-3 shadow-sm">
                  {entry.media.kind === "audio" ? (
                    <AudioPlayer src={streamUrl(entry.media.fileId)} className="w-full" />
                  ) : (
                    <video src={streamUrl(entry.media.fileId)} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black" />
                  )}
                  <p className="mt-2 flex items-center gap-2 text-xs text-stone-500">
                    — {entry.media.guestName ?? t("Misafir")} <StatusBadge status={entry.media.status} />
                  </p>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
