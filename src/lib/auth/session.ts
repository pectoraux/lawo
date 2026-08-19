/**
 * Server-side auth helpers (NextAuth v4 + App Router).
 * `getServerSession` is async and reads the JWT from the request cookies.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from './authOptions';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: 'GUEST' | 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';
  status: 'WAITLISTED' | 'ACTIVE' | 'DISABLED';
  isDemo: boolean;
  tenantId: string | null;
}

export async function getSession(): Promise<{ user: SessionUser } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return { user: session.user as unknown as SessionUser };
}

/** Returns the admin SessionUser if the current session is an ACTIVE admin, else null. */
export async function requireAdmin(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session?.user) return null;
  if (session.user.role !== 'ADMIN' || session.user.status !== 'ACTIVE') return null;
  return session.user;
}

/** Returns the SessionUser if the current session is an ACTIVE user (any role), else null. */
export async function requireUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session?.user || session.user.status !== 'ACTIVE') return null;
  return session.user;
}
