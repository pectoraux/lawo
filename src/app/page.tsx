'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Scale, Snowflake, Sparkles, Zap, Ban, AlertTriangle, Lock,
} from 'lucide-react';
import { useNomosStore } from '@/lib/nomos-store';
import { useAuthStore } from '@/lib/auth-store';
import { AuthGate, WaitlistAdminPanel } from '@/components/nomos/AuthGate';
import { ThemeToggle } from '@/components/nomos/ThemeToggle';
import { TruthBadge } from '@/components/nomos/TruthBadge';
import { ContextBuilder } from '@/components/nomos/ContextBuilder';
import { DecisionResult } from '@/components/nomos/DecisionResult';
import { PackageRegistry } from '@/components/nomos/PackageRegistry';
import { JurisdictionGraphPanel } from '@/components/nomos/JurisdictionGraphPanel';
import { TruthModelReference } from '@/components/nomos/TruthModelReference';
import { AuditTrail } from '@/components/nomos/AuditTrail';
import { InvariantsReference } from '@/components/nomos/InvariantsReference';
import { PlanesOverview } from '@/components/nomos/PlanesOverview';
import type { TruthLevel } from '@/kernel/primitives/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const TRUTH_DOT_LIST: { level: TruthLevel; label: string }[] = [
  { level: 'T0', label: 'Authoritative' },
  { level: 'T1', label: 'Derived' },
  { level: 'T2', label: 'Established interp.' },
  { level: 'T3', label: 'Expert interp.' },
  { level: 'T4', label: 'Community' },
  { level: 'T5', label: 'Prediction' },
];

export default function Page() {
  const init = useNomosStore((s) => s.init);
  const initialized = useNomosStore((s) => s.initialized);
  const loading = useNomosStore((s) => s.loading);
  const presets = useNomosStore((s) => s.presets);
  const applyPreset = useNomosStore((s) => s.applyPreset);
  const user = useAuthStore((s) => s.user);
  const loadingAuth = useAuthStore((s) => s.loadingAuth);

  useEffect(() => {
    // Only load the dashboard data once the user is authenticated.
    if (user && !initialized) {
      void init();
    }
  }, [init, initialized, user]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Scale className="size-6 text-emerald-600" aria-hidden />
            <div>
              <h1 className="font-bold tracking-tight text-base leading-none sm:text-lg">
                NOMOS
              </h1>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                Universal Rules-and-Reality Operating System
              </p>
            </div>
          </div>
          {/* Truth-level legend */}
          <nav
            aria-label="Truth level legend"
            className="hidden flex-1 items-center gap-2 overflow-x-auto md:flex"
          >
            <span className="sr-only">Truth levels T0 through T5</span>
            {TRUTH_DOT_LIST.map((t) => (
              <TruthBadge key={t.level} level={t.level} size="sm" />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300',
              )}
              title="The kernel primitives and engine contracts are frozen — change requires an ACO (I15)."
            >
              <Snowflake className="size-3" aria-hidden />
              Kernel: Frozen
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">
        {/* Authentication gate — sign in / join waitlist / demo logins */}
        <AuthGate />

        {/* When unauthenticated, show a public preview above the footer */}
        {!user && !loadingAuth ? (
          <section aria-label="Public preview" className="mt-6">
            <PublicPreview />
          </section>
        ) : null}

        {/* When authenticated, show admin panel (if admin) + full dashboard */}
        {user ? (
          <>
            <WaitlistAdminPanel />

            {/* Quick-start presets */}
            <section aria-label="Demo presets" className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Quick-start demo presets</h2>
                <span className="text-[10px] text-muted-foreground">
                  Each preset is a self-contained ContextRequest — clicking loads & evaluates.
                </span>
              </div>
              {loading && !presets ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {presets?.map((p, i) => (
                    <motion.button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.05 }}
                      className="group flex flex-col items-start gap-1 rounded-md border border-border bg-card p-3 text-left transition-all hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      aria-label={`Apply preset ${p.label}`}
                    >
                      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        <Sparkles className="size-3" aria-hidden />
                        Preset
                      </span>
                      <span className="text-xs font-semibold leading-tight">{p.label}</span>
                      <span className="line-clamp-2 text-[10px] text-muted-foreground">{p.description}</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </section>

            {/* Workspace — 3-column responsive grid */}
            <section
              aria-label="Decision workspace"
              className="grid grid-cols-1 gap-4 lg:grid-cols-12"
            >
              <div className="min-w-0 lg:col-span-4">
                <ContextBuilder />
              </div>
              <div className="min-w-0 lg:col-span-5">
                <DecisionResult />
              </div>
              <aside className="flex min-w-0 flex-col gap-4 lg:col-span-3" aria-label="Architecture transparency">
                <PackageRegistry />
                <JurisdictionGraphPanel />
                <TruthModelReference />
                <AuditTrail />
              </aside>
            </section>

            {/* Below — invariants + planes */}
            <section aria-label="Architecture reference" className="mt-6 space-y-4">
              <InvariantsReference />
              <PlanesOverview />
            </section>
          </>
        ) : null}
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t border-border bg-background/95">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Scale className="size-3 text-emerald-600" aria-hidden />
              <span className="font-semibold text-foreground">Nomos</span>
              <span>— Universal Rules-and-Reality Operating System</span>
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono">v0.1.0</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                <Snowflake className="size-2.5" aria-hidden />
                Architecture: Frozen
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
                <Zap className="size-2.5" aria-hidden />
                change requires an ACO
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] text-teal-700 dark:text-teal-300">
                <AlertTriangle className="size-2.5" aria-hidden />
                {user ? `signed in: ${user.email}` : 'not signed in'}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            <Ban className="mr-1 inline size-2.5" aria-hidden />
            Kernel: domain-agnostic (I1) · LLM: non-authoritative (I5) · Provenance: on every decision (I6)
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * PublicPreview — shown when unauthenticated. Renders a read-only overview of
 * the architecture so visitors can see what the platform is before signing in.
 */
function PublicPreview() {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
          <Lock className="size-6 text-emerald-600" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold">Sign in to access the platform</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Nomos is an authenticated rules-and-reality operating system. Use a demo account above for instant access, or join the waitlist to request a real account.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Frozen Kernel', body: 'Domain-agnostic primitives — entities, facts, jurisdictions, rules, evidence, decisions. I1: never vertical-coupled.', color: 'border-emerald-500/30 bg-emerald-500/5' },
          { title: 'Deterministic Rule Engine', body: 'RuleIR + ConditionNode trees. LLMs never authoritative (I5). Provenance on every decision (I6).', color: 'border-amber-500/30 bg-amber-500/5' },
          { title: 'Truth/Confidence Model', body: 'T0–T5 preserved end-to-end: storage → reasoning → UI → audit. Community (T4) never masquerades as authority (I8).', color: 'border-rose-500/30 bg-rose-500/5' },
          { title: 'Composable Packages', body: 'Jurisdiction + Domain + Situation + Capability packs. Add a country, treaty, or vertical WITHOUT touching the kernel.', color: 'border-violet-500/30 bg-violet-500/5' },
        ].map((c) => (
          <div key={c.title} className={cn('rounded-md border p-3', c.color)}>
            <h3 className="text-sm font-semibold">{c.title}</h3>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
