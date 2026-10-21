/** Pages that may be visited while signed out. Everything else needs a session. */
export const PUBLIC_PAGES = ["/login", "/forgot-password"] as const;

/**
 * Turns a "return to" value from the address bar into a safe path inside this app, or the fallback.
 * Rejects other sites ("//evil.com", "https://evil.com", "/\\evil.com"), control characters, the auth
 * pages themselves and API routes, so a crafted login link can never send someone elsewhere.
 */
export function safeNextPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, "http://app.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://app.invalid") return fallback;
  const path = url.pathname;
  if (path === "/api" || path.startsWith("/api/") || path.startsWith("/_next/")) return fallback;
  if (PUBLIC_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return path + url.search;
}
