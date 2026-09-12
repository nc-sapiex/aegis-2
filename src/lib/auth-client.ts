import { createAuthClient } from "better-auth/react";
import { multiSessionClient } from "better-auth/client/plugins";

/**
 * Better Auth client configuration for use in React components
 *
 * This client is used on the client side to interact with authentication.
 *
 * Features:
 * - Multi-session support (Phase 11 SC-3): client-side session management
 */
export const authClient = createAuthClient({
  // Base URL of the auth server (same domain, so optional)
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: [multiSessionClient()],
});

/**
 * Export typed hooks and functions from the auth client
 * These can be used in client components
 */
export const {
  /**
   * Get current session (reactive hook)
   * @example const { data: session, isPending } = useSession()
   */
  useSession,

  /**
   * Sign in with email and password
   * @example await signIn.email({ email, password })
   */
  signIn,

  /**
   * Sign up with email and password
   * @example await signUp.email({ email, password, name })
   */
  signUp,

  /**
   * Sign out (current session)
   * @example await signOut()
   */
  signOut,
} = authClient;

/**
 * Get session without reactive subscription
 * Useful for one-time checks (e.g., in useEffect or event handlers)
 * @example const session = await authClient.getSession()
 */
export const getSession = () => authClient.getSession();

/**
 * List all active sessions for the current user
 * @example const sessions = await authClient.listSessions()
 */
export const listSessions = () => authClient.listSessions();

/**
 * Revoke a specific session
 * @example await authClient.revokeSession({ token: "..." })
 */
export const revokeSession = (token: string) =>
  authClient.revokeSession({ token });

/**
 * Revoke all other sessions except current
 * @example await authClient.revokeOtherSessions()
 */
export const revokeOtherSessions = () => authClient.revokeOtherSessions();

/**
 * Sign out and redirect to login page.
 * Shared handler used by sidebar and top bar sign-out buttons.
 */
export async function handleSignOut() {
  await signOut();
  window.location.href = "/login";
}
