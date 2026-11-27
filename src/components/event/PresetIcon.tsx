import { Briefcase, Heart, PartyPopper, Sparkles, type LucideProps } from "lucide-react";

import { presetFor, type EventType } from "@/lib/event-presets";

const ICONS = { rings: Heart, briefcase: Briefcase, party: PartyPopper, sparkles: Sparkles } as const;

/**
 * Icon of an event type. Events saved before presets existed (`null`) keep the
 * heart they always had.
 */
export function PresetIcon({ eventType: type, ...props }: { eventType: EventType | null } & LucideProps) {
  const Icon = type ? ICONS[presetFor(type).icon] : Heart;
  return <Icon {...props} />;
}
