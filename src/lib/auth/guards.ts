/**
 * Route guards — combined auth + CSRF checks that RETURN the authenticated
 * user on success so route handlers can enforce tenant authorization.
 *
 * Authentication ≠ Authorization.
 *   - Authentication: "who are you?" (checked here)
 *   - Authorization: "are you allowed to do this?" (checked by the route
 *     handler using the returned user's tenantId/role)
 *
 * Usage:
 *   const { user, response } = await requireUserWithScope(req);
 *   if (response) return response;
 *   // user.tenantId is the caller's effective tenant scope
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser, requireAdmin } from '@/lib/auth/session';
import { checkOrigin } from '@/lib/csrf';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: 'GUEST' | 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';
  status: 'WAITLISTED' | 'ACTIVE' | 'DISABLED';
  isDemo: boolean;
  tenantId: string | null;
}

interface GuardResult {
  user: SessionUser | null;
  response: NextResponse | null;
}

/**
 * Guards a POST/PUT/DELETE mutation: requires an authenticated ACTIVE user
 * AND a same-origin (CSRF-safe) request. Returns the user on success.
 */
export async function requireUserWithScope(req: NextRequest): Promise<GuardResult> {
  if (!checkOrigin(req)) {
    return { user: null, response: NextResponse.json({ error: 'Cross-origin requests not permitted' }, { status: 403 }) };
  }
  const user = await requireUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  return { user, response: null };
}

/**
 * Guards a privileged admin mutation: requires an authenticated ACTIVE ADMIN
 * AND a same-origin (CSRF-safe) request. Returns the admin user on success.
 */
export async function requireAdminWithScope(req: NextRequest): Promise<GuardResult> {
  if (!checkOrigin(req)) {
    return { user: null, response: NextResponse.json({ error: 'Cross-origin requests not permitted' }, { status: 403 }) };
  }
  const admin = await requireAdmin();
  if (!admin) {
    return { user: null, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { user: admin, response: null };
}

/**
 * Guards a GET request: requires an authenticated ACTIVE user (any role).
 * No CSRF check (safe method). Returns the user on success.
 */
export async function requireUserAuthenticated(): Promise<GuardResult> {
  const user = await requireUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  return { user, response: null };
}

// ---------------------------------------------------------------------------
// Legacy guards (kept for backward compat; thin wrappers around the new API)
// ---------------------------------------------------------------------------

export async function guardMutation(req: NextRequest): Promise<NextResponse | null> {
  const { response } = await requireUserWithScope(req);
  return response;
}

export async function guardAdminMutation(req: NextRequest): Promise<NextResponse | null> {
  const { response } = await requireAdminWithScope(req);
  return response;
}

export async function guardAuthenticated(): Promise<NextResponse | null> {
  const { response } = await requireUserAuthenticated();
  return response;
}

// ---------------------------------------------------------------------------
// Authorization helpers — tenant scope enforcement
// ---------------------------------------------------------------------------

/**
 * Returns the tenantId the caller is authorized to read/write.
 * - Non-admin users: their own tenantId (or null if global — but active users always have a tenant).
 * - Admin users: their own tenantId for writes; for reads they may pass `allowPlatformWide=true`
 *   to access all tenants (e.g. the admin audit panel).
 *
 * If the caller has no tenantId (e.g. a misconfigured guest), returns null and
 * the route should treat this as "no access to tenant-scoped data".
 */
export function effectiveTenantScope(user: SessionUser, opts?: { allowPlatformWide?: boolean }): string | null {
  if (opts?.allowPlatformWide && user.role === 'ADMIN') {
    // Admins may read across all tenants for platform administration.
    // Returns a sentinel that the route handler interprets as "no tenant filter".
    return '__PLATFORM_WIDE__';
  }
  return user.tenantId;
}

/**
 * Returns true if the caller is authorized to access data belonging to `targetTenantId`.
 * - Non-admin: targetTenantId must equal the caller's tenantId.
 * - Admin with allowPlatformWide: always true.
 */
export function canAccessTenant(user: SessionUser, targetTenantId: string | null, opts?: { allowPlatformWide?: boolean }): boolean {
  if (opts?.allowPlatformWide && user.role === 'ADMIN') return true;
  if (targetTenantId == null || user.tenantId == null) return false;
  return targetTenantId === user.tenantId;
}
