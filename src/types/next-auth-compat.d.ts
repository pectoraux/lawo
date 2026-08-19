/**
 * NextAuth v4 + TypeScript 5 + moduleResolution "bundler" compatibility shim.
 *
 * With `moduleResolution: "bundler"`, TypeScript resolves `next-auth`'s CJS
 * exports incorrectly — `NextAuthOptions`, `getServerSession`, and the default
 * callable export are not recognized. This declaration re-exports them so the
 * typechecker passes. The runtime works correctly (NextAuth v4 is CJS-compatible
 * via esModuleInterop); this is purely a type-resolution issue.
 */
declare module 'next-auth' {
  export interface NextAuthOptions {
    providers: unknown[];
    session?: { strategy?: string; maxAge?: number };
    pages?: { signIn?: string; error?: string };
    callbacks?: Record<string, (...args: unknown[]) => unknown>;
    secret?: string;
    [key: string]: unknown;
  }

  export interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      status: string;
      isDemo: boolean;
      tenantId?: string;
    };
  }

  export interface JWT {
    id: string;
    role: string;
    status: string;
    isDemo: boolean;
    tenantId?: string;
    [key: string]: unknown;
  }

  export function getServerSession(options: NextAuthOptions): Promise<Session | null>;

  const NextAuth: (options: NextAuthOptions) => {
    GET: (req: unknown) => unknown;
    POST: (req: unknown) => unknown;
  };
  export default NextAuth;
}

declare module 'next-auth/jwt' {
  export interface JWT {
    id: string;
    role: string;
    status: string;
    isDemo: boolean;
    tenantId?: string;
    [key: string]: unknown;
  }
}
