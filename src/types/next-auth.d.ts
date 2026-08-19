/**
 * NextAuth type augmentation — add `role`, `status`, `isDemo`, `tenantId` to the
 * session user and JWT token.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: 'GUEST' | 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';
      status: 'WAITLISTED' | 'ACTIVE' | 'DISABLED';
      isDemo: boolean;
      tenantId?: string;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    role: 'GUEST' | 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';
    status: 'WAITLISTED' | 'ACTIVE' | 'DISABLED';
    isDemo: boolean;
    tenantId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'GUEST' | 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';
    status: 'WAITLISTED' | 'ACTIVE' | 'DISABLED';
    isDemo: boolean;
    tenantId?: string;
  }
}
