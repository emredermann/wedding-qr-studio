import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/http";
import { DEMO_ALBUM_ID } from "@/lib/demo-data";
import {
  computePostWeddingExpiration,
  getPaymentSigningSecret,
  verifyWebhookSignature,
} from "@/lib/payments";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { PLAN_TIERS } from "@/types/database";

const paymentMetadataSchema = z.object({
  albumId: z.uuid(),
  userId: z.uuid(),
  planTier: z.enum(PLAN_TIERS),
});

const webhookEventSchema = z.object({
  id: z.string().min(1),
  type: z.literal("checkout.session.completed"),
  data: z.object({
    object: z.object({
      id: z.string().min(1),
      payment_status: z.string().optional(),
      metadata: paymentMetadataSchema,
    }),
  }),
});

/**
 * POST /api/webhooks/payment
 *
 * Cryptographically verifies the incoming payment webhook signature
 * (`Stripe-Signature` or `X-Webhook-Signature` via `crypto.timingSafeEqual`),
 * marks `albums.is_paid = true`, sets `albums.plan_tier`, and extends
 * `albums.expires_at` to 24 months post-wedding.
 */
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Could not read webhook request body.");
  }

  const signatureHeader =
    request.headers.get("stripe-signature") ?? request.headers.get("x-webhook-signature");
  const secret = getPaymentSigningSecret();

  if (!verifyWebhookSignature(rawBody, signatureHeader, secret)) {
    return jsonError(401, "UNAUTHORIZED", "Invalid payment webhook cryptographic signature.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "BAD_REQUEST", "Webhook payload is not valid JSON.");
  }

  const eventResult = webhookEventSchema.safeParse(parsedJson);
  if (!eventResult.success) {
    return jsonError(422, "VALIDATION_FAILED", "Unrecognized payment webhook event structure.");
  }

  const { albumId, planTier } = eventResult.data.data.object.metadata;

  if (albumId === DEMO_ALBUM_ID) {
    return jsonOk({
      received: true,
      albumId,
      planTier,
      isPaid: true,
      expiresAt: computePostWeddingExpiration("2026-06-20"),
    });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: album, error: lookupErr } = await supabase
      .from("albums")
      .select("id, event_date")
      .eq("id", albumId)
      .maybeSingle();

    if (lookupErr || !album) {
      return jsonError(404, "ALBUM_NOT_FOUND", "Target album for payment not found.");
    }

    const expiresAt = computePostWeddingExpiration(album.event_date);

    const { error: updateErr } = await supabase
      .from("albums")
      .update({
        is_paid: true,
        plan_tier: planTier,
        expires_at: expiresAt,
      })
      .eq("id", albumId);

    if (updateErr) {
      console.error("[webhook:payment] album update failed", updateErr);
      return jsonError(500, "INTERNAL_ERROR", "Could not activate paid album tier.");
    }

    return jsonOk({
      received: true,
      albumId,
      planTier,
      isPaid: true,
      expiresAt,
    });
  } catch (error) {
    console.error("[webhook:payment] unexpected error", error);
    return jsonError(500, "INTERNAL_ERROR", "Payment webhook processing failed.");
  }
}
