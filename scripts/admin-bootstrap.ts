/**
 * Admin bootstrap — replaces the COMPROMISED admin password with an
 * invitation-token flow.
 *
 * What this script does:
 *   1. Finds the admin user by email `ekontetevi@gmail`.
 *   2. Clears `passwordHash` (sets to null).
 *   3. Generates a random 32-byte hex token via `crypto.randomBytes`.
 *   4. Sets `invitationToken` to that token.
 *   5. Sets `invitationExpiresAt` to now + 7 days.
 *   6. Sets `status` to `WAITLISTED` (the existing authorize() already blocks
 *      WAITLISTED users from signing in — so the admin cannot authenticate
 *      until they complete the set-password flow).
 *   7. Writes the bootstrap URL to `/home/z/my-project/.admin-bootstrap.local`
 *      (gitignored) — two lines: production + localhost.
 *
 * ALSO: deletes the leaked temp-password user `testuser1@example.com`
 * (SEC-4) and removes its tenant if no other users reference it.
 *
 * Run with: `set -a && source .env && set +a && bun run scripts/admin-bootstrap.ts`
 *
 * Output: prints ONLY a confirmation that the file was written. The token is
 * NEVER echoed to stdout/stderr — it lives only in the gitignored file.
 */
import { db } from '../src/lib/db';

const ADMIN_EMAIL = 'ekontetevi@gmail';
const LEAKED_USER_EMAIL = 'testuser1@example.com';
const BOOTSTRAP_FILE = '.admin-bootstrap.local';
const PRODUCTION_URL = 'https://lawo.vercel.app';
const LOCALHOST_URL = 'http://localhost:3000';
const EXPIRES_DAYS = 7;

async function bootstrapAdmin(): Promise<string> {
  // Use the Web Crypto API via Node's crypto module — 32 random bytes, hex-encoded.
  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(32).toString('hex');

  const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  // Find the admin user. If absent (fresh DB), create them with the invitation
  // token already set so the operator can complete set-password from a known URL.
  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: null,
        status: 'WAITLISTED',
        invitationToken: token,
        invitationExpiresAt: expiresAt,
      },
    });
  } else {
    // Defensive: create with ADMIN role but WAITLISTED status (so they must set a
    // password before signing in). A tenant is required by the platform model.
    const tenant = await db.tenant.create({
      data: { name: 'Nomos Platform Administration', kind: 'GOVERNMENT' },
    });
    await db.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: 'Ekon Tetevi',
        role: 'ADMIN',
        status: 'WAITLISTED',
        isDemo: false,
        tenantId: tenant.id,
        passwordHash: null,
        invitationToken: token,
        invitationExpiresAt: expiresAt,
      },
    });
  }

  return token;
}

async function deleteLeakedUser(): Promise<void> {
  const leaked = await db.user.findUnique({
    where: { email: LEAKED_USER_EMAIL },
    select: { id: true, tenantId: true },
  });
  if (!leaked) return;

  // Delete the user first (FK cascades for Account/Session; reviewed waitlist
  // entries have `reviewedById` set to null on user delete via the optional
  // relation — Prisma's default RESTRICT would block, so we null it out).
  await db.waitlistEntry.updateMany({
    where: { reviewedById: leaked.id },
    data: { reviewedById: null },
  });
  await db.user.delete({ where: { id: leaked.id } });

  // Delete the tenant if it has no other users.
  if (leaked.tenantId) {
    const remaining = await db.user.count({ where: { tenantId: leaked.tenantId } });
    if (remaining === 0) {
      await db.tenant.delete({ where: { id: leaked.tenantId } });
    }
  }
}

async function main() {
  await deleteLeakedUser();

  const token = await bootstrapAdmin();

  const lines = [
    `${PRODUCTION_URL}/?set_password=${token}`,
    `${LOCALHOST_URL}/?set_password=${token}`,
  ].join('\n');

  const { writeFile } = await import('node:fs/promises');
  await writeFile(BOOTSTRAP_FILE, lines + '\n', { mode: 0o600 });

  console.log(
    'Admin bootstrap token written to .admin-bootstrap.local. Open that file to find the set-password URL.',
  );
}

main()
  .catch((err) => {
    console.error('Admin bootstrap failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
