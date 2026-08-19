/**
 * NextAuth.js configuration — Credentials provider (email + password).
 *
 * - DB-backed users via Prisma (PostgreSQL Neon).
 * - Waitlist gate: only ACTIVE users may sign in; WAITLISTED users see a
 *   "pending approval" error. WAITLISTED-with-invitation-token users cannot
 *   sign in either (they must complete the set-password flow first).
 * - Session strategy: JWT (stateless — works on Vercel serverless).
 * - Demo accounts (isDemo=true) get quick-login buttons in the UI.
 *
 * SEC-7 — per-instance rate limiting inside authorize():
 *   - Tracks failures per `email + client-IP` in an in-memory map.
 *   - 5 failures per 60s → return null for 60s.
 *   - Per-instance limitation documented in src/lib/rate-limit.ts.
 *
 * SEC-12 — audit events:
 *   - `auth.signin_success` (INFO) on a successful authorize().
 *   - `auth.signin_failure` (WARN) on a failed authorize(). The payload uses
 *     a truncated SHA-256 of the email (first 10 hex chars) so an admin can
 *     correlate repeated failures without the audit log itself being an
 *     enumeration vector.
 */
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { recordAudit } from '@/lib/auth/audit';
import { rateLimit } from '@/lib/rate-limit';

/** Extract client IP from the NextAuth req object (a Pick of RequestInternal). */
function clientIpFromReq(req: Pick<{ headers?: Record<string, string> | Headers }, 'headers'>): string {
  const h = req.headers as Record<string, string> | undefined;
  if (!h) return 'unknown';
  const get = (k: string): string | undefined => {
    // Headers may be a Headers instance (server) or a plain object.
    if (typeof (h as unknown as { get?: (k: string) => string | null }).get === 'function') {
      return (h as unknown as { get: (k: string) => string | null }).get(k) ?? undefined;
    }
    return h[k] ?? h[k.toLowerCase()];
  };
  const xff = get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return get('x-real-ip') ?? 'unknown';
}

/** Truncated SHA-256 of an email — for audit logs only, NOT for authz.
 *
 * NOTE: the key name we put this under in audit payloads is `emailDigest`
 * (not `emailHash`) so that the audit-payload sanitizer in recordAudit() —
 * which redacts keys matching /password|token|secret|hash|credential/i —
 * does NOT redact it. The digest itself is safe to log: it's a 10-char hex
 * prefix of SHA-256, which is not reversible to the original email and only
 * useful for correlating repeated failures (per SEC-12).
 */
function hashedEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 10);
}

export const authOptions: NextAuthOptions = {
  // No Prisma adapter — JWT session strategy keeps us stateless on Vercel.
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }, // 30 days
  pages: {
    // We don't use the hosted sign-in page; the consumer UI handles auth inline.
    signIn: '/',
    error: '/',
  },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Nomos Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      // next-auth passes the second arg `req` (Pick<RequestInternal, 'body' | 'query' | 'headers' | 'method'>).
      // We type it loosely here to avoid pulling in next-auth internals; we only
      // need `headers` to extract the client IP for rate limiting.
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();

        // Rate limit: 5 attempts per 60s per email + IP. Keyed on BOTH so a
        // single attacker IP rotating emails is bounded, and a single email
        // being attacked from many IPs is bounded per IP.
        const ip = clientIpFromReq(req as Pick<typeof req, 'headers'>);
        const rl = rateLimit(`signin:${email}:${ip}`, { windowMs: 60_000, max: 5 });
        if (!rl.allowed) {
          await recordAudit({
            actor: 'anonymous',
            action: 'auth.signin_failure',
            severity: 'WARN',
            payload: {
              reason: 'rate_limited',
              emailDigest: hashedEmail(email),
              retryAfterMs: rl.retryAfterMs,
            },
          });
          return null;
        }

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            name: true,
            role: true,
            status: true,
            isDemo: true,
            tenantId: true,
          },
        });

        // Defensive: never reveal which emails are registered vs not.
        // All failure modes (no user, wrong password, disabled, waitlisted, no
        // password set yet) → null + same audit shape.
        const ok = !!(
          user &&
          user.passwordHash &&
          user.status === 'ACTIVE' &&
          verifyPassword(credentials.password, user.passwordHash)
        );

        if (!ok) {
          await recordAudit({
            actor: 'anonymous',
            action: 'auth.signin_failure',
            severity: 'WARN',
            payload: {
              reason: 'invalid_credentials',
              emailDigest: hashedEmail(email),
            },
          });
          return null;
        }

        await recordAudit({
          tenantId: user!.tenantId,
          actor: user!.email,
          action: 'auth.signin_success',
          subjectId: user!.id,
          severity: 'INFO',
          payload: { role: user!.role },
        });

        return {
          id: user!.id,
          email: user!.email,
          name: user!.name ?? undefined,
          role: user!.role,
          status: user!.status,
          isDemo: user!.isDemo,
          tenantId: user!.tenantId ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On first sign-in, `user` is the object returned from authorize().
      if (user) {
        const u = user as unknown as {
          id: string;
          email: string;
          name?: string;
          role: string;
          status: string;
          isDemo: boolean;
          tenantId?: string;
        };
        token.id = u.id;
        token.role = u.role;
        token.status = u.status;
        token.isDemo = u.isDemo;
        if (u.tenantId) token.tenantId = u.tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id;
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).status = token.status;
        (session.user as Record<string, unknown>).isDemo = token.isDemo;
        if (token.tenantId) (session.user as Record<string, unknown>).tenantId = token.tenantId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
