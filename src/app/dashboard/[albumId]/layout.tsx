import type { ReactNode } from "react";

export function generateStaticParams() {
  return [
    { albumId: "00000000-0000-4000-8000-000000000001" },
    { albumId: "00000000-0000-4000-8000-000000000002" },
  ];
}

export default function DashboardAlbumLayout({ children }: { children: ReactNode }) {
  return children;
}
