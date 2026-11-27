"use client";

import { InvitationCard, TEMPLATE_LOOK } from "@/components/invitations/InvitationCard";
import { useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";
import { DEFAULT_DESIGN, INVITE_TEMPLATES, type InviteTemplate } from "@/lib/invitations/model";

const NAMES: Record<InviteTemplate, MsgKey> = { klasik: "Klasik", botanik: "Botanik", kemer: "Kemer", gece: "Gece", modern: "Modern", minimal: "Minimal" };
const COUPLES = ["Elif & Kerem", "Zeynep & Can", "Defne & Arda", "Selin & Emre", "Ece & Mert", "Nil & Baran"];

/** The six invitation templates with sample content (landing pages). */
export function TemplateShowcase() {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
      {INVITE_TEMPLATES.map((tpl, i) => (
        <figure key={tpl} className="overflow-hidden rounded-3xl" style={{ background: TEMPLATE_LOOK[tpl].page }}>
          <div className="relative h-64 overflow-hidden sm:h-96">
            <div className="pointer-events-none absolute top-6 left-1/2 w-[26rem] origin-top -translate-x-1/2 scale-[0.4] sm:top-8 sm:scale-[0.62]">
              <InvitationCard
                design={{
                  ...DEFAULT_DESIGN,
                  template: tpl,
                  headline: t("Evleniyoruz"),
                  names: COUPLES[i],
                  message: t("Hayatımızın en güzel gününde sizleri de aramızda görmekten mutluluk duyarız."),
                  dateStyle: tpl === "modern" || tpl === "minimal" ? "numeric" : "long",
                  time: "19:00",
                  venue: "Bahçe Restoran",
                  showCountdown: false,
                }}
                event={{ title: COUPLES[i], coupleNames: COUPLES[i], eventDate: "2027-06-12", themeColor: "#1c1b19" }}
                greeting={t("Ayşe Yılmaz")}
                compact
              />
            </div>
          </div>
          <figcaption className="bg-white px-4 py-3 text-sm font-semibold text-stone-900">{t(NAMES[tpl])}</figcaption>
        </figure>
      ))}
    </div>
  );
}
