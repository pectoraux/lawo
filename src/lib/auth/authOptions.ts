/**
 * NextAuth.js configuration — Credentials provider (email + password).
 *
 * - DB-backed users via Prisma (PostgreSQL Neon).
 * - Waitlist gate: only ACTIVE users may sign in; WAITLISTED users see a
 *   "pending approval" error.
 * - Session strategy: JWT (stateless — works on Vercel serverless).
 * - Demo accounts (isDemo=true) get quick-login buttons in the UI.
 */
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();

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
        // All failure modes (no user, wrong password, disabled, waitlisted) → null.
        if (!user || !user.passwordHash) return null;
        if (!verifyPassword(credentials.password, user.passwordHash)) return null;
        if (user.status !== 'ACTIVE') return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
          status: user.status,
          isDemo: user.isDemo,
          tenantId: user.tenantId ?? undefined,
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
