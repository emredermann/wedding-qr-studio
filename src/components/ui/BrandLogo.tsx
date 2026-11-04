"use client";

import React from "react";

export interface BrandCrestProps {
  className?: string;
  withBackground?: boolean;
}

/**
 * Lumina — Haute Horlogerie & Editorial Jewelry Crest
 * Features a pure obsidian squircle medallion (#141210 / #0A0908),
 * concentric precision bezel rings (representing wedding bands & lens optics),
 * and a radiant 4-pointed curved Lumina starlight prism with subtle optical accents.
 */
export function BrandCrest({
  className = "h-8 w-8",
  withBackground = true,
}: BrandCrestProps) {
  const uid = React.useId();
  const goldGradId = `lumina-gold-${uid}`;
  const bgGradId = `lumina-bg-${uid}`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient
          id={bgGradId}
          cx="32"
          cy="32"
          r="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#1C1917" />
          <stop offset="100%" stopColor="#0A0908" />
        </radialGradient>
        <linearGradient
          id={goldGradId}
          x1="12"
          y1="10"
          x2="52"
          y2="54"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FAF5EB" />
          <stop offset="35%" stopColor="#E4C486" />
          <stop offset="75%" stopColor="#C49944" />
          <stop offset="100%" stopColor="#8D6727" />
        </linearGradient>
      </defs>

      {/* Obsidian Satin Squircle Medallion */}
      {withBackground && (
        <>
          <rect width="64" height="64" rx="16" fill={`url(#${bgGradId})`} />
          <rect
            x="1.5"
            y="1.5"
            width="61"
            height="61"
            rx="14.5"
            stroke={`url(#${goldGradId})`}
            strokeWidth="1"
            strokeOpacity="0.35"
          />
        </>
      )}

      {/* Outer Precision Bezel / Wedding Band Rim */}
      <circle
        cx="32"
        cy="32"
        r="23"
        stroke={`url(#${goldGradId})`}
        strokeWidth="1.25"
      />

      {/* Inner Optical Bezel Ring */}
      <circle
        cx="32"
        cy="32"
        r="20.5"
        stroke={`url(#${goldGradId})`}
        strokeWidth="0.75"
        strokeOpacity="0.4"
      />

      {/* Lumina Solitaire 4-Point Starlight / Diamond Prism */}
      <path
        d="M32 13C32 23.4934 40.5066 32 51 32C40.5066 32 32 40.5066 32 51C32 40.5066 23.4934 32 13 32C23.4934 32 32 23.4934 32 13Z"
        fill={`url(#${goldGradId})`}
      />

      {/* 4 Diagonal Micro Rays */}
      <path
        d="M26.5 26.5L37.5 37.5M37.5 26.5L26.5 37.5"
        stroke={`url(#${goldGradId})`}
        strokeWidth="1"
        strokeOpacity="0.65"
        strokeLinecap="round"
      />

      {/* Central Aperture Lens Eye */}
      <circle cx="32" cy="32" r="3.2" fill={withBackground ? "#0E0C0B" : "#FAF5EB"} />
      <circle cx="32" cy="32" r="1.5" fill={`url(#${goldGradId})`} />
    </svg>
  );
}

export interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
  showSubtitle?: boolean;
}

export function BrandLogo({
  className = "",
  iconClassName = "h-8 w-8",
  showSubtitle = true,
}: BrandLogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <BrandCrest className={iconClassName} />
      <div className="flex flex-col leading-tight">
        <span className="font-serif text-lg font-semibold tracking-tight text-stone-900">
          Lumina
        </span>
        {showSubtitle && (
          <span className="text-[10px] uppercase tracking-[0.22em] text-stone-700">
            Biometric Memory Vault
          </span>
        )}
      </div>
    </div>
  );
}
