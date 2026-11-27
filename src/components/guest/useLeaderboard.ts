"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/client/api";
import type { LeaderboardDto } from "@/lib/leaderboard";

/** Polls the challenge leaderboard while `enabled`; `refreshKey` forces a reload (e.g. after an upload). */
export function useLeaderboard(slug: string, enabled: boolean, refreshKey: unknown = null, intervalMs = 30_000): LeaderboardDto | null {
  const [board, setBoard] = useState<LeaderboardDto | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      apiFetch<LeaderboardDto>(`/api/events/${encodeURIComponent(slug)}/leaderboard`)
        .then((res) => {
          if (!cancelled) setBoard(res);
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [slug, enabled, refreshKey, intervalMs]);
  return enabled ? board : null;
}

export const MEDALS = ["🥇", "🥈", "🥉"] as const;
