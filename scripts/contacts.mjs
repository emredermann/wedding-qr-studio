#!/usr/bin/env node
/**
 * Mira — "contact us" requests from the website. Uses SUPABASE_SERVICE_ROLE_KEY
 * from .env.local. Node 18+, no dependencies. The same data is in the Supabase
 * dashboard: Table Editor → contact_requests.
 *
 *   npm run contacts                    last 50 requests that are not closed
 *   npm run contacts -- all             last 200 requests, any status
 *   npm run contacts -- csv > liste.csv every request as CSV (Excel)
 *   npm run contacts -- durum <id> <new|contacted|closed>
 */
import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const env = {};
  for (const file of [".env", ".env.local"]) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const raw of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return { ...env, ...process.env };
}

function fail(message) {
  console.error(`\nHata: ${message}\n`);
  process.exit(1);
}

const env = loadEnv();
const URL_BASE = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!URL_BASE || !KEY) fail("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local içinde tanımlı olmalı.");

async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) fail(`${res.status} ${text.slice(0, 300)}${res.status === 404 ? "\n(0011_contact_requests.sql çalıştırıldı mı?)" : ""}`);
  return text ? JSON.parse(text) : null;
}

/** Terminal-safe text: no control / escape characters, no bidi overrides. */
const clean = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, " ");
const phone = (p) => (p ? (/^90(\d{3})(\d{3})(\d{2})(\d{2})$/.test(p) ? p.replace(/^90(\d{3})(\d{3})(\d{2})(\d{2})$/, "0$1 $2 $3 $4") : `+${p}`) : "");
const when = (iso) => new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });
const [command = "list", ...args] = process.argv.slice(2);
const COLUMNS = "id,created_at,full_name,email,phone,note,source,status";

if (command === "list" || command === "all") {
  const filter = command === "all" ? "" : "&status=neq.closed";
  const rows = await rest(`contact_requests?select=${COLUMNS}&order=created_at.desc&limit=${command === "all" ? 200 : 50}${filter}`);
  if (rows.length === 0) console.log("\nHenüz talep yok.\n");
  for (const r of rows) {
    console.log(`\n${when(r.created_at)}  [${clean(r.status)}]  ${clean(r.full_name)}`);
    console.log(`  ${clean(r.email)}${r.phone ? `  ·  ${phone(r.phone)}` : ""}${r.source ? `  ·  kaynak: ${clean(r.source)}` : ""}`);
    if (r.note) console.log(`  “${clean(r.note).replace(/\s+/g, " ").slice(0, 300)}”`);
    console.log(`  id: ${r.id}`);
  }
  console.log("");
} else if (command === "csv") {
  const rows = await rest(`contact_requests?select=${COLUMNS}&order=created_at.desc`);
  const cell = (v) => {
    // Same rule as src/lib/csv.ts: neutralise formulas first, then quote.
    const raw = clean(v);
    const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["Tarih", "Ad Soyad", "E-posta", "Telefon", "Not", "Kaynak", "Durum"].join(";")];
  for (const r of rows) lines.push([when(r.created_at), r.full_name, r.email, phone(r.phone), r.note, r.source, r.status].map(cell).join(";"));
  process.stdout.write("﻿" + lines.join("\r\n") + "\r\n");
} else if (command === "durum") {
  const [id, status] = args;
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "") || !["new", "contacted", "closed"].includes(status)) fail("Kullanım: npm run contacts -- durum <id> <new|contacted|closed>");
  const rows = await rest(`contact_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  if (!rows || rows.length === 0) fail("Talep bulunamadı.");
  console.log(`\n${rows[0].full_name}: ${status}\n`);
} else {
  fail("Komutlar: list, all, csv, durum <id> <new|contacted|closed>");
}
