import type { ReactNode } from "react";

export function generateStaticParams() {
  return [
    { slug: "demo-wedding" },
    { slug: "amalfi-welcome-dinner" },
  ];
}

export default function EventSlugLayout({ children }: { children: ReactNode }) {
  return children;
}
