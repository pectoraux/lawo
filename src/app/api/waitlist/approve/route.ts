/**
 * POST /api/waitlist/approve
 * Admin-only — promotes a waitlist entry to an ACTIVE user.
 *
 * Body: { entryId, role?, name?, sendInvite? }
 *   - role: defaults to USER. Admin can choose USER | OPERATOR | PACKAGER | ADMIN.
 *   - name: optional override of the requested name.
 *   - The new user is assigned a personal INDIVIDUAL tenant.
 *   - The waitlist entry is marked APPROVED with reviewer info.
 *
 * Returns: { user: { id, email, role }, temporaryPassword? }
 *
 * NOTE: In v1 we generate a random 16-char password and return it ONCE. The
 * admin is expected to deliver it to the user out-of-band. A future email
 * integration would send it automatically.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { recordAudit } from '@/lib/auth/audit';

export const dynamic = 'force-dynamic';

interface ApproveBody {
  entryId?: string;
  role?: 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';
  name?: string;
}

function generateTempPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: NextRequest) {
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

  const tempPassword = generateTempPassword();
  const user = await db.user.create({
    data: {
      email: entry.email,
      name: body.name?.trim() || entry.name || null,
      passwordHash: hashPassword(tempPassword),
      role,
      status: 'ACTIVE',
      isDemo: false,
      tenantId: tenant.id,
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

  await recordAudit({
    tenantId: admin.tenantId,
    actor: admin.email,
    action: 'waitlist.approve',
    subjectId: user.id,
    severity: 'INFO',
    payload: { entryId: entry.id, email: user.email, role, name: user.name },
  });

  return NextResponse.json({
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
    temporaryPassword: tempPassword,
    message: 'Account created. Deliver the temporary password to the user out-of-band.',
  });
}
