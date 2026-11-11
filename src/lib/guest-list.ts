import type { GuestListDto, GuestSummaryDto } from "@/types/domain";

export interface GuestMediaRow {
  guest_session_id: string | null;
  guest_name: string | null;
  kind: "photo" | "video" | "audio";
  is_guestbook: boolean;
  size_bytes: number | string;
  created_at: string;
  table_no?: number | null;
}

export interface GuestNoteRow {
  guest_session_id: string | null;
  guest_name: string;
  created_at: string;
}

export interface GuestHeartRow {
  guest_session_id: string;
  guest_name: string | null;
  name_visible: boolean;
  created_at: string;
}

interface Acc extends Omit<GuestSummaryDto, "id" | "name"> {
  name: string | null;
  nameAt: string;
}

/**
 * Builds the host's guest list from uploads, written notes and hearts. Guests
 * are grouped by their browser session (or by name for rows without one);
 * session IDs never leave the server. Hearts are only counted while the event
 * shows heart names, and only those given while names were on, so the list
 * never reveals who hearted in anonymous mode.
 */
export function buildGuestList(
  media: GuestMediaRow[],
  notes: GuestNoteRow[],
  hearts: GuestHeartRow[],
  options: { heartsNamed: boolean; tableNumbers: boolean },
): GuestListDto {
  const guests = new Map<string, Acc>();
  const keyFor = (session: string | null, name: string | null) =>
    session ? `s:${session}` : `n:${(name ?? "").trim().toLocaleLowerCase("tr-TR")}`;

  const touch = (key: string, name: string | null, at: string): Acc => {
    let g = guests.get(key);
    if (!g) {
      g = { name: null, nameAt: "", tableNo: null, photos: 0, videos: 0, messages: 0, hearts: options.heartsNamed ? 0 : null, totalBytes: 0, firstSeen: at, lastSeen: at };
      guests.set(key, g);
    }
    const clean = name?.trim();
    // Keep the most recent name the guest used.
    if (clean && at >= g.nameAt) {
      g.name = clean;
      g.nameAt = at;
    }
    if (at < g.firstSeen) g.firstSeen = at;
    if (at > g.lastSeen) g.lastSeen = at;
    return g;
  };

  for (const row of media) {
    const g = touch(keyFor(row.guest_session_id, row.guest_name), row.guest_name, row.created_at);
    if (row.is_guestbook) g.messages += 1;
    else if (row.kind === "photo") g.photos += 1;
    else if (row.kind === "video") g.videos += 1;
    g.totalBytes += Number(row.size_bytes) || 0;
    if (options.tableNumbers && row.table_no !== null && row.table_no !== undefined) g.tableNo = row.table_no;
  }
  for (const row of notes) {
    touch(keyFor(row.guest_session_id, row.guest_name), row.guest_name, row.created_at).messages += 1;
  }
  if (options.heartsNamed) {
    for (const row of hearts) {
      if (!row.name_visible) continue;
      const key = keyFor(row.guest_session_id, row.guest_name);
      // A guest who only hearted (no uploads) is listed only if we know their name.
      if (!guests.has(key) && !row.guest_name?.trim()) continue;
      const g = touch(key, row.guest_name, row.created_at);
      g.hearts = (g.hearts ?? 0) + 1;
    }
  }

  const list: GuestSummaryDto[] = [...guests.values()]
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .map((g, i) => ({
      id: `g${i + 1}`,
      name: g.name ?? "",
      tableNo: g.tableNo,
      photos: g.photos,
      videos: g.videos,
      messages: g.messages,
      hearts: g.hearts,
      totalBytes: g.totalBytes,
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
    }));
  return { guests: list, heartsNamed: options.heartsNamed, tableNumbers: options.tableNumbers };
}
