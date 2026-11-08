/**
 * Runs once when the Next.js server starts. Prints a clear, boxed warning when
 * required environment variables are missing so misconfiguration is obvious in
 * `next start`, Vercel and Render logs. API routes additionally answer 503 with
 * the same list, so nothing fails silently.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { describeServerEnvProblems } = await import("@/lib/env.server");
  const problems = describeServerEnvProblems();
  if (problems.length === 0) {
    if (!process.env.GOOGLE_REFRESH_TOKEN?.trim()) {
      console.info("Mira: no platform Drive configured — hosts must connect their own Google Drive before creating events.");
    }
    return;
  }

  const lines = [
    "Mira: environment is NOT configured. API routes will answer 503 until fixed.",
    ...problems.map((p) => `  - ${p}`),
    "See .env.example and DEPLOYMENT.md.",
  ];
  const width = Math.max(...lines.map((l) => l.length)) + 2;
  const bar = "=".repeat(width);
  console.error(`\n${bar}\n${lines.map((l) => ` ${l}`).join("\n")}\n${bar}\n`);
}
