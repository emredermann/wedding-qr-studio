#!/usr/bin/env node
/**
 * Generates GOOGLE_REFRESH_TOKEN (and, if needed, GOOGLE_DRIVE_ROOT_FOLDER_ID)
 * for the Mira DriveService. No dependencies — Node 18+ only.
 *
 *   npm run drive:token            # print values to copy into .env.local
 *   npm run drive:token -- --write # also write them into .env.local
 *
 * Requirements (see DEPLOYMENT.md):
 *   - A Google Cloud OAuth client of type "Desktop app" (recommended) or
 *     "Web application" with redirect URI http://127.0.0.1:53682/oauth2callback
 *   - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (or entered when asked)
 *
 * The scope is `drive.file`: the app can only see files/folders it created.
 * That is why this script also creates the root "Mira" folder for you.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const PORT = Number(process.env.DRIVE_TOKEN_PORT || 53682);
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
const ENV_FILE = path.join(process.cwd(), ".env.local");
const ROOT_FOLDER_NAME = process.env.DRIVE_ROOT_FOLDER_NAME || "Mira";
const WRITE = process.argv.includes("--write");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[line.slice(0, eq).trim()] = value;
  }
  return env;
}

function upsertEnvFile(filePath, values) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const pending = new Map(Object.entries(values));
  const next = lines.map((line) => {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (match && pending.has(match[1])) {
      const value = pending.get(match[1]);
      pending.delete(match[1]);
      return `${match[1]}=${value}`;
    }
    return line;
  });
  while (next.length > 0 && next[next.length - 1] === "") next.pop();
  for (const [key, value] of pending) next.push(`${key}=${value}`);
  fs.writeFileSync(filePath, `${next.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
}

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function extractCode(answer) {
  const trimmed = answer.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http")) {
    try {
      return new URL(trimmed).searchParams.get("code");
    } catch {
      return null;
    }
  }
  return decodeURIComponent(trimmed);
}

async function waitForCode(rl, expectedState) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      server.close();
      fn(value);
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (error || !code || state !== expectedState) {
        res.end("<h2>Yetkilendirme başarısız.</h2><p>Terminale dönün.</p>");
        finish(reject, new Error(error || "Missing code or state mismatch"));
        return;
      }
      res.end("<h2>Mira yetkilendirildi ✔</h2><p>Bu sekmeyi kapatıp terminale dönebilirsiniz.</p>");
      finish(resolve, code);
    });

    server.on("error", (err) => {
      console.warn(`\n(Yerel sunucu ${PORT} portunda başlatılamadı: ${err.message}. Kodu elle yapıştırın.)`);
    });
    server.listen(PORT, "127.0.0.1");

    rl.question(
      "\nTarayıcı otomatik dönmezse, adres çubuğundaki yönlendirme URL'sini veya 'code' değerini buraya yapıştırın:\n> ",
    )
      .then((answer) => {
        const code = extractCode(answer);
        if (code) finish(resolve, code);
      })
      .catch(() => undefined);
  });
}

async function exchangeCode({ clientId, clientSecret, code, verifier }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${json.error} ${json.error_description ?? ""}`);
  return json;
}

async function driveFetch(accessToken, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${json?.error?.message ?? "unknown error"}`);
  return json;
}

async function resolveRootFolder(accessToken, existingId) {
  if (existingId) {
    try {
      const file = await driveFetch(
        accessToken,
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(existingId)}?fields=id,name,mimeType,trashed`,
      );
      if (file.mimeType === "application/vnd.google-apps.folder" && !file.trashed) {
        console.log(`✔ Mevcut kök klasör erişilebilir: "${file.name}" (${file.id})`);
        return file.id;
      }
    } catch {
      console.warn(
        "! Mevcut GOOGLE_DRIVE_ROOT_FOLDER_ID bu uygulama tarafından görülemiyor (drive.file kapsamı yalnızca uygulamanın oluşturduğu klasörleri görür). Yeni kök klasör oluşturuluyor.",
      );
    }
  }
  const created = await driveFetch(accessToken, "https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ name: ROOT_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  console.log(`✔ Google Drive'da kök klasör oluşturuldu: "${created.name}" (${created.id})`);
  return created.id;
}

async function main() {
  const fileEnv = { ...parseEnvFile(path.join(process.cwd(), ".env")), ...parseEnvFile(ENV_FILE) };
  const rl = readline.createInterface({ input, output });

  let clientId = process.env.GOOGLE_CLIENT_ID || fileEnv.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || fileEnv.GOOGLE_CLIENT_SECRET;
  if (!clientId) clientId = (await rl.question("GOOGLE_CLIENT_ID: ")).trim();
  if (!clientSecret) clientSecret = (await rl.question("GOOGLE_CLIENT_SECRET: ")).trim();
  if (!clientId || !clientSecret) {
    console.error("GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET gerekli.");
    process.exit(1);
  }

  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  console.log("\n=== Mira — Google Drive yetkilendirme ===\n");
  console.log("1) Aşağıdaki adresi tarayıcıda açın ve Drive'ının kullanılacağı Google hesabıyla giriş yapın:\n");
  console.log(authUrl.toString());

  const code = await waitForCode(rl, state);
  const tokens = await exchangeCode({ clientId, clientSecret, code, verifier });
  if (!tokens.refresh_token) {
    console.error(
      "\nGoogle refresh_token döndürmedi. https://myaccount.google.com/permissions adresinden uygulamanın erişimini kaldırıp script'i tekrar çalıştırın.",
    );
    process.exit(1);
  }

  const rootFolderId = await resolveRootFolder(
    tokens.access_token,
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || fileEnv.GOOGLE_DRIVE_ROOT_FOLDER_ID,
  );

  const values = {
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    GOOGLE_REFRESH_TOKEN: tokens.refresh_token,
    GOOGLE_DRIVE_ROOT_FOLDER_ID: rootFolderId,
  };

  console.log("\n2) Aşağıdaki satırları .env.local dosyanıza ve Vercel/Render ortam değişkenlerine ekleyin:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${values.GOOGLE_REFRESH_TOKEN}`);
  console.log(`GOOGLE_DRIVE_ROOT_FOLDER_ID=${values.GOOGLE_DRIVE_ROOT_FOLDER_ID}`);

  let shouldWrite = WRITE;
  if (!shouldWrite) {
    const answer = (await rl.question(`\n.env.local dosyasına otomatik yazılsın mı? (e/H) `)).trim().toLowerCase();
    shouldWrite = answer === "e" || answer === "y" || answer === "evet" || answer === "yes";
  }
  if (shouldWrite) {
    upsertEnvFile(ENV_FILE, values);
    console.log(`✔ ${path.basename(ENV_FILE)} güncellendi.`);
  }

  console.log(
    "\nÖnemli: OAuth onay ekranı 'Testing' durumundaysa refresh token 7 gün sonra geçersiz olur. Google Cloud Console → OAuth consent screen → 'Publish app' ile 'In production' durumuna alın.\n",
  );
  rl.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(`\nHata: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
