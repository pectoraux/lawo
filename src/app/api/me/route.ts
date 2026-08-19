/**
 * GET /api/me
 * Returns the current session user (or 401 if not signed in).
 * Used by the client to hydrate auth state on page load.
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      role: session.user.role,
      status: session.user.status,
      isDemo: session.user.isDemo,
      tenantId: session.user.tenantId ?? null,
    },
  });
}
