/**
 * AuthBootstrap — fires `loadCurrentUser` once on mount. Renders nothing.
 * Ensures the auth store is hydrated before any route shows auth-gated UI.
 */
'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';

export function AuthBootstrap() {
  const loadCurrentUser = useAuthStore((s) => s.loadCurrentUser);
  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);
  return null;
}
