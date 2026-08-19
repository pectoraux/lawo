/**
 * GET /api/waitlist/pending
 * Admin-only — returns all PENDING waitlist entries, newest first.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const pending = await db.waitlistEntry.findMany({
    where: { status: 'PENDING' },
    orderBy: { requestedAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      objective: true,
      requestedAt: true,
    },
  });

  return NextResponse.json({ pending, count: pending.length });
}
