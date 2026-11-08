import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/components/host/LoginForm";

export const metadata: Metadata = { title: "Giriş" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
