import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/components/host/LoginForm";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t("Giriş") };
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
