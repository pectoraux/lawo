/**
 * /api/auth/[...nextauth] — NextAuth.js catch-all route handler.
 */
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
