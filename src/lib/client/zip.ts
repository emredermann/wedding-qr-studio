"use client";

/**
 * Minimal streaming-friendly ZIP writer (STORE method, no compression).
 * Photos/videos are already compressed, so STORE is as small as DEFLATE and
 * far cheaper on phones. Entries are kept as Blob parts, which browsers can
 * page to disk, so large events don't exhaust RAM. Each archive stays below
 * the 4 GiB classic-ZIP limit; callers split into several parts beyond that.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export class Crc32 {
  private value = 0xffffffff;
  update(bytes: Uint8Array): void {
    let c = this.value;
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    this.value = c;
  }
  digest(): number {
    return (this.value ^ 0xffffffff) >>> 0;
  }
}

interface CentralEntry {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  dosTime: number;
  dosDate: number;
}

function toDos(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export const ZIP_PART_LIMIT_BYTES = 3.5 * 1024 * 1024 * 1024;
/** Classic ZIP stores the entry count in 16 bits (max 65 535); keep a safety margin. */
export const ZIP_MAX_ENTRIES = 60_000;
/** Classic ZIP stores offsets/sizes in 32 bits; 0xffffffff is reserved for ZIP64. */
const ZIP_MAX_OFFSET = 0xfffffffe;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
/** Room for a " (n)" suffix that uniqueName() may append. */
const NAME_SUFFIX_SLACK = 16;

export class ZipWriter {
  private readonly parts: BlobPart[] = [];
  private readonly entries: CentralEntry[] = [];
  private readonly usedNames = new Set<string>();
  private offset = 0;
  private centralSize = 0;

  get byteLength(): number {
    return this.offset;
  }

  get entryCount(): number {
    return this.entries.length;
  }

  /**
   * Whether a file of `size` bytes under `path` still fits into this archive
   * without overflowing the classic-ZIP 16-bit entry count or 32-bit offsets.
   * Callers should `finish()` the current part and start a new writer when false.
   */
  canFit(path: string, size: number): boolean {
    if (this.entries.length >= ZIP_MAX_ENTRIES) return false;
    const nameLength = new TextEncoder().encode(path).length + NAME_SUFFIX_SLACK;
    const nextOffset = this.offset + LOCAL_HEADER_SIZE + nameLength + size;
    const nextCentral = this.centralSize + CENTRAL_HEADER_SIZE + nameLength;
    return nextOffset <= ZIP_MAX_OFFSET && nextOffset + nextCentral + END_RECORD_SIZE <= ZIP_MAX_OFFSET;
  }

  /**
   * Normalises an entry path segment by segment (prevents "zip-slip": no
   * absolute paths, no "." / ".." segments, no control characters) and makes
   * it unique inside the archive.
   */
  private uniqueName(path: string): string {
    const cleaned =
      path
        .replace(/\\/g, "/")
        .split("/")
        .map((segment) => segment.replace(/[\u0000-\u001f\u007f]/g, "_").trim())
        .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
        .join("/") || "dosya";
    if (!this.usedNames.has(cleaned)) {
      this.usedNames.add(cleaned);
      return cleaned;
    }
    const dot = cleaned.lastIndexOf(".");
    const stem = dot > cleaned.lastIndexOf("/") ? cleaned.slice(0, dot) : cleaned;
    const ext = dot > cleaned.lastIndexOf("/") ? cleaned.slice(dot) : "";
    for (let i = 2; ; i += 1) {
      const candidate = `${stem} (${i})${ext}`;
      if (!this.usedNames.has(candidate)) {
        this.usedNames.add(candidate);
        return candidate;
      }
    }
  }

  /** Adds a file whose CRC-32 and size are already known. */
  add(path: string, data: Blob, crc: number, modified: Date = new Date()): void {
    if (data.size > ZIP_MAX_OFFSET) throw new Error("ZIP girdisi 4 GB sınırını aşıyor.");
    if (this.entries.length >= ZIP_MAX_ENTRIES) {
      throw new Error("ZIP arşivi en fazla dosya sayısına ulaştı; yeni bir bölüm başlatılmalı.");
    }
    const nameBytes = new TextEncoder().encode(this.uniqueName(path));
    if (this.offset + LOCAL_HEADER_SIZE + nameBytes.length + data.size > ZIP_MAX_OFFSET) {
      this.usedNames.delete(new TextDecoder().decode(nameBytes));
      throw new Error("ZIP arşivi 4 GB sınırını aşacak; yeni bir bölüm başlatılmalı.");
    }
    const { dosTime, dosDate } = toDos(modified);

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true); // version needed
    header.setUint16(6, 0x0800, true); // UTF-8 names
    header.setUint16(8, 0, true); // STORE
    header.setUint16(10, dosTime, true);
    header.setUint16(12, dosDate, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.size, true);
    header.setUint32(22, data.size, true);
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true);

    this.entries.push({ nameBytes, crc, size: data.size, offset: this.offset, dosTime, dosDate });
    this.parts.push(header.buffer, nameBytes as BlobPart, data);
    this.offset += LOCAL_HEADER_SIZE + nameBytes.length + data.size;
    this.centralSize += CENTRAL_HEADER_SIZE + nameBytes.length;
  }

  finish(): Blob {
    const centralParts: BlobPart[] = [];
    let centralSize = 0;
    for (const entry of this.entries) {
      const view = new DataView(new ArrayBuffer(46));
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, entry.dosTime, true);
      view.setUint16(14, entry.dosDate, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.size, true);
      view.setUint32(24, entry.size, true);
      view.setUint16(28, entry.nameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, entry.offset, true);
      centralParts.push(view.buffer, entry.nameBytes as BlobPart);
      centralSize += 46 + entry.nameBytes.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...centralParts, end.buffer], { type: "application/zip" });
  }
}
