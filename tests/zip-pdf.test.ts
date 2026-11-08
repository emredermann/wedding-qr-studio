import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPdf } from "../src/lib/client/pdf.ts";
import { Crc32, ZIP_MAX_ENTRIES, ZipWriter } from "../src/lib/client/zip.ts";

interface CentralEntry {
  name: string;
  crc: number;
  size: number;
  flags: number;
  offset: number;
}

/** Minimal ZIP reader used to verify the writer's output byte-for-byte. */
function readZip(buf: Uint8Array): CentralEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.byteLength - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50, "end-of-central-directory signature");
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const entries: CentralEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    assert.equal(view.getUint32(pos, true), 0x02014b50, "central header signature");
    const nameLength = view.getUint16(pos + 28, true);
    const entry: CentralEntry = {
      flags: view.getUint16(pos + 8, true),
      crc: view.getUint32(pos + 16, true),
      size: view.getUint32(pos + 24, true),
      offset: view.getUint32(pos + 42, true),
      name: new TextDecoder().decode(buf.subarray(pos + 46, pos + 46 + nameLength)),
    };
    assert.equal(view.getUint32(entry.offset, true), 0x04034b50, "local header signature");
    entries.push(entry);
    pos += 46 + nameLength;
  }
  return entries;
}

const crcOf = (text: string) => {
  const crc = new Crc32();
  crc.update(new TextEncoder().encode(text));
  return crc.digest();
};

describe("Crc32", () => {
  it("matches the standard check value", () => {
    assert.equal(crcOf("123456789"), 0xcbf43926);
  });

  it("is identical when fed in chunks", () => {
    const crc = new Crc32();
    crc.update(new TextEncoder().encode("12345"));
    crc.update(new TextEncoder().encode("6789"));
    assert.equal(crc.digest(), 0xcbf43926);
  });
});

describe("ZipWriter", () => {
  it("writes a valid STORE archive with UTF-8 names and de-duplicated paths", async () => {
    const zip = new ZipWriter();
    const add = (path: string, text: string) => zip.add(path, new Blob([text]), crcOf(text), new Date(2026, 10, 8, 16, 30));
    add("Fotograflar/Nikah/İlk dans ğüşiöç.jpg", "a");
    add("Fotograflar/Nikah/İlk dans ğüşiöç.jpg", "bb");
    add("../../etc/passwd", "ccc");

    const entries = readZip(new Uint8Array(await zip.finish().arrayBuffer()));
    assert.deepEqual(
      entries.map((e) => e.name),
      ["Fotograflar/Nikah/İlk dans ğüşiöç.jpg", "Fotograflar/Nikah/İlk dans ğüşiöç (2).jpg", "etc/passwd"],
    );
    assert.deepEqual(entries.map((e) => e.size), [1, 2, 3]);
    assert.equal(entries[1].crc, crcOf("bb"));
    assert.ok(entries.every((e) => (e.flags & 0x0800) !== 0), "UTF-8 flag set");
  });

  it("refuses to exceed the classic-ZIP entry limit", () => {
    const zip = new ZipWriter();
    const empty = new Blob([]);
    for (let i = 0; i < ZIP_MAX_ENTRIES; i += 1) zip.add(`f${i}`, empty, 0);
    assert.throws(() => zip.add("one-too-many", empty, 0));
  });
});

describe("buildPdf", () => {
  it("produces a PDF whose xref offsets point at each object", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = new Uint8Array(
      await buildPdf([
        { jpeg, pixelWidth: 1, pixelHeight: 1, pageWidthPt: 297.64, pageHeightPt: 419.53 },
        { jpeg, pixelWidth: 1, pixelHeight: 1, pageWidthPt: 297.64, pageHeightPt: 419.53 },
      ]).arrayBuffer(),
    );
    const text = new TextDecoder("latin1").decode(pdf);
    assert.ok(text.startsWith("%PDF-1.4"));
    assert.ok(text.trimEnd().endsWith("%%EOF"));
    assert.equal(text.match(/\/Type \/Page /g)?.length, 2);

    const xrefAt = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    const lines = text.slice(xrefAt).split("\n");
    const objectCount = Number(lines[1].split(" ")[1]);
    for (let id = 1; id < objectCount; id += 1) {
      const offset = Number(lines[2 + id].slice(0, 10));
      assert.ok(text.startsWith(`${id} 0 obj`, offset), `object ${id} at ${offset}`);
    }
  });
});
