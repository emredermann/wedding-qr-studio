"use client";

import { useCallback } from "react";

import { trackEvent } from "@/lib/client/analytics";
import { canvasToBlob, drawFramedPhoto, loadOptionalImage, loadPhoto, shareOrDownload } from "@/lib/client/frame";
import { useLang } from "@/lib/i18n/provider";
import type { MediaDto, PublicEventDto } from "@/types/domain";

/**
 * Returns a function that turns a photo into a framed copy (the event's share
 * frame, Mira mark on the free package) and opens the share sheet or saves it.
 * The original in Google Drive is untouched.
 */
export function useFramedShare(event: Pick<PublicEventDto, "slug" | "title" | "coupleNames" | "eventDate" | "shareFrame" | "brand">) {
  const { locale } = useLang();
  return useCallback(
    async (item: MediaDto) => {
      const [photo, logo] = await Promise.all([loadPhoto(item.fileId, 1600), loadOptionalImage(event.brand?.logoUrl)]);
      const dateText = event.eventDate
        ? new Date(`${event.eventDate}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
        : null;
      const canvas = drawFramedPhoto(photo, event.shareFrame, { title: event.coupleNames || event.title, dateText, logo });
      const blob = await canvasToBlob(canvas);
      const base = (item.originalName || "foto").replace(/\.[^.]+$/, "").slice(0, 60);
      const result = await shareOrDownload(blob, `${event.slug}-${base}.jpg`, event.coupleNames || event.title);
      trackEvent("framed_copy_shared", { result });
    },
    [event.slug, event.title, event.coupleNames, event.eventDate, event.shareFrame, event.brand?.logoUrl, locale],
  );
}
