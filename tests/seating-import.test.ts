import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

import { parseCsv, parseRsvp, readXlsx, rowsToGuests, textItemsToRows } from "../src/lib/seating/import.ts";

const inflate = async (data: Uint8Array) => new Uint8Array(inflateRawSync(data));

/** Minimal ZIP writer (deflated entries), enough to build an .xlsx fixture. */
function zip(files: Record<string, string>): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8");
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cdBuf, end]));
}

describe("guest import: CSV", () => {
  it("detects the delimiter and handles quotes and BOM", () => {
    assert.deepEqual(parseCsv('﻿Ad Soyad;Grup\n"Yılmaz; Ayşe";Gelin tarafı\r\nCan;"Damat ""yakın"""\n\n'), [
      ["Ad Soyad", "Grup"],
      ["Yılmaz; Ayşe", "Gelin tarafı"],
      ["Can", 'Damat "yakın"'],
    ]);
  });
});

describe("guest import: rows → guests", () => {
  it("recognises Turkish headers, joins first + last name and maps RSVP", () => {
    const r = rowsToGuests([
      ["Davetli Listesi"],
      ["Sıra", "Adı", "Soyadı", "Taraf", "Menü", "LCV", "Not"],
      ["1", "Ayşe", "Yılmaz", "Gelin", "Vejetaryen", "Evet", "Annesiyle"],
      ["2", "Mehmet", "Demir", "Damat", "", "Hayır", ""],
      ["3", "", "", "", "", "", ""],
    ]);
    assert.equal(r.headerRow, true);
    assert.deepEqual(r.guests, [
      { name: "Ayşe Yılmaz", group: "Gelin", dietary: "Vejetaryen", rsvp: "yes", note: "Annesiyle" },
      { name: "Mehmet Demir", group: "Damat", dietary: null, rsvp: "no", note: null },
    ]);
  });

  it("falls back to name/group/dietary columns without a header", () => {
    const r = rowsToGuests([["Zeynep Kaya", "Arkadaşlar", "Glutensiz"], ["Ali"]]);
    assert.equal(r.headerRow, false);
    assert.deepEqual(r.guests.map((g) => [g.name, g.group, g.dietary]), [["Zeynep Kaya", "Arkadaşlar", "Glutensiz"], ["Ali", null, null]]);
  });

  it("reads English headers and RSVP words", () => {
    const r = rowsToGuests([["Guest Name", "Side", "RSVP"], ["Anna Smith", "Bride", "attending"]]);
    assert.deepEqual(r.guests[0], { name: "Anna Smith", group: "Bride", dietary: null, rsvp: "yes", note: null });
    assert.deepEqual(["✓", "KATILMIYOR", "belki"].map(parseRsvp), ["yes", "no", "pending"]);
  });
});

describe("guest import: Excel (.xlsx)", () => {
  it("reads the first sheet with shared strings, inline strings and gaps", async () => {
    const file = zip({
      "[Content_Types].xml": "<Types/>",
      "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="Davetliler" sheetId="1" r:id="rId3"/><sheet name="Diğer" sheetId="2" r:id="rId4"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId4" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml": "<sst><si><t>Ad Soyad</t></si><si><t>Grup</t></si><si><r><t>Ayşe </t></r><r><t>Yılmaz</t></r></si><si><t>Gelin &amp; Damat</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>Can Öz</t></is></c><c r="B3"><v>42</v></c></row></sheetData></worksheet>',
      "xl/worksheets/sheet2.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>yanlış sayfa</t></is></c></row></sheetData></worksheet>',
    });
    const rows = await readXlsx(file, inflate);
    assert.deepEqual(rows, [
      ["Ad Soyad", "", "Grup"],
      ["Ayşe Yılmaz", "", "Gelin & Damat"],
      ["Can Öz", "42"],
    ]);
    assert.deepEqual(rowsToGuests(rows).guests.map((g) => [g.name, g.group]), [["Ayşe Yılmaz", "Gelin & Damat"], ["Can Öz", null]]);
  });

  it("rejects files that are not ZIP archives", async () => {
    await assert.rejects(readXlsx(new Uint8Array([1, 2, 3, 4]), inflate), /Excel/);
  });
});

describe("guest import: PDF text layout", () => {
  it("groups items into lines and splits cells on wide gaps", () => {
    const item = (str: string, x: number, y: number) => ({ str, x, y, width: str.length * 6, height: 12 });
    const rows = textItemsToRows([
      item("Grup", 200, 700),
      item("Ad Soyad", 50, 700),
      item("Ayşe", 50, 680),
      item("Yılmaz", 80, 680.5),
      item("Gelin", 200, 680),
      item(" ", 300, 660),
    ]);
    assert.deepEqual(rows, [["Ad Soyad", "Grup"], ["Ayşe Yılmaz", "Gelin"]]);
  });
});
