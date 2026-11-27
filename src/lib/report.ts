/**
 * Attendance report: aggregates an event's uploads into the numbers the host
 * report shows. Dependency-free so `node --test` can load it directly.
 */
export interface ReportMediaRow {
  kind: "photo" | "video" | "audio";
  status: "approved" | "pending" | "hidden";
  size_bytes: number | string;
  guest_session_id: string | null;
  guest_name: string | null;
  created_at: string;
  heart_count?: number | null;
  challenge_id?: string | null;
  category: string | null;
  is_guestbook: boolean;
  drive_file_id: string;
}

export interface ReportDto {
  generatedAt: string;
  totals: { items: number; photos: number; videos: number; audio: number; bytes: number; guests: number; hearts: number; guestbookNotes: number; guestbookRecordings: number };
  /** Uploads per UTC hour ("2026-12-12T19:00:00.000Z"), oldest first; the browser shows local hours. */
  hourly: Array<{ hour: string; count: number }>;
  firstUpload: string | null;
  lastUpload: string | null;
  topContributors: Array<{ name: string; count: number }>;
  challenges: Array<{ id: string; title: string; count: number; players: number }>;
  categories: Array<{ name: string; count: number }>;
  /** Most-hearted approved photos. */
  topPhotos: Array<{ fileId: string; hearts: number; guestName: string | null }>;
}

export function buildReport(
  rows: ReportMediaRow[],
  options: { challenges: Array<{ id: string; title: string }>; guestbookNotes: number; now?: Date },
): ReportDto {
  const totals = { items: rows.length, photos: 0, videos: 0, audio: 0, bytes: 0, guests: 0, hearts: 0, guestbookNotes: options.guestbookNotes, guestbookRecordings: 0 };
  const guests = new Map<string, { name: string; count: number; at: string }>();
  const hours = new Map<string, number>();
  const categories = new Map<string, number>();
  const challengeCounts = new Map<string, { count: number; players: Set<string> }>();
  let first: string | null = null;
  let last: string | null = null;

  for (const row of rows) {
    if (row.kind === "photo") totals.photos += 1;
    else if (row.kind === "video") totals.videos += 1;
    else totals.audio += 1;
    if (row.is_guestbook) totals.guestbookRecordings += 1;
    totals.bytes += Number(row.size_bytes) || 0;
    totals.hearts += Number(row.heart_count ?? 0) || 0;

    const at = new Date(row.created_at);
    if (!Number.isNaN(at.getTime())) {
      at.setUTCMinutes(0, 0, 0);
      const key = at.toISOString();
      hours.set(key, (hours.get(key) ?? 0) + 1);
      if (!first || row.created_at < first) first = row.created_at;
      if (!last || row.created_at > last) last = row.created_at;
    }
    if (row.guest_session_id) {
      const g = guests.get(row.guest_session_id) ?? { name: "", count: 0, at: "" };
      g.count += 1;
      if (row.created_at >= g.at) {
        g.at = row.created_at;
        if (row.guest_name?.trim()) g.name = row.guest_name.trim().slice(0, 40);
      }
      guests.set(row.guest_session_id, g);
    }
    if (row.category) categories.set(row.category, (categories.get(row.category) ?? 0) + 1);
    if (row.challenge_id && row.status === "approved") {
      const c = challengeCounts.get(row.challenge_id) ?? { count: 0, players: new Set<string>() };
      c.count += 1;
      if (row.guest_session_id) c.players.add(row.guest_session_id);
      challengeCounts.set(row.challenge_id, c);
    }
  }
  totals.guests = guests.size;

  // Fill empty hours between the first and last upload so the chart has no gaps.
  const hourly: ReportDto["hourly"] = [];
  const keys = [...hours.keys()].sort();
  if (keys.length > 0) {
    const start = new Date(keys[0]).getTime();
    const end = new Date(keys[keys.length - 1]).getTime();
    const span = Math.min((end - start) / 3_600_000, 24 * 14);
    for (let i = 0; i <= span; i += 1) {
      const key = new Date(start + i * 3_600_000).toISOString();
      hourly.push({ hour: key, count: hours.get(key) ?? 0 });
    }
  }

  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    totals,
    hourly,
    firstUpload: first,
    lastUpload: last,
    topContributors: [...guests.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((g) => ({ name: g.name, count: g.count })),
    challenges: options.challenges.map((c) => ({
      id: c.id,
      title: c.title,
      count: challengeCounts.get(c.id)?.count ?? 0,
      players: challengeCounts.get(c.id)?.players.size ?? 0,
    })),
    categories: [...categories.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    topPhotos: rows
      .filter((r) => r.kind === "photo" && r.status === "approved" && Number(r.heart_count ?? 0) > 0)
      .sort((a, b) => Number(b.heart_count ?? 0) - Number(a.heart_count ?? 0))
      .slice(0, 6)
      .map((r) => ({ fileId: r.drive_file_id, hearts: Number(r.heart_count ?? 0), guestName: r.guest_name })),
  };
}
