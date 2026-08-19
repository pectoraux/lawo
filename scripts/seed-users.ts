/**
 * Seed script — creates the DEMO accounts in the Neon DB.
 *
 * Run with: `set -a && source .env && set +a && bun run scripts/seed-users.ts`
 *
 * Idempotent: existing demo users (matched by email) are upserted — their
 * passwordHash, role, and status are reset to the canonical demo values.
 *
 * NOTE: This script seeds ONLY demo accounts (isDemo=true). The real admin
 * account is bootstrapped via `scripts/admin-bootstrap.ts` which uses the
 * invitation-token flow (SEC-6) — never an HTTP endpoint.
 *
 * Demo passwords are deliberately simple and PUBLISHED in the UI for demo
 * purposes. Real accounts must not embed secrets in client code.
 */
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/password';
import { DEMO_ACCOUNTS } from '../src/lib/auth/demoAccounts';

async function ensureTenant(name: string, kind: 'INDIVIDUAL' | 'SMALL_BUSINESS' | 'ENTERPRISE' | 'GOVERNMENT' | 'PROFESSIONAL_ORG') {
  const existing = await db.tenant.findFirst({ where: { name } });
  if (existing) return existing;
  return db.tenant.create({ data: { name, kind } });
}

async function main() {
  console.log('Seeding demo users in Neon PostgreSQL...\n');

  for (const d of DEMO_ACCOUNTS) {
    const kind =
      d.role === 'GUEST' ? 'INDIVIDUAL' :
      d.role === 'USER' ? 'INDIVIDUAL' :
      d.role === 'OPERATOR' ? 'ENTERPRISE' :
      d.role === 'PACKAGER' ? 'PROFESSIONAL_ORG' :
      'GOVERNMENT';
    const tenant = await ensureTenant(`Demo · ${d.name}`, kind as 'INDIVIDUAL' | 'ENTERPRISE' | 'PROFESSIONAL_ORG' | 'GOVERNMENT');
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
    console.log(`  demo ${d.role.toLowerCase()}: ${u.email} (id=${u.id}) tenant=${u.tenantId}`);
  }

  console.log('\nSeed complete.');
  console.log('\nDemo logins:');
  for (const d of DEMO_ACCOUNTS) {
    console.log(`  ${d.role.padEnd(8)} ${d.email} / ${d.password}`);
  }
  console.log('\nFor the admin account, run: bun run scripts/admin-bootstrap.ts');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
