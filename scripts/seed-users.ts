/**
 * Seed script — creates the admin and demo accounts in the Neon DB.
 *
 * Run with: `bun run scripts/seed-users.ts`
 *
 * Idempotent: existing users (matched by email) are upserted — their
 * passwordHash, role, and status are reset to the canonical values.
 */
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/password';
import { DEMO_ACCOUNTS } from '../src/lib/auth/demoAccounts';

const ADMIN_EMAIL = 'ekontetevi@gmail';
const ADMIN_PASSWORD = 'Payswap123456';
const ADMIN_NAME = 'Ekon Tetevi';

async function ensureTenant(name: string, kind: 'INDIVIDUAL' | 'SMALL_BUSINESS' | 'ENTERPRISE' | 'GOVERNMENT') {
  const existing = await db.tenant.findFirst({ where: { name } });
  if (existing) return existing;
  return db.tenant.create({ data: { name, kind } });
}

async function main() {
  console.log('Seeding users in Neon PostgreSQL...\n');

  // 1. Admin tenant + user
  const adminTenant = await ensureTenant('Nomos Platform Administration', 'GOVERNMENT');
  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      name: ADMIN_NAME,
      role: 'ADMIN',
      status: 'ACTIVE',
      isDemo: false,
      tenantId: adminTenant.id,
    },
    update: {
      passwordHash: hashPassword(ADMIN_PASSWORD),
      name: ADMIN_NAME,
      role: 'ADMIN',
      status: 'ACTIVE',
      tenantId: adminTenant.id,
    },
  });
  console.log(`  admin: ${admin.email} (id=${admin.id}) tenant=${admin.tenantId}`);

  // 2. Demo accounts — each gets a personal tenant
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
  console.log(`\nAdmin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('Demo logins:');
  for (const d of DEMO_ACCOUNTS) {
    console.log(`  ${d.role.padEnd(8)} ${d.email} / ${d.password}`);
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
