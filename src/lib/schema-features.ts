import "server-only";

import { MEDIA_COLUMNS } from "@/lib/events";
import { getAdminDb } from "@/lib/supabase/server";

/**
 * Optional columns from later migrations are detected at runtime, so code can
 * be deployed before the SQL is run. A positive answer is cached for good; a
 * negative one is re-checked after a minute, so running the migration takes
 * effect without a redeploy.
 */
const RECHECK_MS = 60_000;
let tableNo: { value: boolean; at: number } | null = null;

export async function hasTableNoColumn(): Promise<boolean> {
  if (tableNo && (tableNo.value || Date.now() - tableNo.at < RECHECK_MS)) return tableNo.value;
  const { error } = await getAdminDb().from("media_items").select("table_no").limit(0);
  tableNo = { value: !error, at: Date.now() };
  return tableNo.value;
}

let guestDelete: { value: boolean; at: number } | null = null;

/** `media_items.guest_can_delete` (0005 migration). */
export async function hasGuestDeleteColumn(): Promise<boolean> {
  if (guestDelete && (guestDelete.value || Date.now() - guestDelete.at < RECHECK_MS)) return guestDelete.value;
  const { error } = await getAdminDb().from("media_items").select("guest_can_delete").limit(0);
  guestDelete = { value: !error, at: Date.now() };
  return guestDelete.value;
}

/** MEDIA_COLUMNS plus `table_no` when the 0004 migration has been run. */
export async function mediaColumns(): Promise<typeof MEDIA_COLUMNS> {
  // Typed as the base list so the Supabase row types stay the same; `table_no`
  // is an optional field of MediaItemRow.
  return ((await hasTableNoColumn()) ? `${MEDIA_COLUMNS}, table_no` : MEDIA_COLUMNS) as typeof MEDIA_COLUMNS;
}
