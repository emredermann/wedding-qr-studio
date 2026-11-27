import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "Mira — QR kodla düğün ve etkinlik fotoğraf albümü";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social preview (WhatsApp, X, LinkedIn, Google Discover): the Mira mark and
 * what it does, on ivory. Used by every page that does not set its own.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F7F5F0", padding: "72px 80px", color: "#1C1B18" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg viewBox="0 0 64 64" width="72" height="72">
            <circle cx="32" cy="32" r="16" fill="none" stroke="#1C1B18" strokeWidth="2" />
            <circle cx="43.3" cy="20.7" r="3.6" fill="#1C1B18" />
          </svg>
          <div style={{ fontSize: 56, letterSpacing: -1 }}>Mira</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 68, lineHeight: 1.08, letterSpacing: -2, maxWidth: 980 }}>Her etkinliğin fotoğrafları ve videoları, tek bir QR kodla.</div>
          <div style={{ fontSize: 30, color: "#6f665a", maxWidth: 980 }}>Düğün · nişan · kurumsal etkinlik · doğum günü — dijital davetiye, LCV ve oturma planı da dahil.</div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {["Uygulama yok", "Orijinal kalite", "Sizin Google Drive’ınız"].map((s) => (
            <div key={s} style={{ display: "flex", border: "2px solid #1C1B18", borderRadius: 999, padding: "10px 24px", fontSize: 24 }}>
              {s}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
