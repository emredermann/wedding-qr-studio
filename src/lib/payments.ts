import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { PlanTier } from "@/types/database";

export interface PlanPricingSpec {
  tier: PlanTier;
  name: string;
  priceCents: number;
  priceDisplay: string;
  description: string;
}

export const PLAN_CATALOG: Readonly<Record<PlanTier, PlanPricingSpec>> = {
  starter: {
    tier: "starter",
    name: "Starter Wedding Pass",
    priceCents: 2900,
    priceDisplay: "$29",
    description: "Intimate celebrations — up to 500 full-res photos, QR Card Studio & 24-month archive.",
  },
  pro: {
    tier: "pro",
    name: "Pro Celebration Suite",
    priceCents: 6900,
    priceDisplay: "$69",
    description: "Unlimited photos, 4K video & voice toasts, AI Face Search & Disposable Camera mode.",
  },
  unlimited: {
    tier: "unlimited",
    name: "Unlimited Multi-Event Bespoke",
    priceCents: 9900,
    priceDisplay: "$99",
    description: "Up to 5 wedding events, Custom Onboarding Flow Builder, AI Categorization & 24-month vault.",
  },
};

export function getPaymentSigningSecret(): string {
  return (
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "wedding-qr-studio-local-hmac-secret-key-2026"
  );
}

export function signWebhookPayload(rawBody: string, timestamp: number, secret: string): string {
  const signedPayload = `${timestamp}.${rawBody}`;
  const hmac = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

/**
 * Verifies a Stripe-formatted (`t=...,v1=...`) or raw hex HMAC-SHA256 webhook
 * signature in constant time (`timingSafeEqual`). Rejects timestamps older
 * than 5 minutes to prevent replay attacks.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",").map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Part = parts.find((p) => p.startsWith("v1="));

  if (tPart && v1Part) {
    const timestamp = Number(tPart.slice(2));
    const receivedHex = v1Part.slice(3);
    if (!Number.isFinite(timestamp) || !/^[0-9a-f]{64}$/i.test(receivedHex)) {
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestamp) > 300) {
      return false;
    }

    const expectedHex = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex");

    const bufA = Buffer.from(receivedHex, "hex");
    const bufB = Buffer.from(expectedHex, "hex");
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }

  // Fallback: direct hex HMAC header (`X-Webhook-Signature`)
  const cleanedHex = signatureHeader.replace(/^sha256=/i, "").trim();
  if (!/^[0-9a-f]{64}$/i.test(cleanedHex)) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const bufA = Buffer.from(cleanedHex, "hex");
  const bufB = Buffer.from(expectedHex, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Computes the 24-month post-wedding expiration timestamp (`event_date + 24 months`
 * or `now + 24 months`, whichever is later).
 */
export function computePostWeddingExpiration(eventDateStr: string | null): string {
  const now = new Date();
  let anchor = now;
  if (eventDateStr) {
    const parsed = new Date(eventDateStr);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      anchor = parsed;
    }
  }
  const expires = new Date(anchor.getTime());
  expires.setUTCMonth(expires.getUTCMonth() + 24);
  return expires.toISOString();
}
