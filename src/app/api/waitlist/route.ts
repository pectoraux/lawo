/**
 * POST /api/waitlist
 * Public sign-up — adds an entry to the waitlist. PENDING status.
 *
 * Body: { email, name?, objective? }
 * Returns: { id, status: 'PENDING' } or { status: 'DUPLICATE' } if already pending.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/auth/audit';

export const dynamic = 'force-dynamic';

interface WaitlistBody {
  email?: string;
  name?: string;
  objective?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: WaitlistBody;
  try {
    body = (await req.json()) as WaitlistBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  // Idempotent: if there's already a PENDING entry, return its status without creating a duplicate.
  const existing = await db.waitlistEntry.findUnique({ where: { email } });
  if (existing) {
    await recordAudit({
      actor: 'anonymous',
      action: 'waitlist.duplicate_request',
      subjectId: existing.id,
      severity: 'INFO',
      payload: { email, status: existing.status },
    });
    return NextResponse.json({
      id: existing.id,
      status: existing.status,
      message: existing.status === 'PENDING'
        ? 'You are already on the waitlist. We will email you when an admin approves your account.'
        : `Your request has already been ${existing.status.toLowerCase()}.`,
    });
  }

  const entry = await db.waitlistEntry.create({
    data: {
      email,
      name: body.name?.trim() || null,
      objective: body.objective?.trim() || null,
      status: 'PENDING',
    },
  });

  await recordAudit({
    actor: 'anonymous',
    action: 'waitlist.signup',
    subjectId: entry.id,
    severity: 'INFO',
    payload: { email, name: entry.name, objective: entry.objective },
  });

  return NextResponse.json({
    id: entry.id,
    status: 'PENDING',
    message: 'You are on the waitlist. An administrator will review your request and create your account.',
  });
}
