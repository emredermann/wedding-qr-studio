"use client";

import { useRef } from "react";

/**
 * `<audio>` that also plays MediaRecorder WebM files correctly. Chrome writes
 * WebM recordings without a duration, so the native player shows 0:00 and
 * cannot seek. Seeking far past the end once makes the browser scan the file
 * and compute the real duration; playback then resumes from the start.
 */
export function AudioPlayer({ src, autoPlay = false, className }: { src: string; autoPlay?: boolean; className?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const fixing = useRef<{ resume: boolean } | null>(null);

  const onLoadedMetadata = () => {
    const el = ref.current;
    if (!el || Number.isFinite(el.duration)) return;
    fixing.current = { resume: !el.paused || autoPlay };
    el.currentTime = Number.MAX_SAFE_INTEGER;
  };

  const onDurationChange = () => {
    const el = ref.current;
    const pending = fixing.current;
    if (!el || !pending || !Number.isFinite(el.duration)) return;
    fixing.current = null;
    el.currentTime = 0;
    if (pending.resume) el.play().catch(() => undefined);
  };

  return (
    <audio
      ref={ref}
      src={src}
      controls
      preload={autoPlay ? "auto" : "none"}
      autoPlay={autoPlay}
      onLoadedMetadata={onLoadedMetadata}
      onDurationChange={onDurationChange}
      className={className}
    />
  );
}
