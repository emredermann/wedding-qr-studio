import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { getAuthenticatedActor, verifyAlbumManagerAccess } from "@/lib/auth";
import { DEMO_ALBUM_ID } from "@/lib/demo-data";
import {
  getPaymentSigningSecret,
  PLAN_CATALOG,
  signWebhookPayload,
} from "@/lib/payments";
import {
  type CheckoutSessionResponse,
  PLAN_TIERS,
} from "@/types/database";

const createCheckoutSchema = z.object({
  albumId: z.uuid(),
  userId: z.uuid().optional(),
  planTier: z.enum(PLAN_TIERS),
});

interface StripeSessionCreateResponse {
  id?: string;
  url?: string;
  error?: { message?: string };
}

/**
 * POST /api/checkout
 *
 * Generates a one-time checkout session passing `albumId`, `userId`, and
 * `planTier` in custom metadata.
 *  - When `STRIPE_SECRET_KEY` is configured, creates a real Stripe Checkout
 *    Session via the Stripe REST API.
 *  - In local/demo environments without `STRIPE_SECRET_KEY`, dispatches a
 *    cryptographically signed payment webhook to `/api/webhooks/payment` and
 *    returns the dashboard confirmation URL.
 */
export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, createCheckoutSchema, 8 * 1024);
  if (!parsed.ok) return parsed.response;

  const actor = await getAuthenticatedActor();
  if (!actor) {
    return jsonError(401, "UNAUTHORIZED", "Please sign in before upgrading your wedding album.");
  }
  const effectiveUserId = actor.userId;

  const { albumId, planTier } = parsed.data;
  if (albumId !== DEMO_ALBUM_ID) {
    const access = await verifyAlbumManagerAccess(albumId, actor);
    if (!access.allowed) {
      return jsonError(403, "FORBIDDEN", "You do not have permission to upgrade this album.");
    }
  }

  const plan = PLAN_CATALOG[planTier];
  const origin = request.nextUrl.origin;
  const successUrl = `${origin}/dashboard/${albumId}?checkout=success&tier=${planTier}`;
  const cancelUrl = `${origin}/dashboard/${albumId}?checkout=cancelled`;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (stripeSecretKey) {
    try {
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("success_url", successUrl);
      form.set("cancel_url", cancelUrl);
      form.set("line_items[0][price_data][currency]", "usd");
      form.set("line_items[0][price_data][unit_amount]", String(plan.priceCents));
      form.set("line_items[0][price_data][product_data][name]", plan.name);
      form.set("line_items[0][price_data][product_data][description]", plan.description);
      form.set("line_items[0][quantity]", "1");
      form.set("metadata[albumId]", albumId);
      form.set("metadata[userId]", effectiveUserId);
      form.set("metadata[planTier]", planTier);

      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });

      const stripeData = (await stripeRes.json()) as StripeSessionCreateResponse;
      if (!stripeRes.ok || !stripeData.url || !stripeData.id) {
        throw new Error(stripeData.error?.message || "Stripe session creation failed.");
      }

      const response: CheckoutSessionResponse = {
        checkoutUrl: stripeData.url,
        sessionId: stripeData.id,
        mode: "stripe",
      };
      return jsonOk(response, 201);
    } catch (error) {
      console.error("[checkout] Stripe error", error);
      return jsonError(500, "INTERNAL_ERROR", "Could not initialize Stripe checkout session.");
    }
  }

  // Signed local checkout dispatch when STRIPE_SECRET_KEY is not set
  try {
    const sessionId = `cs_signed_${crypto.randomUUID()}`;
    const eventPayload = JSON.stringify({
      id: `evt_${crypto.randomUUID()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          payment_status: "paid",
          metadata: {
            albumId,
            userId: effectiveUserId,
            planTier,
          },
        },
      },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(eventPayload, timestamp, getPaymentSigningSecret());

    await fetch(`${origin}/api/webhooks/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": signature,
      },
      body: eventPayload,
    });

    const response: CheckoutSessionResponse = {
      checkoutUrl: successUrl,
      sessionId,
      mode: "simulated_signed",
    };
    return jsonOk(response, 201);
  } catch (error) {
    console.error("[checkout] simulated webhook error", error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to complete checkout session.");
  }
}
