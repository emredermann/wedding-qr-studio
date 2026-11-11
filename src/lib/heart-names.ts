import type { MediaHeartsDto } from "@/types/domain";

export interface HeartRow {
  guest_name: string | null;
  name_visible: boolean;
  created_at: string;
}

/**
 * What a host may see of an item's hearts. A name is shown only if the event
 * shows names now AND the heart was given while it did, so turning names on
 * later never reveals hearts that were given anonymously.
 */
export function summariseHearts(rows: HeartRow[], named: boolean): MediaHeartsDto {
  const people: MediaHeartsDto["people"] = [];
  let anonymousCount = 0;
  for (const row of rows) {
    const name = row.guest_name?.trim();
    if (named && row.name_visible && name) people.push({ name, at: row.created_at });
    else anonymousCount += 1;
  }
  return { named, people, anonymousCount };
}
