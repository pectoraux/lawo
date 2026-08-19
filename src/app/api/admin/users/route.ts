/**
 * GET /api/admin/users
 * Admin-only — lists all users (excluding password hashes).
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

  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      isDemo: true,
      tenantId: true,
      createdAt: true,
      emailVerified: true,
    },
  });

  return NextResponse.json({ users, count: users.length });
}
