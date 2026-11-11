"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { BRAND } from "@/lib/brand";
import { useT } from "@/lib/i18n/provider";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Smooth ease for the zoom so it starts gently and accelerates into the letter. */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Landing hero: a pinned stage with a giant "Mira" wordmark. Scrolling flies the
 * camera into the stem of the "i" until the ink fills the screen, which hands
 * over to the dark section that follows. Overlay copy uses `mix-blend-difference`
 * so it stays legible on ivory and on ink.
 *
 * Without JS, or with `prefers-reduced-motion`, it is a static full-height hero.
 */
export function HeroFlyThrough({ children }: { children: ReactNode }) {
  const t = useT();
  const sectionRef = useRef<HTMLElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const iRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const word = wordRef.current;
    const letter = iRef.current;
    const overlay = overlayRef.current;
    if (!section || !word || !letter || !overlay) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let maxScale = 80;
    let frame = 0;

    const measure = () => {
      word.style.transform = "none";
      const w = word.getBoundingClientRect();
      const i = letter.getBoundingClientRect();
      // Stem of the "i": horizontally centred in its box, vertically within the x-height.
      const ox = i.left + i.width / 2 - w.left;
      const oy = i.top + i.height * 0.64 - w.top;
      word.style.transformOrigin = `${ox}px ${oy}px`;
      // The stem is roughly a quarter of the glyph's advance; scale until it is wider than the screen.
      const stem = Math.max(1, i.width * 0.22);
      maxScale = Math.max(40, (Math.max(window.innerWidth, window.innerHeight) * 1.6) / stem);
      update();
    };

    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const p = clamp01(-rect.top / travel);
      // Hold the wordmark for the first 10 %, then fly through; the ink fills the
      // screen right at the end so the dark section follows without a blank stretch.
      const z = ease(clamp01((p - 0.1) / 0.9));
      word.style.transform = `scale(${Math.pow(maxScale, z).toFixed(4)})`;
      overlay.style.opacity = String(1 - clamp01((p - 0.18) / 0.22));
      overlay.style.visibility = p > 0.42 ? "hidden" : "visible";
      if (hintRef.current) hintRef.current.style.opacity = String(1 - clamp01(p / 0.08));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    measure();
    // Fonts change the glyph box; re-measure once they are ready.
    void document.fonts?.ready.then(measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative h-[260vh] bg-stone-50 motion-reduce:h-dvh">
      {/* The sticky stage is its own stacking context, so it needs its own background
          for the overlay's mix-blend-difference to have something to blend with. */}
      <div className="sticky top-0 h-dvh overflow-hidden bg-stone-50">
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span
            ref={wordRef}
            className="font-brand leading-none text-stone-900 select-none"
            style={{ fontSize: "clamp(8rem, 36vw, 46rem)" }}
          >
            M<span ref={iRef}>i</span>ra
          </span>
        </div>

        <div ref={overlayRef} className="relative z-10 h-full text-stone-50 mix-blend-difference">
          {children}
        </div>

        <div
          ref={hintRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center text-xs text-stone-50 mix-blend-difference motion-reduce:hidden"
        >
          {t("Kaydırın")}
        </div>
        <span className="sr-only">{BRAND.name}</span>
      </div>
    </section>
  );
}
