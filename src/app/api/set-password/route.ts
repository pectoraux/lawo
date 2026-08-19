/**
 * POST /api/set-password
 * Activates a WAITLISTED user via an invitation token.
 *
 * Body: { token: string, password: string }
 *
 * On success:
 *   - sets `passwordHash` (via hashPassword)
 *   - sets `status` to ACTIVE
 *   - clears `invitationToken` and `invitationExpiresAt`
 *   - records an audit event `auth.set_password` (INFO)
 *
 * On failure:
 *   - returns 400 with a generic error
 *   - SAME error message for "token not found" and "token expired" to prevent
 *     enumeration
 *   - rate-limited: 5 requests per 60s per IP (prevents token brute-force)
 *   - CSRF-protected (Origin header check)
 *
 * Password requirements: minimum 8 characters. We deliberately do not enforce
 * complexity rules — length is the strongest single factor.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { recordAudit } from '@/lib/auth/audit';
import { rateLimitFromRequest } from '@/lib/rate-limit';
import { checkOrigin } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

interface SetPasswordBody {
  token?: string;
  password?: string;
}

const GENERIC_ERROR = 'This invitation link is invalid or has expired. Please request a new invitation.';
const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  // CSRF: reject cross-origin requests.
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit: 5 per 60s per IP.
  const rl = rateLimitFromRequest(req, 'set-password', { windowMs: 60_000, max: 5 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  let body: SetPasswordBody;
  try {
    body = (await req.json()) as SetPasswordBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const token = (body.token ?? '').trim();
  const password = body.password ?? '';

  if (!token || password.length < MIN_PASSWORD_LENGTH) {
    // Use the generic error so we don't reveal whether the token exists.
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { invitationToken: token },
    select: {
      id: true,
      email: true,
      status: true,
      invitationExpiresAt: true,
      tenantId: true,
    },
  });

  const now = new Date();
  // Same error for "no such token" and "expired" — enumeration resistance.
  if (
    !user ||
    !user.invitationExpiresAt ||
    user.invitationExpiresAt < now ||
    user.status !== 'WAITLISTED'
  ) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(password),
      status: 'ACTIVE',
      invitationToken: null,
      invitationExpiresAt: null,
    },
  });

  await recordAudit({
    tenantId: user.tenantId,
    actor: user.email,
    action: 'auth.set_password',
    subjectId: user.id,
    severity: 'INFO',
    payload: { email: user.email },
  });

  return NextResponse.json({ ok: true, email: user.email });
}
