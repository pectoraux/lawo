/**
 * AuthGate — the authentication surface.
 *
 * When unauthenticated:
 *   - Email + password sign-in form
 *   - Quick demo-login buttons for each role (guest/user/operator/packager/admin)
 *   - "Join the waitlist" form (sign-up)
 *
 * When authenticated as admin:
 *   - Shows the WaitlistAdminPanel inline above the dashboard
 *
 * This component is rendered ABOVE the main dashboard in page.tsx, not as a
 * replacement — auth state is exposed to the parent via the auth store.
 */
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn, LogOut, UserPlus, Loader2, ShieldCheck, Clock, X,
  Check, AlertCircle, Sparkles, User as UserIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/lib/auth-store';
import { DEMO_ACCOUNTS } from '@/lib/auth/demoAccounts';
import { cn } from '@/lib/utils';

const ROLE_COLOR: Record<string, string> = {
  GUEST: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
  USER: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  OPERATOR: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
  PACKAGER: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  ADMIN: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
};

export function AuthGate() {
  const user = useAuthStore((s) => s.user);
  const loadingAuth = useAuthStore((s) => s.loadingAuth);
  const signOut = useAuthStore((s) => s.signOut);

  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> hydrating session…
      </div>
    );
  }

  if (!user) {
    return <UnauthenticatedView />;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
      <UserIcon className="size-3.5 text-emerald-600" aria-hidden />
      <span className="font-medium text-foreground">{user.name ?? user.email}</span>
      <Badge variant="outline" className={cn('px-1 py-0 text-[9px] uppercase tracking-wider', ROLE_COLOR[user.role])}>
        {user.role}
      </Badge>
      {user.isDemo && (
        <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 px-1 py-0 text-[9px] uppercase tracking-wider text-violet-700 dark:text-violet-300">
          demo
        </Badge>
      )}
      <span className="text-muted-foreground">·</span>
      <span className="font-mono text-[10px] text-muted-foreground">{user.email}</span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 gap-1 px-2 text-xs"
        onClick={() => void signOut()}
      >
        <LogOut className="size-3" />
        Sign out
      </Button>
    </div>
  );
}

function UnauthenticatedView() {
  const [view, setView] = useState<'signin' | 'waitlist'>('signin');

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-emerald-600" aria-hidden />
          Authentication required
        </CardTitle>
        <CardDescription className="text-xs">
          Nomos is an authenticated platform. Sign in with your account or join the waitlist to request access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setView('signin')}
            className={cn(
              'flex-1 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors',
              view === 'signin' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setView('waitlist')}
            className={cn(
              'flex-1 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors',
              view === 'waitlist' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Join waitlist
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {view === 'signin' ? <SignInForm /> : <WaitlistForm />}
          </motion.div>
        </AnimatePresence>

        <DemoLogins />
      </CardContent>
    </Card>
  );
}

function SignInForm() {
  const signIn = useAuthStore((s) => s.signIn);
  const signingIn = useAuthStore((s) => s.signingIn);
  const authError = useAuthStore((s) => s.authError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void signIn(email, password);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="signin-email" className="text-xs font-medium">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 text-sm"
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signin-password" className="text-xs font-medium">Password</Label>
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 text-sm"
          placeholder="••••••••"
        />
      </div>
      {authError && (
        <div className="flex items-start gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span>{authError}</span>
        </div>
      )}
      <Button type="submit" disabled={signingIn} className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600">
        {signingIn ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        {signingIn ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function WaitlistForm() {
  const joinWaitlist = useAuthStore((s) => s.joinWaitlist);
  const joining = useAuthStore((s) => s.joining);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="size-5 text-emerald-600" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">You are on the waitlist</p>
          <p className="text-xs text-muted-foreground">
            An administrator will review your request. When approved, you will receive an email with your temporary password.
          </p>
        </div>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => { setSubmitted(false); setEmail(''); setName(''); setObjective(''); }}>
          Submit another request
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await joinWaitlist(email, name, objective);
        if (ok) setSubmitted(true);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="wl-email" className="text-xs font-medium">Email <span className="text-rose-600">*</span></Label>
        <Input
          id="wl-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 text-sm"
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wl-name" className="text-xs font-medium">Name (optional)</Label>
        <Input
          id="wl-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 text-sm"
          placeholder="Your full name"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wl-objective" className="text-xs font-medium">What do you want to use Nomos for? (optional)</Label>
        <Input
          id="wl-objective"
          type="text"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          className="h-9 text-sm"
          placeholder="e.g. cross-border trade compliance"
        />
      </div>
      <Button type="submit" disabled={joining} className="w-full gap-2">
        {joining ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        {joining ? 'Submitting…' : 'Join the waitlist'}
      </Button>
      <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
        <Clock className="mt-0.5 size-3 shrink-0" />
        Your request is reviewed by an administrator. You will receive an email when your account is ready.
      </p>
    </form>
  );
}

function DemoLogins() {
  const signIn = useAuthStore((s) => s.signIn);
  const signingIn = useAuthStore((s) => s.signingIn);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="space-y-2 rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3 text-violet-600" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Demo quick-login
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Pre-provisioned accounts for each role. Click to sign in instantly.
      </p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {DEMO_ACCOUNTS.map((d) => (
          <button
            key={d.id}
            type="button"
            disabled={signingIn || busy !== null}
            onClick={async () => {
              setBusy(d.id);
              try {
                await signIn(d.email, d.password);
              } finally {
                setBusy(null);
              }
            }}
            className="group flex flex-col items-start gap-0.5 rounded-md border border-border bg-background p-2 text-left text-xs transition-all hover:border-violet-500/40 hover:bg-violet-500/5 disabled:opacity-50"
          >
            <div className="flex w-full items-center gap-1.5">
              <Badge variant="outline" className={cn('px-1 py-0 text-[9px] uppercase tracking-wider', ROLE_COLOR[d.role])}>
                {d.role}
              </Badge>
              {busy === d.id && <Loader2 className="ml-auto size-3 animate-spin text-muted-foreground" />}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{d.email}</span>
            <span className="text-[10px] text-muted-foreground">password: <span className="font-mono">{d.password}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Admin: Waitlist management panel
// =============================================================================

export function WaitlistAdminPanel() {
  const user = useAuthStore((s) => s.user);
  const pendingWaitlist = useAuthStore((s) => s.pendingWaitlist);
  const loadingWaitlist = useAuthStore((s) => s.loadingWaitlist);
  const loadPendingWaitlist = useAuthStore((s) => s.loadPendingWaitlist);
  const approving = useAuthStore((s) => s.approving);
  const approveEntry = useAuthStore((s) => s.approveEntry);
  const rejectEntry = useAuthStore((s) => s.rejectEntry);
  const tempPassword = useAuthStore((s) => s.tempPassword);
  const clearTempPassword = useAuthStore((s) => s.clearTempPassword);
  const [roleSelections, setRoleSelections] = useState<Record<string, 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN'>>({});

  useEffect(() => {
    if (user?.role === 'ADMIN' && user.status === 'ACTIVE') {
      void loadPendingWaitlist();
    }
  }, [user, loadPendingWaitlist]);

  if (user?.role !== 'ADMIN' || user.status !== 'ACTIVE') return null;

  return (
    <Card className="mb-4 border-rose-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 text-rose-600" aria-hidden />
          Admin — Waitlist ({pendingWaitlist.length} pending)
        </CardTitle>
        <CardDescription className="text-xs">
          Approve waitlist entries to create ACTIVE user accounts. A temporary password is generated and shown ONCE — deliver it to the user out-of-band.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tempPassword && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
            <div className="flex-1 space-y-1">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">Account created</p>
              <p className="font-mono text-[11px]">
                email: <span className="font-semibold">{tempPassword.email}</span>
              </p>
              <p className="font-mono text-[11px]">
                temporary password: <span className="rounded bg-background px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">{tempPassword.password}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">Copy this password now — it will not be shown again.</p>
            </div>
            <Button variant="ghost" size="icon" className="size-6" onClick={clearTempPassword}>
              <X className="size-3" />
            </Button>
          </div>
        )}

        {loadingWaitlist ? (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Loading waitlist…
          </div>
        ) : pendingWaitlist.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No pending waitlist entries. New sign-ups will appear here.
          </div>
        ) : (
          <div className="space-y-2">
            {pendingWaitlist.map((entry) => {
              const role = roleSelections[entry.id] ?? 'USER';
              return (
                <div
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-md border border-border bg-card p-2.5 sm:flex-row sm:items-center"
                >
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{entry.email}</span>
                      {entry.name && <span className="text-xs text-muted-foreground">· {entry.name}</span>}
                    </div>
                    {entry.objective && (
                      <p className="text-[11px] text-muted-foreground">{entry.objective}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Requested {new Date(entry.requestedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={role}
                      onValueChange={(v) => setRoleSelections((prev) => ({ ...prev, [entry.id]: v as 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN' }))}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USER" className="text-xs">USER</SelectItem>
                        <SelectItem value="OPERATOR" className="text-xs">OPERATOR</SelectItem>
                        <SelectItem value="PACKAGER" className="text-xs">PACKAGER</SelectItem>
                        <SelectItem value="ADMIN" className="text-xs">ADMIN</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8 gap-1 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                      disabled={approving[entry.id]}
                      onClick={() => void approveEntry(entry.id, role)}
                    >
                      {approving[entry.id] ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-rose-600 hover:bg-rose-500/10"
                      onClick={() => void rejectEntry(entry.id)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
