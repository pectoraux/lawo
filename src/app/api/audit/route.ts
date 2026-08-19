/**
 * GET /api/audit?limit=50
 * Returns the recent audit trail.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createDbAuditLog, createInMemoryAuditLog } from '@/platform/audit/AuditLog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const tenantId = url.searchParams.get('tenantId');
  const subjectId = url.searchParams.get('subjectId');
  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50;

  // Try the DB-backed audit log; fall back to in-memory if unavailable.
  const auditLog = createDbAuditLog();
  let events;
  if (subjectId) {
    events = await auditLog.forSubject(subjectId, limit);
  } else {
    events = await auditLog.recent(tenantId, limit);
  }

  return NextResponse.json({ events, count: events.length });
}

/**
 * Fallback handler when DB is unavailable — switch to in-memory.
 * (The createDbAuditLog already gracefully degrades internally, so this is rarely hit.)
 */
export async function fallback() {
  const auditLog = createInMemoryAuditLog();
  const events = await auditLog.recent(null, 50);
  return NextResponse.json({ events, count: events.length, fallback: true });
}
