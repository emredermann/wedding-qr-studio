import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contactSchema, looksAutomated } from "../src/lib/contact/schema.ts";
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

  it("spots bots by the honeypot and by instant submits", () => {
    assert.equal(looksAutomated({ website: "http://spam" }), true);
    assert.equal(looksAutomated({ shownAt: 1000 }, 2000), true);
    assert.equal(looksAutomated({ website: "", shownAt: 1000 }, 9000), false);
  });

  it("normalises phone numbers", () => {
    assert.equal(normalisePhone("+90 (532) 123-45-67"), "905321234567");
    assert.equal(normalisePhone("0044 20 7123 4567"), "442071234567");
    assert.equal(formatPhone("905321234567"), "+90 532 123 45 67");
  });
});
