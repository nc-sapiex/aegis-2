import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route Protection Middleware (Edge Runtime)
 *
 * Cookie-based auth gating. Does NOT import @/lib/auth because
 * Better Auth + Prisma pull in Node.js built-ins (node:path, crypto)
 * which are unavailable in the Edge Runtime.
 *
 * Strategy:
 * - Public routes → pass through
 * - Protected routes → check for session cookie
 * - Full session validation happens in server components / API routes
 *
 * Features:
 * - Request ID propagation (x-request-id header)
 * - Session cookie validation
 *
 * Public routes:
 * - /login, /accept-invite, /api/health, / (landing)
 * - /api/auth/(.*) (Better Auth endpoints)
 * - Static assets (_next/static, _next/image, favicon.ico)
 */

const PUBLIC_ROUTES = ["/login", "/accept-invite", "/api/health", "/"];

const PUBLIC_ROUTE_PATTERNS = [/^\/api\/auth\/.*/, /^\/api\/health/];

/** Better Auth session cookie names (with and without __Secure- prefix) */
const SESSION_COOKIES = [
  "__Secure-better-auth.session_token", // Production (useSecureCookies: true)
  "better-auth.session_token", // Development (useSecureCookies: false)
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generate or preserve request ID for tracing
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  // Allow public routes
  if (isPublicRoute(pathname)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-request-id", requestId);
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  // Check for session cookie (lightweight Edge-safe check)
  // Full session validation happens server-side in pages/API routes
  const hasSession = SESSION_COOKIES.some(
    (name) => request.cookies.get(name)?.value,
  );
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("x-request-id", requestId);
    return response;
  }

  // Forward request with request ID
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

/**
 * Match all routes except static files
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|logos/).*)",
  ],
};
