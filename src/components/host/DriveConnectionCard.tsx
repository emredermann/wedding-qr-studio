"use client";

import { AlertTriangle, CheckCircle2, HardDrive, Loader2, Unplug, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { apiFetch, errorMessage } from "@/lib/client/api";
import type { DriveConnectionStatusDto } from "@/types/domain";

const CONNECT_URL = "/api/host/drive/connect";

const CALLBACK_ERRORS: Record<string, string> = {
  denied: "Google izni verilmedi. Bağlantı yapılmadı.",
  scope:
    "Google Drive izni işaretlenmedi. Tekrar bağlanırken izin ekranındaki Google Drive kutucuğunu işaretleyin.",
  refresh:
    "Google kalıcı erişim anahtarı vermedi. myaccount.google.com/permissions adresinden uygulamayı kaldırıp tekrar bağlanın.",
  account_mismatch:
    "Farklı bir Google hesabı seçtiniz. Mevcut etkinliklerinizin medyası önceki hesabın Drive'ında; aynı hesapla bağlanın.",
  state: "Bağlantı isteği doğrulanamadı veya süresi doldu. Lütfen tekrar deneyin.",
  session: "Oturumunuz kapanmış. Giriş yapıp tekrar deneyin.",
  token_exchange:
    "Google ile yetkilendirme tamamlanamadı. Google Cloud'daki yönlendirme adresini (…/api/host/drive/callback) kontrol edin.",
};

/**
 * "Connect Google Drive" card on the events dashboard. Shows where new
 * events will store their media and the result of the OAuth round trip
 * (`?drive=connected|error&reason=…`, read straight from the URL).
 */
export function DriveConnectionCard({
  status,
  onChanged,
}: {
  status: DriveConnectionStatusDto | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcome = params.get("drive");
  const reason = params.get("reason") ?? "";
  const banner =
    outcome === "connected"
      ? { ok: true, text: "Google Drive'ınız bağlandı. Yeni etkinliklerin medyası artık kendi Drive'ınıza kaydedilecek." }
      : outcome === "error"
        ? { ok: false, text: CALLBACK_ERRORS[reason] ?? "Google Drive bağlanamadı. Lütfen tekrar deneyin." }
        : null;

  const disconnect = async () => {
    if (!window.confirm("Google Drive bağlantısı kaldırılsın mı? Drive'ınızdaki dosyalar silinmez.")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/host/drive", { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-5">
      {banner && (
        <div
          role="status"
          className={`mb-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${banner.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-800"}`}
        >
          {banner.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{banner.text}</span>
          <button type="button" onClick={() => router.replace("/dashboard")} aria-label="Kapat" className="rounded-full p-0.5 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <HardDrive className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-stone-900">Google Drive depolama</h2>
          {!status ? (
            <p className="flex items-center gap-1.5 text-sm text-stone-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Kontrol ediliyor…
            </p>
          ) : status.connected ? (
            <p className="text-sm text-stone-600">
              Bağlı: <span className="font-medium text-stone-900">{status.email ?? "Google hesabınız"}</span>. Fotoğraf, video ve ses kayıtları
              Drive’ınızdaki <span className="font-medium">“Wedding QR”</span> klasörüne kaydedilir.
            </p>
          ) : status.status === "revoked" ? (
            <p className="text-sm text-rose-700">
              Google Drive bağlantınız kopmuş (erişim iptal edilmiş veya süresi dolmuş). Bu Drive’ı kullanan etkinliklerde yükleme yapılamaz;
              aynı Google hesabıyla yeniden bağlayın.
            </p>
          ) : status.platformDriveAvailable ? (
            <p className="text-sm text-stone-600">
              Şu an yeni etkinlikler <span className="font-medium">platform Drive’ına</span> kaydediliyor. Medyanın kendi Google Drive’ınızda durmasını
              istiyorsanız bağlayın.
            </p>
          ) : (
            <p className="text-sm text-stone-600">Etkinlik oluşturmadan önce medyanın saklanacağı Google Drive’ınızı bağlayın. Ücretsizdir.</p>
          )}
          {status?.connected && status.eventsOnOwnDrive > 0 && (
            <p className="mt-1 text-xs text-stone-500">{status.eventsOnOwnDrive} etkinlik bu Drive’ı kullanıyor.</p>
          )}
          {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
        </div>
        {status && (
          <div className="flex shrink-0 gap-2">
            {status.connected ? (
              <button
                type="button"
                onClick={disconnect}
                disabled={busy || status.eventsOnOwnDrive > 0}
                title={status.eventsOnOwnDrive > 0 ? "Bu Drive’ı kullanan etkinlikler varken bağlantı kaldırılamaz." : undefined}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-4 py-2 text-xs font-medium text-stone-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />} Bağlantıyı kaldır
              </button>
            ) : (
              <a href={CONNECT_URL} className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white">
                <HardDrive className="h-4 w-4" />
                {status.status === "revoked" ? "Yeniden bağla" : "Google Drive’ı bağla"}
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
