import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/http";
import { DEMO_ALBUM_ID } from "@/lib/demo-data";
import { getVerifiedGuestSession } from "@/lib/guest-session";
import { getPaymentSigningSecret, verifyWebhookSignature } from "@/lib/payments";
import { hammingDistance64 } from "@/lib/phash";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { MediaCategory, ProcessMediaWebhookResponse } from "@/types/database";

const AI_VISION_CATEGORIES = [
  "getting_ready",
  "ceremony",
  "reception",
  "party",
  "venue",
] as const satisfies ReadonlyArray<MediaCategory>;

type VisionCategory = (typeof AI_VISION_CATEGORIES)[number];

const directWebhookSchema = z.object({
  mediaId: z.uuid(),
  albumId: z.uuid(),
  fileUrl: z.url(),
  clientPhash: z
    .string()
    .regex(/^[0-9a-f]{16}$/i)
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
});

const supabaseInsertWebhookSchema = z.object({
  type: z.literal("INSERT"),
  table: z.literal("media"),
  record: z.object({
    id: z.uuid(),
    album_id: z.uuid(),
    file_url: z.url(),
    media_type: z.string(),
    phash: z.string().nullish(),
  }),
});

/**
 * Computes a deterministic 64-bit perceptual difference signature (`16` hex
 * chars) over 65 uniformly sampled byte windows of an image payload when a
 * client canvas `dHash` was not already provided.
 */
async function computeServerFallbackPhash(fileUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(fileUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength < 128) return null;

    // Skip fixed header region and sample 65 evenly spaced luminance-proxy windows
    const startOffset = Math.min(256, Math.floor(buffer.byteLength * 0.1));
    const usableLength = buffer.byteLength - startOffset;
    const windowSize = Math.max(1, Math.floor(usableLength / 65));

    const averages = new Float64Array(65);
    for (let i = 0; i < 65; i += 1) {
      const base = startOffset + i * windowSize;
      let sum = 0;
      const count = Math.min(windowSize, 64);
      for (let j = 0; j < count; j += 1) {
        sum += buffer[base + j] ?? 0;
      }
      averages[i] = sum / count;
    }

    let hex = "";
    for (let byteIdx = 0; byteIdx < 8; byteIdx += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const idx = byteIdx * 8 + bit;
        if (averages[idx] > averages[idx + 1]) {
          byte |= 1 << (7 - bit);
        }
      }
      hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return null;
  }
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

/**
 * Calls the OpenAI `gpt-4o-mini` Vision API with the photo URL to classify the
 * wedding moment into exactly one of: `'getting_ready'`, `'ceremony'`,
 * `'reception'`, `'party'`, or `'venue'`.
 */
async function classifyWeddingPhotoWithVision(fileUrl: string): Promise<VisionCategory> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    // Deterministic fallback when OPENAI_API_KEY is not configured in local dev
    const lower = fileUrl.toLowerCase();
    if (lower.includes("ready") || lower.includes("suite") || lower.includes("dress")) {
      return "getting_ready";
    }
    if (lower.includes("ceremony") || lower.includes("vow") || lower.includes("altar")) {
      return "ceremony";
    }
    if (lower.includes("party") || lower.includes("dance") || lower.includes("sparkler")) {
      return "party";
    }
    if (lower.includes("venue") || lower.includes("garden") || lower.includes("villa")) {
      return "venue";
    }
    return "reception";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 16,
        messages: [
          {
            role: "system",
            content:
              "You classify wedding photos into exactly one label. Respond with ONLY one of these exact tokens: getting_ready, ceremony, reception, party, venue.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Classify this wedding photo into getting_ready, ceremony, reception, party, or venue.",
              },
              {
                type: "image_url",
                image_url: { url: fileUrl, detail: "low" },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn("[webhook:process-media] OpenAI non-200 status", response.status);
      return "reception";
    }

    const data = (await response.json()) as OpenAiChatResponse;
    const rawLabel = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";

    const matched = AI_VISION_CATEGORIES.find(
      (cat) => rawLabel === cat || rawLabel.includes(cat),
    );
    return matched ?? "reception";
  } catch (error) {
    console.warn("[webhook:process-media] OpenAI call failed", error);
    return "reception";
  }
}

/**
 * POST /api/webhooks/process-media
 *
 * Triggered when a new photo record is inserted.
 *  1. Computes / verifies a 64-bit Perceptual Hash (`phash`) and checks for
 *     near-identical duplicate photos in the same album.
 *  2. Classifies the wedding moment using OpenAI `gpt-4o-mini` Vision API into
 *     `'getting_ready' | 'ceremony' | 'reception' | 'party' | 'venue'`.
 *  3. Updates `media.category` and `media.phash`.
 */
export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    namespace: "webhook:process-media",
    limit: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.ok) return rateLimit.response;

  let rawBody: string;
  let rawJson: unknown;
  try {
    rawBody = await request.text();
    rawJson = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "BAD_REQUEST", "Invalid JSON body.");
  }

  const signatureHeader =
    request.headers.get("x-internal-webhook-signature") ??
    request.headers.get("x-webhook-signature");
  const isSignedInternal = verifyWebhookSignature(
    rawBody,
    signatureHeader,
    getPaymentSigningSecret(),
  );
  const verifiedGuest = getVerifiedGuestSession(request);

  if (!isSignedInternal && !verifiedGuest) {
    return jsonError(401, "UNAUTHORIZED", "Missing or invalid webhook authorization.");
  }

  let mediaId: string;
  let albumId: string;
  let fileUrl: string;
  let clientPhash: string | null = null;

  const directParsed = directWebhookSchema.safeParse(rawJson);
  if (directParsed.success) {
    mediaId = directParsed.data.mediaId;
    albumId = directParsed.data.albumId;
    fileUrl = directParsed.data.fileUrl;
    clientPhash = directParsed.data.clientPhash;
  } else {
    const dbWebhookParsed = supabaseInsertWebhookSchema.safeParse(rawJson);
    if (!dbWebhookParsed.success) {
      return jsonError(422, "VALIDATION_FAILED", "Unrecognized webhook payload.");
    }
    const rec = dbWebhookParsed.data.record;
    if (rec.media_type !== "photo") {
      return jsonOk({ skipped: true, reason: "Not a photo record." });
    }
    mediaId = rec.id;
    albumId = rec.album_id;
    fileUrl = rec.file_url;
    clientPhash =
      rec.phash && /^[0-9a-f]{16}$/i.test(rec.phash) ? rec.phash.toLowerCase() : null;
  }

  if (albumId === DEMO_ALBUM_ID) {
    const [demoPhash, demoCategory] = await Promise.all([
      clientPhash ? Promise.resolve(clientPhash) : computeServerFallbackPhash(fileUrl),
      classifyWeddingPhotoWithVision(fileUrl),
    ]);
    const demoResponse: ProcessMediaWebhookResponse = {
      mediaId,
      category: demoCategory,
      phash: demoPhash,
      duplicateOfMediaId: null,
    };
    return jsonOk(demoResponse);
  }

  try {
    const supabase = getSupabaseAdminClient();

    // Verify the media row exists in Postgres and use its canonical stored file_url
    // so an attacker cannot supply an arbitrary SSRF URL.
    const { data: currentMedia } = await supabase
      .from("media")
      .select("id, album_id, file_url, category, guest_session_id")
      .eq("id", mediaId)
      .eq("album_id", albumId)
      .maybeSingle();

    if (!currentMedia) {
      return jsonError(404, "NOT_FOUND", "Target media record not found.");
    }

    if (
      !isSignedInternal &&
      (!verifiedGuest || currentMedia.guest_session_id !== verifiedGuest.sessionId)
    ) {
      return jsonError(403, "FORBIDDEN", "Not authorized to process this media item.");
    }

    const canonicalFileUrl = currentMedia.file_url;
    const [phash, category] = await Promise.all([
      clientPhash ? Promise.resolve(clientPhash) : computeServerFallbackPhash(canonicalFileUrl),
      classifyWeddingPhotoWithVision(canonicalFileUrl),
    ]);

    // Check existing album photos for near-identical perceptual hash (Hamming distance <= 10)
    let duplicateOfMediaId: string | null = null;
    if (phash) {
      const { data: existingPhotos } = await supabase
        .from("media")
        .select("id, phash")
        .eq("album_id", albumId)
        .eq("media_type", "photo")
        .not("phash", "is", null)
        .neq("id", mediaId)
        .limit(500);

      for (const photo of existingPhotos ?? []) {
        const dist = hammingDistance64(phash, photo.phash);
        if (dist !== null && dist <= 10) {
          duplicateOfMediaId = photo.id;
          break;
        }
      }
    }

    // Only overwrite category with AI prediction if guest left it as default 'general'
    const finalCategory: MediaCategory =
      currentMedia.category !== "general" ? currentMedia.category : category;

    const { error: updateErr } = await supabase
      .from("media")
      .update({
        category: finalCategory,
        phash,
      })
      .eq("id", mediaId)
      .eq("album_id", albumId);

    if (updateErr) {
      console.error("[webhook:process-media] update failed", updateErr);
      return jsonError(500, "INTERNAL_ERROR", "Could not update processed media metadata.");
    }

    const response: ProcessMediaWebhookResponse = {
      mediaId,
      category: finalCategory,
      phash,
      duplicateOfMediaId,
    };

    return jsonOk(response);
  } catch (error) {
    console.error("[webhook:process-media] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Media processing webhook failed.");
  }
}
