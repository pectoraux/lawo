/**
 * Route guards — combined auth + CSRF checks for API route handlers.
 *
 * Usage at the top of a POST handler:
 *   const guard = guardMutation(req);
 *   if (guard) return guard;
 *
 * Usage at the top of a GET handler:
 *   const guard = guardAuthenticated();
 *   if (guard) return guard;
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser, requireAdmin } from '@/lib/auth/session';
import { checkOrigin } from '@/lib/csrf';

/**
 * Guards a POST/PUT/DELETE mutation: requires an authenticated ACTIVE user
 * AND a same-origin (CSRF-safe) request.
 * Returns a NextResponse (401/403) if the guard fails, or null if the request passes.
 */
export async function guardMutation(req: NextRequest): Promise<NextResponse | null> {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin requests not permitted' }, { status: 403 });
  }
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return null;
}

/**
 * Guards a privileged admin mutation: requires an authenticated ACTIVE ADMIN
 * AND a same-origin (CSRF-safe) request.
 */
export async function guardAdminMutation(req: NextRequest): Promise<NextResponse | null> {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin requests not permitted' }, { status: 403 });
  }
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  return null;
}

/**
 * Guards a GET request: requires an authenticated ACTIVE user (any role).
 * No CSRF check needed for GET (safe method).
 */
export async function guardAuthenticated(): Promise<NextResponse | null> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return null;
}
