/**
 * Server-side auth helpers (NextAuth v4 + App Router).
 * `getServerSession` is async and reads the JWT from the request cookies.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from './authOptions';

export async function getSession() {
  return getServerSession(authOptions);
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>['user'];

/** True if the current session is an ACTIVE admin. */
export async function requireAdmin() {
  const session = await getSession();
  if (!session?.user) return null;
  if (session.user.role !== 'ADMIN' || session.user.status !== 'ACTIVE') return null;
  return session.user;
}

/** True if the current session is an ACTIVE user (any role). */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user || session.user.status !== 'ACTIVE') return null;
  return session.user;
}
