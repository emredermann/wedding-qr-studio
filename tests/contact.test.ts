import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contactFieldErrors, contactSchema, looksAutomated } from "../src/lib/contact/schema.ts";
import { csvCell } from "../src/lib/csv.ts";
import { formatPhone, normalisePhone } from "../src/lib/phone.ts";

describe("contact form", () => {
  it("cleans a valid request", () => {
    const r = contactSchema.parse({ fullName: "  Ayşe   Yılmaz ", email: " Ayse@Example.COM ", phone: "0532 123 45 67", note: "  Haziranda düğün ", consent: true, source: "ana-sayfa" });
    assert.deepEqual(
      { fullName: r.fullName, email: r.email, phone: r.phone, note: r.note, source: r.source },
      { fullName: "Ayşe Yılmaz", email: "ayse@example.com", phone: "905321234567", note: "Haziranda düğün", source: "ana-sayfa" },
    );
    assert.equal(contactSchema.parse({ fullName: "Can Demir", email: "c@d.co", phone: "", consent: true }).phone, null);
  });

  it("rejects a bad email, a bad phone and a missing consent", () => {
    const fields = (body: unknown) => {
      const res = contactSchema.safeParse(body);
      return res.success ? [] : res.error.issues.map((i) => String(i.path[0])).sort();
    };
    assert.deepEqual(fields({ fullName: "A", email: "x@", phone: "12", consent: false }), ["consent", "email", "fullName", "phone"]);
  });

  it("accepts real names in any language and rejects code-like input", () => {
    const base = { email: "a@b.co", consent: true };
    for (const ok of ["Ayşe Yılmaz", "Mary-Jane O’Neil", "Jean-Luc Picard", "Çağrı Öztürk", "José María Aznar", "Ali Veli Jr."]) {
      assert.deepEqual(contactFieldErrors({ ...base, fullName: ok }), {}, ok);
    }
    for (const bad of ["Robert'); DROP TABLE contact_requests;--", "<script>alert(1)</script> X", "Ali 123 Veli", "admin' OR '1'='1", "Ayşe"]) {
      assert.ok(contactFieldErrors({ ...base, fullName: bad }).fullName, bad);
    }
  });

  it("strips invisible characters and refuses control characters", () => {
    const r = contactSchema.parse({ fullName: "Ayşe\u202E Yıl\u200Bmaz", email: "\uFEFFa@b.co", note: "satır 1\r\nsatır 2\u2066", consent: true });
    assert.equal(r.fullName, "Ayşe Yılmaz");
    assert.equal(r.email, "a@b.co");
    assert.equal(r.note, "satır 1\nsatır 2");
    assert.equal(contactFieldErrors({ fullName: "Ayşe Yılmaz", email: "a@b.co", note: "a\u0000b\u001b[31m", consent: true }).note, "Not geçersiz karakterler içeriyor.");
    assert.equal(contactFieldErrors({ fullName: "Ayşe Yılmaz", email: "a@b.co", note: "x".repeat(2001), consent: true }).note, "Not en fazla 2000 karakter olabilir.");
    assert.equal(contactFieldErrors({ fullName: "Ayşe Yılmaz", email: "x' OR 1=1--@b.co", consent: true }).email, "Geçerli bir e-posta adresi yazın.");
  });

  it("spots bots by the honeypot and by instant submits", () => {
    assert.equal(looksAutomated({ website: "http://spam" }), true);
    assert.equal(looksAutomated({ shownAt: 1000 }, 2000), true);
    assert.equal(looksAutomated({ website: "", shownAt: 1000 }, 9000), false);
  });

  it("neutralises spreadsheet formulas even when the cell needs quotes", () => {
    assert.equal(csvCell('=HYPERLINK("http://evil","tıkla")'), `"'=HYPERLINK(""http://evil"",""tıkla"")"`);
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvCell("+90 532"), "'+90 532");
    assert.equal(csvCell("Aile; yakın"), '"Aile; yakın"');
    assert.equal(csvCell("Ayşe Yılmaz"), "Ayşe Yılmaz");
  });

  it("normalises phone numbers", () => {
    assert.equal(normalisePhone("+90 (532) 123-45-67"), "905321234567");
    assert.equal(normalisePhone("0044 20 7123 4567"), "442071234567");
    assert.equal(formatPhone("905321234567"), "+90 532 123 45 67");
  });
});
