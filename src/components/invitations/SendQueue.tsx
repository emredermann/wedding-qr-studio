"use client";

import { Check, ChevronRight, Copy, MessageSquare, Phone, Share2, SkipForward, X } from "lucide-react";
import { useRef, useState } from "react";

import { useModalAccessibility } from "@/components/ui/Feedback";
import { ui } from "@/components/ui/styles";
import { useT } from "@/lib/i18n/provider";
import { formatPhone, smsUrl, type InviteeDto } from "@/lib/invitations/model";

/**
 * Sends invitations one after another with the phone's own tools: the SMS
 * app (when a number is known), the share sheet, or copy & paste anywhere.
 * No messaging service is involved; each send is marked so the list shows
 * who still needs one.
 */
export function SendQueue({
  list,
  messageFor,
  onMark,
  onClose,
}: {
  list: InviteeDto[];
  messageFor: (invitee: InviteeDto) => string;
  /** Marks one invitation as sent; resolves false when saving failed. */
  onMark: (invitee: InviteeDto) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState(0);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  useModalAccessibility({ isOpen: true, onClose, containerRef: ref });
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const done = index >= list.length;
  const current = done ? null : list[index];
  const text = current ? messageFor(current) : "";

  const next = () => {
    setCopied(false);
    setIndex((i) => i + 1);
  };
  const markAndNext = async () => {
    if (!current || busy) return;
    setBusy(true);
    if (await onMark(current)) setSent((n) => n + 1);
    setBusy(false);
    next();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ text });
      await markAndNext();
    } catch {
      // Share sheet closed without sending: stay on this invitee.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("Toplu gönder")}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className={ui.sectionTitle}>{t("Toplu gönder")}</h2>
          <button type="button" onClick={onClose} aria-label={t("Kapat")} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={Math.min(index, list.length)} aria-valuemin={0} aria-valuemax={list.length}>
          <div className="h-full bg-stone-900 transition-[width]" style={{ width: `${(Math.min(index, list.length) / Math.max(1, list.length)) * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-stone-500 tabular-nums">
          {done ? t("{n} / {total} tamamlandı", { n: list.length, total: list.length }) : t("{n} / {total}", { n: index + 1, total: list.length })}
        </p>

        {current ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-lg font-semibold text-stone-900">{current.name ?? t("İsimsiz davetiye")}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-stone-600">
                <Phone className="h-3.5 w-3.5" />
                {current.phone ? formatPhone(current.phone) : <span className="text-stone-400">{t("Telefon yok: mesajı kopyalayıp gönderin")}</span>}
              </p>
            </div>
            <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-stone-800 [overflow-wrap:anywhere]">{text}</p>

            <div className="grid gap-2 sm:grid-cols-2">
              {current.phone && (
                <a
                  href={smsUrl(current.phone, text)}
                  onClick={() => void markAndNext()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white"
                >
                  <MessageSquare className="h-4 w-4" /> {t("SMS ile gönder")}
                </a>
              )}
              {canShare && (
                <button type="button" onClick={() => void share()} className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${current.phone ? "border border-stone-300 text-stone-800" : "bg-stone-900 text-white"}`}>
                  <Share2 className="h-4 w-4" /> {t("Paylaş…")}
                </button>
              )}
              <button type="button" onClick={() => void copy()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-300 px-4 py-3 text-sm font-medium text-stone-800">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? t("Kopyalandı") : t("Mesajı kopyala")}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-3">
              <button type="button" onClick={next} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
                <SkipForward className="h-4 w-4" /> {t("Atla")}
              </button>
              <button type="button" onClick={() => void markAndNext()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 disabled:opacity-50">
                {t("Gönderdim, sonraki")} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <p className={ui.hint}>{t("SMS ve paylaşım telefonda açılır. Bilgisayardaysanız mesajı kopyalayıp dilediğiniz yerden gönderin. Hiçbir ücretli servis kullanılmaz.")}</p>
          </div>
        ) : (
          <div className="mt-6 text-center">
            <Check className="mx-auto h-9 w-9 text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-stone-900">{t("{n} davetiye gönderildi olarak işaretlendi.", { n: sent })}</p>
            <button type="button" onClick={onClose} className="mt-5 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white">
              {t("Kapat")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
