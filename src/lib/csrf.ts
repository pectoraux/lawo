/**
 * CSRF — explicit trusted-origin policy for custom POST endpoints.
 *
 * A request is considered same-origin (CSRF-safe) if its `Origin` header
 * matches one of the trusted origins:
 *
 *   1. `NEXTAUTH_URL` (the canonical deployment URL, e.g. https://lawo.vercel.app)
 *   2. The request's own host (handles localhost + Vercel preview deployments
 *      like lawo-abc123-tay.vercel.app without per-env configuration)
 *
 * The comparison is full-origin: scheme + host + port must all match.
 *
 * NextAuth handles its own CSRF on `/api/auth/*` routes; we only apply this
 * check to custom Nomos endpoints.
 *
 * Tests: see architecture/architecture-tests/csrf-tests.ts
 */
interface ParsedOrigin {
  scheme: string;
  host: string;
  port: string | null;
}

function parseOrigin(url: string): ParsedOrigin | null {
  try {
    const u = new URL(url);
    return {
      scheme: u.protocol.replace(':', '').toLowerCase(),
      host: u.hostname.toLowerCase(),
      port: u.port || null,
    };
  } catch {
    return null;
  }
}

function requestOrigin(req: Request): ParsedOrigin | null {
  // The Host header gives us host:port. The scheme is inferred from the
  // request URL (Vercel sets https:// for production; localhost is http).
  const hostHeader = req.headers.get('host');
  if (!hostHeader) return null;
  const url = new URL(req.url);
  return {
    scheme: url.protocol.replace(':', '').toLowerCase(),
    host: hostHeader.split(':')[0]!.toLowerCase(),
    port: hostHeader.includes(':') ? hostHeader.split(':')[1]! : null,
  };
}

function originsMatch(a: ParsedOrigin, b: ParsedOrigin): boolean {
  // On production (Vercel), requests are always HTTPS. On localhost, http.
  // We require scheme + host + port to all match.
  // Exception: if both hosts are localhost, allow port mismatch (dev server
  // sometimes runs on different ports for the client vs API).
  if (a.host !== b.host) return false;
  if (a.scheme !== b.scheme) {
    // Allow http→https downgrade only on localhost (dev).
    if (a.host === 'localhost' && (a.scheme === 'http' || b.scheme === 'http')) {
      // continue to port check
    } else {
      return false;
    }
  }
  if (a.port !== b.port) {
    // Allow port mismatch on localhost (dev convenience).
    if (a.host !== 'localhost') return false;
  }
  return true;
}

export function checkOrigin(req: Request): boolean {
  const originHeader = req.headers.get('origin');
  if (!originHeader) {
    // No Origin header → fail-closed. Browsers always send Origin on POST.
    return false;
  }

  const origin = parseOrigin(originHeader);
  if (!origin) return false;

  const requestSelf = requestOrigin(req);
  if (!requestSelf) return false;

  // Trusted origin #1: the request's own host (handles localhost + previews).
  if (originsMatch(origin, requestSelf)) return true;

  // Trusted origin #2: NEXTAUTH_URL (the canonical deployment URL).
  // This handles the case where Vercel rewrites the Host header internally
  // but the browser sends the canonical Origin.
  const canonical = process.env.NEXTAUTH_URL;
  if (canonical) {
    const canonicalOrigin = parseOrigin(canonical);
    if (canonicalOrigin && originsMatch(origin, canonicalOrigin)) return true;
  }

  return false;
}
