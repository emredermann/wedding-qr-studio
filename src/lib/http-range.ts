/** HTTP Range parsing and Content-Disposition for the Drive stream proxy (dependency-free). */

/** Open-ended ranges are capped so one serverless invocation stays short. */
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;

export function parseRange(header: string | null, total: number, maxChunkBytes: number = MAX_CHUNK_BYTES): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? total - 1 : Math.min(Number(match[2]), total - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) return "invalid";
  end = Math.min(end, start + maxChunkBytes - 1);
  return { start, end };
}

export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
