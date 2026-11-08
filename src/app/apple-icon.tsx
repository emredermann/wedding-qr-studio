import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0A0908",
        }}
      >
        <svg
          viewBox="0 0 64 64"
          width="180"
          height="180"
          style={{ width: 180, height: 180 }}
        >
          <defs>
            <radialGradient id="apple-lumina-bg" cx="32" cy="32" r="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1C1917" />
              <stop offset="100%" stopColor="#0A0908" />
            </radialGradient>
            <linearGradient id="apple-lumina-gold" x1="12" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FAF5EB" />
              <stop offset="35%" stopColor="#E4C486" />
              <stop offset="75%" stopColor="#C49944" />
              <stop offset="100%" stopColor="#8D6727" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="16" fill="url(#apple-lumina-bg)" />
          <rect x="1.5" y="1.5" width="61" height="61" rx="14.5" stroke="url(#apple-lumina-gold)" strokeWidth="1" strokeOpacity="0.35" />
          <circle cx="32" cy="32" r="23" stroke="url(#apple-lumina-gold)" strokeWidth="1.25" />
          <circle cx="32" cy="32" r="20.5" stroke="url(#apple-lumina-gold)" strokeWidth="0.75" strokeOpacity="0.4" />
          <path d="M32 13C32 23.4934 40.5066 32 51 32C40.5066 32 32 40.5066 32 51C32 40.5066 23.4934 32 13 32C23.4934 32 32 23.4934 32 13Z" fill="url(#apple-lumina-gold)" />
          <path d="M26.5 26.5L37.5 37.5M37.5 26.5L26.5 37.5" stroke="url(#apple-lumina-gold)" strokeWidth="1" strokeOpacity="0.65" strokeLinecap="round" />
          <circle cx="32" cy="32" r="3.2" fill="#0E0C0B" />
          <circle cx="32" cy="32" r="1.5" fill="url(#apple-lumina-gold)" />
        </svg>
      </div>
    ),
    {
      ...size,
    },
  );
}
