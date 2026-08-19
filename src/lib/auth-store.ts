/**
 * Nomos — auth store (Zustand + immer).
 * Manages: current session user, login/signup/waitlist/admin actions.
 * Uses next-auth/react's signIn/signOut for proper CSRF handling.
 */
'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { toast } from 'sonner';
import { signIn as nextAuthSignIn, signOut as nextAuthSignOut } from 'next-auth/react';

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: 'GUEST' | 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';
  status: 'WAITLISTED' | 'ACTIVE' | 'DISABLED';
  isDemo: boolean;
  tenantId: string | null;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  objective: string | null;
  requestedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'GUEST' | 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';
  status: 'WAITLISTED' | 'ACTIVE' | 'DISABLED';
  isDemo: boolean;
  tenantId: string | null;
  createdAt: string;
}

interface AuthStore {
  // --- state
  user: CurrentUser | null;
  loadingAuth: boolean;
  authError: string | null;
  signingIn: boolean;
  joining: boolean;

  // admin: waitlist
  pendingWaitlist: WaitlistEntry[];
  loadingWaitlist: boolean;
  approving: Record<string, boolean>;
  tempPassword: { entryId: string; email: string; password: string } | null;

  // admin: users
  users: AdminUser[];
  loadingUsers: boolean;

  // --- actions
  loadCurrentUser: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  joinWaitlist: (email: string, name?: string, objective?: string) => Promise<boolean>;
  loadPendingWaitlist: () => Promise<void>;
  approveEntry: (entryId: string, role?: 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN') => Promise<void>;
  rejectEntry: (entryId: string, notes?: string) => Promise<void>;
  loadUsers: () => Promise<void>;
  clearTempPassword: () => void;
}

export const useAuthStore = create<AuthStore>()(
  immer((set, get) => ({
    user: null,
    loadingAuth: true,
    authError: null,
    signingIn: false,
    joining: false,
    pendingWaitlist: [],
    loadingWaitlist: false,
    approving: {},
    tempPassword: null,
    users: [],
    loadingUsers: false,

    loadCurrentUser: async () => {
      set((s) => {
        s.loadingAuth = true;
      });
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        if (!res.ok) {
          set((s) => {
            s.user = null;
          });
          return;
        }
        const data = (await res.json()) as { user: CurrentUser | null };
        set((s) => {
          s.user = data.user;
          s.authError = null;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        set((s) => {
          s.authError = msg;
        });
      } finally {
        set((s) => {
          s.loadingAuth = false;
        });
      }
    },

    signIn: async (email, password) => {
      set((s) => {
        s.signingIn = true;
        s.authError = null;
      });
      try {
        // next-auth/react handles CSRF token fetch + cookie set automatically.
        const res = await nextAuthSignIn('credentials', {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
        });

        if (!res || res.error) {
          // All auth failures (invalid creds, waitlisted, disabled) look the same
          // to avoid leaking which emails are registered. The UI offers a
          // "Forgot password or waiting for approval?" affordance that points to
          // the waitlist form below.
          const msg = 'Invalid email or password. If you are waiting for approval, use the waitlist form below.';
          set((s) => {
            s.authError = msg;
          });
          return { ok: false, error: msg };
        }

        // Refresh the in-store user.
        await get().loadCurrentUser();
        const u = get().user;
        if (!u) {
          return { ok: false, error: 'Sign-in failed — session could not be established.' };
        }
        toast.success(`Signed in as ${u.email}`);
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        set((s) => {
          s.authError = msg;
        });
        return { ok: false, error: msg };
      } finally {
        set((s) => {
          s.signingIn = false;
        });
      }
    },

    signOut: async () => {
      try {
        await nextAuthSignOut({ redirect: false });
      } finally {
        set((s) => {
          s.user = null;
          s.pendingWaitlist = [];
          s.users = [];
        });
        toast.success('Signed out');
      }
    },

    joinWaitlist: async (email, name, objective) => {
      set((s) => {
        s.joining = true;
      });
      try {
        const res = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, objective }),
        });
        const data = (await res.json()) as { message?: string; error?: string; status?: string };
        if (!res.ok) {
          toast.error(data.error ?? 'Failed to join waitlist');
          return false;
        }
        toast.success(data.message ?? 'You are on the waitlist.');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error('Failed to join waitlist', { description: msg });
        return false;
      } finally {
        set((s) => {
          s.joining = false;
        });
      }
    },

    loadPendingWaitlist: async () => {
      set((s) => {
        s.loadingWaitlist = true;
      });
      try {
        const res = await fetch('/api/waitlist/pending', { cache: 'no-store' });
        if (!res.ok) {
          if (res.status === 403) {
            set((s) => {
              s.pendingWaitlist = [];
            });
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { pending: WaitlistEntry[] };
        set((s) => {
          s.pendingWaitlist = data.pending;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error('Failed to load waitlist', { description: msg });
      } finally {
        set((s) => {
          s.loadingWaitlist = false;
        });
      }
    },

    approveEntry: async (entryId, role) => {
      set((s) => {
        s.approving[entryId] = true;
      });
      try {
        const res = await fetch('/api/waitlist/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId, role }),
        });
        const data = (await res.json()) as {
          user?: { email: string };
          temporaryPassword?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        toast.success(`Account created for ${data.user?.email}`, {
          description: 'Temporary password shown below — deliver it to the user.',
        });
        if (data.temporaryPassword && data.user) {
          set((s) => {
            s.tempPassword = {
              entryId,
              email: data.user!.email,
              password: data.temporaryPassword!,
            };
          });
        }
        // Remove from the pending list (will be re-fetched next time)
        set((s) => {
          s.pendingWaitlist = s.pendingWaitlist.filter((p) => p.id !== entryId);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error('Approval failed', { description: msg });
      } finally {
        set((s) => {
          s.approving[entryId] = false;
        });
      }
    },

    rejectEntry: async (entryId, notes) => {
      try {
        const res = await fetch('/api/waitlist/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId, notes }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        toast.success('Entry rejected');
        set((s) => {
          s.pendingWaitlist = s.pendingWaitlist.filter((p) => p.id !== entryId);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error('Reject failed', { description: msg });
      }
    },

    loadUsers: async () => {
      set((s) => {
        s.loadingUsers = true;
      });
      try {
        const res = await fetch('/api/admin/users', { cache: 'no-store' });
        if (!res.ok) {
          if (res.status === 403) {
            set((s) => {
              s.users = [];
            });
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { users: AdminUser[] };
        set((s) => {
          s.users = data.users;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error('Failed to load users', { description: msg });
      } finally {
        set((s) => {
          s.loadingUsers = false;
        });
      }
    },

    clearTempPassword: () => {
      set((s) => {
        s.tempPassword = null;
      });
    },
  })),
);
