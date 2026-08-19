/**
 * POST /api/waitlist/approve
 * Admin-only — promotes a waitlist entry to a user.
 *
 * Body: { entryId, role?, name? }
 *   - role: defaults to USER. Admin can choose USER | OPERATOR | PACKAGER | ADMIN.
 *   - name: optional override of the requested name.
 *   - The new user is assigned a personal INDIVIDUAL tenant.
 *   - The waitlist entry is marked APPROVED with reviewer info.
 *
 * Returns:
 *   {
 *     user: { id, email, role, name },
 *     invitationUrl: 'https://lawo.vercel.app/?set_password=<TOKEN>',
 *     message: 'Account created. Deliver the invitation URL to the user out-of-band. The URL expires in 7 days.'
 *   }
 *
 * INVITATION-TOKEN FLOW (SEC-6): instead of generating a temp password, we
 * issue a 32-byte hex invitation token valid for 7 days. The new user starts in
 * WAITLISTED status with `passwordHash: null` — they cannot sign in until they
 * complete the set-password flow at /?set_password=<TOKEN>. The token is NEVER
 * returned separately, only inside the invitation URL.
 *
 * Rate-limited: 10 req/60s/IP (admin endpoint). CSRF-protected (Origin check).
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { rateLimitFromRequest } from '@/lib/rate-limit';
import { checkOrigin } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

interface ApproveBody {
  entryId?: string;
  role?: 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';
  name?: string;
}

const INVITATION_EXPIRES_DAYS = 7;
// Canonical production URL — used to construct the invitation URL the admin
// delivers to the user. Localhost URL is never exposed via this API (the
// admin can derive it manually if needed for local dev).
const PUBLIC_BASE_URL = 'https://lawo.vercel.app';

export async function POST(req: NextRequest) {
  // CSRF: reject cross-origin requests.
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit: 10 per 60s per IP (admin endpoint).
  const rl = rateLimitFromRequest(req, 'waitlist-approve', { windowMs: 60_000, max: 10 });
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

  let body: ApproveBody;
  try {
    body = (await req.json()) as ApproveBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.entryId) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
  }

  const role = body.role ?? 'USER';
  if (!['USER', 'OPERATOR', 'PACKAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
  }

  const entry = await db.waitlistEntry.findUnique({ where: { id: body.entryId } });
  if (!entry) {
    return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 });
  }
  if (entry.status !== 'PENDING') {
    return NextResponse.json({ error: `Entry already ${entry.status.toLowerCase()}` }, { status: 409 });
  }

  // Defensive: don't allow approving an entry whose email is already a registered user.
  const existingUser = await db.user.findUnique({ where: { email: entry.email } });
  if (existingUser) {
    return NextResponse.json(
      { error: `A user with email ${entry.email} already exists. Reject the waitlist entry instead.` },
      { status: 409 },
    );
  }

  const tenant = await db.tenant.create({
    data: { name: `Personal · ${entry.email}`, kind: 'INDIVIDUAL' },
  });

  const token = randomBytes(32).toString('hex');
  const invitationExpiresAt = new Date(Date.now() + INVITATION_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  const user = await db.user.create({
    data: {
      email: entry.email,
      name: body.name?.trim() || entry.name || null,
      // INVITATION-TOKEN FLOW: no passwordHash; status WAITLISTED until the user
      // completes the set-password flow at /?set_password=<TOKEN>.
      passwordHash: null,
      role,
      status: 'WAITLISTED',
      isDemo: false,
      tenantId: tenant.id,
      invitationToken: token,
      invitationExpiresAt,
    },
  });

  await db.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedById: admin.id,
    },
  });

  // DURABLE audit: this is a security-sensitive privileged operation.
  // If the audit write fails, the action must be considered incomplete —
  // we roll back the user creation. The audit trail MUST be durable for
  // privileged mutations (architecture §25, §35).
  try {
    await recordAudit({
      tenantId: admin.tenantId,
      actor: admin.email,
      action: 'waitlist.approve',
      subjectId: user.id,
      severity: 'INFO',
      // NOTE: do NOT include the token in the audit payload. The sanitizer in
      // recordAudit would redact it, but defense-in-depth means we don't put it
      // there in the first place.
      payload: { entryId: entry.id, email: user.email, role, name: user.name },
    });
  } catch (auditErr) {
    // Audit persistence failed. Roll back the user creation to avoid an
    // un-audited privileged mutation. The admin will see a 500 error and
    // can retry; the waitlist entry remains APPROVED but the user record is gone.
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    await db.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: 'PENDING', reviewedAt: null, reviewedById: null },
    }).catch(() => {});
    console.error('[waitlist.approve] audit persistence failed — rolled back user creation:', auditErr);
    return NextResponse.json(
      { error: 'Audit persistence failed — the approval was rolled back. Please retry.' },
      { status: 500 },
    );
  }

  const invitationUrl = `${PUBLIC_BASE_URL}/?set_password=${token}`;

  return NextResponse.json({
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
    invitationUrl,
    message: 'Account created. Deliver the invitation URL to the user out-of-band. The URL expires in 7 days.',
  });
}
