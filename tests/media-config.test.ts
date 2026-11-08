import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyMimeType,
  detectMimeFromMagicBytes,
  inferMimeTypeFromFileName,
  normaliseMimeType,
} from "../src/lib/media-config.ts";

const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

/** ISO-BMFF header: 4-byte box size + "ftyp" + brand. */
const ftyp = (brand: string) => bytes([0, 0, 0, 0x18], "ftyp", brand, [0, 0, 0, 0], brand);

describe("detectMimeFromMagicBytes", () => {
  const cases: Array<[string, Uint8Array, string | null, string, string]> = [
    ["JPEG", bytes([0xff, 0xd8, 0xff, 0xe0]), null, "image/jpeg", "photo"],
    ["PNG", bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]), null, "image/png", "photo"],
    ["GIF", bytes("GIF89a"), null, "image/gif", "photo"],
    ["WebP", bytes("RIFF", [0, 0, 0, 0], "WEBP"), null, "image/webp", "photo"],
    ["iPhone HEIC", ftyp("heic"), null, "image/heic", "photo"],
    ["iPhone MOV", ftyp("qt  "), null, "video/quicktime", "video"],
    ["MP4", ftyp("isom"), "video/mp4", "video/mp4", "video"],
    ["Safari voice note (M4A)", ftyp("M4A "), "audio/mp4", "audio/mp4", "audio"],
    ["WebM voice note", bytes([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm", "audio/webm", "audio"],
    ["WebM video", bytes([0x1a, 0x45, 0xdf, 0xa3]), "video/webm", "video/webm", "video"],
    ["OGG", bytes("OggS"), null, "audio/ogg", "audio"],
    ["MP3 (ID3)", bytes("ID3", [3, 0]), null, "audio/mpeg", "audio"],
  ];
  for (const [name, input, claimed, mime, kind] of cases) {
    it(`detects ${name}`, () => {
      assert.deepEqual(detectMimeFromMagicBytes(input, claimed), { mimeType: mime, mediaType: kind });
    });
  }

  it("rejects unknown or too-short content", () => {
    assert.equal(detectMimeFromMagicBytes(bytes("<svg")), null);
    assert.equal(detectMimeFromMagicBytes(bytes("%PDF-1.7")), null);
    assert.equal(detectMimeFromMagicBytes(bytes([0xff])), null);
  });
});

describe("MIME helpers", () => {
  it("normalises parameters and aliases", () => {
    assert.equal(normaliseMimeType("Audio/WebM; codecs=opus"), "audio/webm");
    assert.equal(normaliseMimeType("image/jpg"), "image/jpeg");
    assert.equal(normaliseMimeType("not a mime"), null);
  });

  it("classifies only whitelisted types", () => {
    assert.equal(classifyMimeType("image/heic"), "photo");
    assert.equal(classifyMimeType("video/quicktime"), "video");
    assert.equal(classifyMimeType("audio/mp4"), "audio");
    assert.equal(classifyMimeType("image/svg+xml"), null);
    assert.equal(classifyMimeType("application/pdf"), null);
  });

  it("infers types from file names (case-insensitive)", () => {
    assert.equal(inferMimeTypeFromFileName("IMG_0001.HEIC"), "image/heic");
    assert.equal(inferMimeTypeFromFileName("clip.MOV"), "video/quicktime");
    assert.equal(inferMimeTypeFromFileName("noext"), null);
  });
});
