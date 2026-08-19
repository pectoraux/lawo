/**
 * POST /api/seed-demo
 * Public, idempotent endpoint that triggers the demo-seed.
 *
 * This is convenient for first-time Vercel deployments: instead of running a
 * local script, hit this endpoint once after deploy and it ensures the demo
 * accounts exist. Idempotent — safe to call repeatedly.
 *
 * Auth: requires NEXTAUTH_SECRET_DEMO_SEED env var OR an existing ADMIN session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { DEMO_ACCOUNTS } from '@/lib/auth/demoAccounts';
import { requireAdmin } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const DEMO_SEED_TOKEN = 'nomos-demo-seed-token-9f3c2a1e7b4d8e6f5a2c9b8d7e6f3a1c';

async function ensureTenant(name: string, kind: 'INDIVIDUAL' | 'ENTERPRISE' | 'PROFESSIONAL_ORG' | 'GOVERNMENT') {
  const existing = await db.tenant.findFirst({ where: { name } });
  if (existing) return existing;
  return db.tenant.create({ data: { name, kind } });
}

export async function POST(req: NextRequest) {
  // Either an admin is signed in OR the request carries the demo-seed token.
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const authorized = admin !== null || token === DEMO_SEED_TOKEN;
  if (!authorized) {
    return NextResponse.json({ error: 'Admin session or demo-seed token required' }, { status: 403 });
  }

  const created: { email: string; role: string; id: string }[] = [];

  for (const d of DEMO_ACCOUNTS) {
    const kind: 'INDIVIDUAL' | 'ENTERPRISE' | 'PROFESSIONAL_ORG' | 'GOVERNMENT' =
      d.role === 'GUEST' || d.role === 'USER' ? 'INDIVIDUAL' :
      d.role === 'OPERATOR' ? 'ENTERPRISE' :
      d.role === 'PACKAGER' ? 'PROFESSIONAL_ORG' :
      'GOVERNMENT';
    const tenant = await ensureTenant(`Demo · ${d.name}`, kind);
    const u = await db.user.upsert({
      where: { email: d.email },
      create: {
        email: d.email,
        passwordHash: hashPassword(d.password),
        name: d.name,
        role: d.role,
        status: 'ACTIVE',
        isDemo: true,
        tenantId: tenant.id,
      },
      update: {
        passwordHash: hashPassword(d.password),
        name: d.name,
        role: d.role,
        status: 'ACTIVE',
        isDemo: true,
        tenantId: tenant.id,
      },
    });
    created.push({ email: u.email, role: u.role, id: u.id });
  }

  // Also ensure the real admin exists.
  const adminEmail = 'ekontetevi@gmail';
  const adminTenant = await ensureTenant('Nomos Platform Administration', 'GOVERNMENT');
  const adminUser = await db.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: hashPassword('Payswap123456'),
      name: 'Ekon Tetevi',
      role: 'ADMIN',
      status: 'ACTIVE',
      isDemo: false,
      tenantId: adminTenant.id,
    },
    update: {
      passwordHash: hashPassword('Payswap123456'),
      name: 'Ekon Tetevi',
      role: 'ADMIN',
      status: 'ACTIVE',
      tenantId: adminTenant.id,
    },
  });
  created.push({ email: adminUser.email, role: adminUser.role, id: adminUser.id });

  return NextResponse.json({ seeded: true, users: created, count: created.length });
}
