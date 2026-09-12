import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Next.js 16 proxy with optimistic session cookie check
 *
 * Layer 1 of two-layer auth protection (optimistic, fast):
 * - Check for Better Auth session cookie presence
 * - If no cookie and path starts with /(dashboard), redirect to /login
 * - If cookie exists, pass through (no DB call — proxy must be fast)
 * - Do NOT validate the session in proxy — that's the layout's job
 *
 * Layer 2 is in (dashboard)/layout.tsx (authoritative, secure):
 * - Call auth.api.getSession() to validate session
 * - If no valid session, redirect to /login
 * - If valid, render children with session data
 *
 * CRITICAL: The session check in layout.tsx is the TRUE security boundary.
 * proxy.ts is just UX optimization (prevents flash). A user with a stale/expired
 * cookie will pass proxy.ts but fail layout.tsx validation.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect dashboard routes
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  // Check for Better Auth session cookie
  // Better Auth uses "better-auth.session_token" cookie name (configured in auth.ts)
  const sessionCookie = request.cookies.get("better-auth.session_token");

  // If no session cookie, redirect to login
  if (!sessionCookie || sessionCookie.value === "") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Cookie exists — pass through
  // Layout will validate session and redirect if invalid
  return NextResponse.next();
}

/**
 * Middleware configuration for Next.js 16
 *
 * This function is exported as the default export and used by Next.js 16
 * as the middleware function.
 */
export default middleware;
