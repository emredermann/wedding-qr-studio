"use client";

import { useState } from "react";

import { initials } from "@/components/seating/labels";
import { useT } from "@/lib/i18n/provider";
import type { TemplateLook } from "@/components/invitations/InvitationCard";
import { INVITE_FAMILY } from "@/lib/invite-fonts";

/**
 * Sealed envelope shown before the invitation: tapping the seal lifts the
 * flap and slides the envelope away. Skipped instantly with reduced motion.
 */
export function Envelope({ look, names, greeting, onOpen }: { look: TemplateLook; names: string; greeting: string | null; onOpen: () => void }) {
  const t = useT();
  const [opening, setOpening] = useState(false);
  const open = () => {
    if (opening) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return onOpen();
    setOpening(true);
    window.setTimeout(onOpen, 1100);
  };
  const paper = look.paper === "#14213d" ? "#1d2c4f" : "#f7f1e6";
  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 transition-opacity duration-500 ${opening ? "opacity-0 delay-700" : "opacity-100"}`} style={{ background: look.page }}>
      {greeting && (
        <p className="mb-6 text-center text-lg italic" style={{ color: look.paper === "#14213d" ? "#e8dfcf" : "#5b534a", fontFamily: INVITE_FAMILY.serif }}>
          {t("Sevgili {name},", { name: greeting })}
        </p>
      )}
      <button
        type="button"
        onClick={open}
        aria-label={t("Davetiyeyi aç")}
        className={`relative aspect-[3/2] w-full max-w-sm transition-transform duration-700 ${opening ? "translate-y-6" : "hover:-translate-y-1"}`}
        style={{ perspective: "900px" }}
      >
        {/* back + pocket */}
        <div className="absolute inset-0 rounded-md shadow-[0_24px_50px_-20px_rgba(0,0,0,0.45)]" style={{ background: paper }} />
        <div className="absolute inset-0 rounded-md" style={{ background: `linear-gradient(160deg, transparent 49.5%, ${paper} 50%), linear-gradient(200deg, transparent 49.5%, ${paper} 50%)`, filter: "brightness(0.96)" }} />
        {/* flap */}
        <div
          className="absolute inset-x-0 top-0 h-[58%] origin-top transition-transform duration-700 ease-in-out"
          style={{ transform: opening ? "rotateX(180deg)" : "rotateX(0deg)", transformStyle: "preserve-3d" }}
        >
          <div className="h-full w-full" style={{ background: paper, filter: "brightness(0.92)", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
        </div>
        {/* seal */}
        <span
          className={`absolute top-[58%] left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-lg text-white shadow-md transition-opacity duration-300 ${opening ? "opacity-0" : "opacity-100"}`}
          style={{ background: look.accent, fontFamily: INVITE_FAMILY.serif }}
        >
          {initials(names.replace(/&|ve|and/gi, " "))}
        </span>
      </button>
      <p className={`mt-8 text-xs tracking-[0.3em] uppercase transition-opacity ${opening ? "opacity-0" : "opacity-70"}`} style={{ color: look.paper === "#14213d" ? "#e8dfcf" : "#5b534a" }}>
        {t("Açmak için dokunun")}
      </p>
    </div>
  );
}
