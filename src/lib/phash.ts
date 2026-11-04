import type { Media } from "@/types/database";

const POPCOUNT_NIBBLE: Readonly<Record<string, number>> = {
  "0": 0,
  "1": 1,
  "2": 1,
  "3": 2,
  "4": 1,
  "5": 2,
  "6": 2,
  "7": 3,
  "8": 1,
  "9": 2,
  a: 2,
  b: 3,
  c: 2,
  d: 3,
  e: 3,
  f: 4,
};

/**
 * Computes the bitwise Hamming distance (0..64) between two 16-character
 * lowercase hex 64-bit perceptual hashes. Returns `null` if either hash is
 * missing or malformed.
 */
export function hammingDistance64(hashA: string | null, hashB: string | null): number | null {
  if (!hashA || !hashB) return null;
  const a = hashA.trim().toLowerCase();
  const b = hashB.trim().toLowerCase();
  if (a.length !== 16 || b.length !== 16) return null;

  let distance = 0;
  for (let i = 0; i < 16; i += 1) {
    const na = parseInt(a[i], 16);
    const nb = parseInt(b[i], 16);
    if (Number.isNaN(na) || Number.isNaN(nb)) return null;
    const xorHex = (na ^ nb).toString(16);
    distance += POPCOUNT_NIBBLE[xorHex] ?? 0;
  }
  return distance;
}

export interface DuplicateGroup {
  anchorId: string;
  anchorPhash: string;
  items: Array<{
    media: Media;
    distanceFromAnchor: number;
  }>;
}

/**
 * Groups media items whose 64-bit `phash` values are within `maxDistance`
 * bits (default 10 bits out of 64 ≈ 84%+ visual similarity).
 */
export function groupDuplicateMediaByPhash(
  mediaList: readonly Media[],
  maxDistance = 10,
): DuplicateGroup[] {
  const candidates = mediaList.filter(
    (m): m is Media & { phash: string } =>
      m.media_type === "photo" && typeof m.phash === "string" && /^[0-9a-f]{16}$/i.test(m.phash),
  );

  const visited = new Set<string>();
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const anchor = candidates[i];
    if (visited.has(anchor.id)) continue;

    const cluster: DuplicateGroup["items"] = [{ media: anchor, distanceFromAnchor: 0 }];

    for (let j = i + 1; j < candidates.length; j += 1) {
      const other = candidates[j];
      if (visited.has(other.id)) continue;
      const dist = hammingDistance64(anchor.phash, other.phash);
      if (dist !== null && dist <= maxDistance) {
        cluster.push({ media: other, distanceFromAnchor: dist });
      }
    }

    if (cluster.length > 1) {
      for (const member of cluster) {
        visited.add(member.media.id);
      }
      groups.push({
        anchorId: anchor.id,
        anchorPhash: anchor.phash,
        items: cluster,
      });
    }
  }

  return groups;
}
