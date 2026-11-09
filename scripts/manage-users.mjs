#!/usr/bin/env node
/**
 * Mira — host account management (accounts are created by the admin;
 * there is no public sign-up). Uses the Supabase Auth Admin API with
 * SUPABASE_SERVICE_ROLE_KEY from .env.local. Node 18+, no dependencies.
 *
 *   npm run user -- create   <kullanici-adi> <sifre>
 *   npm run user -- password <kullanici-adi> <yeni-sifre>
 *   npm run user -- list
 *   npm run user -- delete   <kullanici-adi>
 *
 * Usernames are mapped to the internal login identity
 * "<username>@<NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN or kullanici.eventqr.app>",
 * exactly like the login form does (src/lib/login-identity.ts).
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DOMAIN = "kullanici.eventqr.app";
// Accounts created before the Event QR rename live under the old domain.
const LEGACY_DOMAINS = ["kullanici.weddingqr.app"];
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;

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

function normaliseUsername(raw) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return String(raw ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (ch) => map[ch] ?? ch);
}

function fail(message) {
  console.error(`\nHata: ${message}\n`);
  process.exit(1);
}

const env = loadEnv();
const SUPABASE_URL = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
const DOMAIN = (env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || DEFAULT_DOMAIN).trim().toLowerCase();

if (!SUPABASE_URL || !SERVICE_KEY) fail("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local içinde tanımlı olmalı.");
if (SERVICE_KEY.startsWith("sb_publishable_")) fail("SUPABASE_SERVICE_ROLE_KEY herkese açık (publishable) anahtar. sb_secret_… / service_role anahtarını kullanın.");

async function admin(method, pathname, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${pathname}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(json.msg || json.message || json.error_description || `Supabase ${res.status}`);
  return json;
}

async function allUsers() {
  const users = [];
  for (let page = 1; page < 100; page += 1) {
    const json = await admin("GET", `/users?page=${page}&per_page=200`);
    const batch = json.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

function usernameOf(user) {
  const email = (user.email || "").toLowerCase();
  for (const domain of [DOMAIN, ...LEGACY_DOMAINS]) {
    if (email.endsWith(`@${domain}`)) return email.slice(0, -(domain.length + 1));
  }
  return email;
}

async function findByUsername(username) {
  const emails = [DOMAIN, ...LEGACY_DOMAINS].map((domain) => `${username}@${domain}`);
  const user = (await allUsers()).find((u) => emails.includes((u.email || "").toLowerCase()));
  if (!user) fail(`"${username}" kullanıcısı bulunamadı.`);
  return user;
}

function requireUsername(raw) {
  const username = normaliseUsername(raw);
  if (!USERNAME_PATTERN.test(username)) {
    fail("Kullanıcı adı 3–32 karakter olmalı; küçük harf, rakam, nokta, tire ve alt çizgi içerebilir (ör. ayse.mehmet).");
  }
  return username;
}

function requirePassword(raw) {
  if (!raw || raw.length < 8) fail("Şifre en az 8 karakter olmalı.");
  return raw;
}

const [command, arg1, arg2] = process.argv.slice(2);

switch (command) {
  case "create": {
    const username = requireUsername(arg1);
    const password = requirePassword(arg2);
    const user = await admin("POST", "/users", {
      email: `${username}@${DOMAIN}`,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    console.log(`\n✔ Hesap oluşturuldu\n  Kullanıcı adı: ${username}\n  Şifre:         (verdiğiniz şifre)\n  ID:            ${user.id}\n`);
    break;
  }
  case "password": {
    const username = requireUsername(arg1);
    const password = requirePassword(arg2);
    const user = await findByUsername(username);
    await admin("PUT", `/users/${user.id}`, { password });
    console.log(`\n✔ "${username}" kullanıcısının şifresi güncellendi.\n`);
    break;
  }
  case "delete": {
    const username = requireUsername(arg1);
    const user = await findByUsername(username);
    await admin("DELETE", `/users/${user.id}`);
    console.log(`\n✔ "${username}" silindi (etkinlikleri ve Drive bağlantı kaydı da veritabanından silindi; Drive'daki dosyalar durur).\n`);
    break;
  }
  case "list": {
    const users = await allUsers();
    if (users.length === 0) {
      console.log("\nHenüz hesap yok. Oluşturmak için: npm run user -- create <kullanici-adi> <sifre>\n");
      break;
    }
    console.log("");
    for (const u of users) {
      const last = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("tr-TR") : "hiç giriş yapmadı";
      console.log(`  ${usernameOf(u).padEnd(32)} son giriş: ${last}`);
    }
    console.log(`\n  Toplam: ${users.length}\n`);
    break;
  }
  default:
    console.log(`
Kullanım:
  npm run user -- create   <kullanici-adi> <sifre>       Yeni etkinlik sahibi hesabı
  npm run user -- password <kullanici-adi> <yeni-sifre>  Şifre değiştir
  npm run user -- list                                   Hesapları listele
  npm run user -- delete   <kullanici-adi>               Hesabı sil
`);
}
