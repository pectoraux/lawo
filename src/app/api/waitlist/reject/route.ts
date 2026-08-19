/**
 * POST /api/waitlist/reject
 * Admin-only — rejects a pending waitlist entry. Does NOT create a user.
 *
 * Body: { entryId, notes? }
 *
 * Rate-limited: 10 req/60s/IP. CSRF-protected (Origin check).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { rateLimitFromRequest } from '@/lib/rate-limit';
import { checkOrigin } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

interface RejectBody {
  entryId?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  // CSRF: reject cross-origin requests.
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit: 10 per 60s per IP (admin endpoint).
  const rl = rateLimitFromRequest(req, 'waitlist-reject', { windowMs: 60_000, max: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: RejectBody;
  try {
    body = (await req.json()) as RejectBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.entryId) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
  }

  const entry = await db.waitlistEntry.findUnique({ where: { id: body.entryId } });
  if (!entry) {
    return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 });
  }
  if (entry.status !== 'PENDING') {
    return NextResponse.json({ error: `Entry already ${entry.status.toLowerCase()}` }, { status: 409 });
  }

  await db.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedById: admin.id,
      notes: body.notes?.trim() || null,
    },
  });

  await recordAudit({
    tenantId: admin.tenantId,
    actor: admin.email,
    action: 'waitlist.reject',
    subjectId: entry.id,
    severity: 'WARN',
    payload: { email: entry.email, notes: body.notes ?? null },
  });

  return NextResponse.json({ id: entry.id, status: 'REJECTED' });
}
