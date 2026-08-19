/**
 * CSRF — Origin-header check for custom POST endpoints.
 *
 * A request is considered same-origin (and thus CSRF-safe) if the Origin
 * header matches the request's own Host header. This works on any deployment
 * URL (production, preview, localhost) without needing NEXTAUTH_URL to be
 * updated per-environment.
 *
 * If the Origin header is missing, the request is rejected (fail-closed).
 * NextAuth handles its own CSRF on `/api/auth/*` routes; we only apply this
 * check to custom Nomus endpoints.
 */
export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    // Some non-browser clients (curl, server-to-server) don't send Origin.
    // For POST mutations we require it — fail closed.
    return false;
  }

  try {
    const originUrl = new URL(origin);
    const host = req.headers.get('host');
    if (!host) return false;

    // Same-origin: Origin's host must match the request Host.
    // This handles http://localhost:3000, https://lawo.vercel.app, and any
    // preview URL (lawo-xxx.vercel.app) without per-env configuration.
    return originUrl.host === host;
  } catch {
    return false;
  }
}
