import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon: the Mira orbit and point on a full-bleed ink tile. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1C1B18" }}>
        <svg viewBox="0 0 64 64" width="180" height="180">
          <circle cx="32" cy="32" r="16" fill="none" stroke="#F7F5F0" strokeWidth="1.8" />
          <circle cx="43.3" cy="20.7" r="3.6" fill="#F7F5F0" />
        </svg>
      </div>
    ),
    size,
  );
}
