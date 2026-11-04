import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env.public";
import type { Database } from "@/types/database";

/** Route prefixes that require an authenticated couple or admin account. */
const PROTECTED_PREFIXES = ["/dashboard", "/admin"] as const;
const PUBLIC_DEMO_DASHBOARD_PATH = "/dashboard/00000000-0000-4000-8000-000000000001";

function isProtectedPath(pathname: string): boolean {
  if (pathname === PUBLIC_DEMO_DASHBOARD_PATH) return false;
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Refreshes the Supabase auth session (rotating cookies when needed) and
 * guards protected routes. Must return the `response` object it builds so
 * refreshed cookies reach the browser.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  let env: ReturnType<typeof getPublicEnv>;
  try {
    env = getPublicEnv();
  } catch (error) {
    console.error("[proxy] Supabase env misconfigured:", error);
    return response;
  }

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Do not run code between createServerClient and getUser(): getUser()
  // revalidates the JWT with Supabase Auth and triggers the cookie refresh.
  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) userId = data.user.id;
  } catch (error) {
    console.error("[proxy] Failed to refresh Supabase session:", error);
  }

  if (!userId && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(loginUrl);
    // Preserve any cookies Supabase rotated/cleared during getUser().
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  if (userId && request.nextUrl.pathname === "/login") {
    const rawNext = request.nextUrl.searchParams.get("next");
    const targetPath =
      rawNext && rawNext.startsWith("/") && !rawNext.startsWith("/login")
        ? rawNext
        : "/dashboard";
    const destUrl = new URL(targetPath, request.url);
    const redirect = NextResponse.redirect(destUrl);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}
