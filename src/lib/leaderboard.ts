/**
 * Photo-challenge leaderboard: guests ranked by how many different
 * challenges they completed (approved photos/videos), then by how many
 * challenge shots they sent, then by who got there first.
 *
 * Dependency-free so `node --test` can load it directly.
 */
export interface ChallengeEntryRow {
  guest_session_id: string | null;
  guest_name: string | null;
  challenge_id: string | null;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  /** Different challenges completed. */
  completed: number;
  /** Challenge photos/videos sent. */
  shots: number;
}

export interface LeaderboardDto {
  totalChallenges: number;
  /** Top guests (names only when the gallery is public; "" = unnamed, shown as "Misafir"). */
  top: LeaderboardEntry[];
  /** The asking guest, if they joined any challenge. */
  me: LeaderboardEntry | null;
  /** Guests who joined at least one challenge. */
  players: number;
}

export function buildLeaderboard(
  rows: ChallengeEntryRow[],
  challengeIds: readonly string[],
  options: { mySessionId?: string | null; limit?: number; showNames?: boolean } = {},
): LeaderboardDto {
  const known = new Set(challengeIds);
  const players = new Map<string, { name: string; done: Set<string>; shots: number; lastAt: string }>();
  for (const row of rows) {
    if (!row.guest_session_id || !row.challenge_id || !known.has(row.challenge_id)) continue;
    const player = players.get(row.guest_session_id) ?? { name: "", done: new Set<string>(), shots: 0, lastAt: "" };
    player.done.add(row.challenge_id);
    player.shots += 1;
    // The most recent name the guest used, like the guest list does.
    if (row.created_at >= player.lastAt) {
      player.lastAt = row.created_at;
      if (row.guest_name?.trim()) player.name = row.guest_name.trim().slice(0, 40);
    }
    players.set(row.guest_session_id, player);
  }

  const ranked = [...players.entries()]
    .map(([sessionId, p]) => ({ sessionId, name: p.name, completed: p.done.size, shots: p.shots, lastAt: p.lastAt }))
    .sort((a, b) => b.completed - a.completed || b.shots - a.shots || a.lastAt.localeCompare(b.lastAt));

  const entries = ranked.map((p, i) => ({ ...p, rank: i + 1 }));
  const show = options.showNames !== false;
  const strip = (e: (typeof entries)[number]): LeaderboardEntry => ({ rank: e.rank, name: show ? e.name : "", completed: e.completed, shots: e.shots });
  const mine = options.mySessionId ? entries.find((e) => e.sessionId === options.mySessionId) : undefined;

  return {
    totalChallenges: known.size,
    top: show ? entries.slice(0, options.limit ?? 10).map(strip) : [],
    me: mine ? { ...strip(mine), name: mine.name } : null,
    players: entries.length,
  };
}
