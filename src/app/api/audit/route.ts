/**
 * GET /api/audit?limit=50
 *
 * Returns audit events scoped to the authenticated user's tenant.
 * - Non-admin: only their own tenant's events. The `tenantId` and `subjectId`
 *   query params are AND-scoped with the caller's tenant — they cannot be used
 *   to read another tenant's audit trail.
 * - Admin: may pass `platformWide=true` to read across all tenants (explicit).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createDbAuditLog } from '@/platform/audit/AuditLog';
import { requireUserAuthenticated } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { user, response } = await requireUserAuthenticated();
  if (response) return response;

  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const requestedSubjectId = url.searchParams.get('subjectId');
  const platformWide = url.searchParams.get('platformWide') === 'true' && user.role === 'ADMIN';
  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50;

  // Non-admins with no tenant: return empty.
  if (!platformWide && user.tenantId == null) {
    return NextResponse.json({ events: [], count: 0 });
  }

  const auditLog = createDbAuditLog();

  // If subjectId is requested, AND it with the tenant filter.
  // This prevents a user from querying another tenant's subject audit trail.
  let events;
  if (requestedSubjectId) {
    if (platformWide) {
      // Admin platform-wide subject query
      events = await auditLog.forSubject(requestedSubjectId, limit);
    } else {
      events = await auditLog.forSubjectInTenant(requestedSubjectId, user.tenantId!, limit);
    }
  } else if (platformWide) {
    // Admin platform-wide: ALL events across all tenants.
    events = await auditLog.recentAll(limit);
  } else {
    // Non-admin or admin without flag: own tenant only.
    events = await auditLog.recent(user.tenantId, limit);
  }

  return NextResponse.json({ events, count: events.length });
}
