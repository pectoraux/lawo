'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Coins,
  Sparkles,
  ListChecks,
  GitBranch,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { TruthBadge } from './TruthBadge';
import { EffectBadge } from './EffectBadge';
import { SituationStateMachine } from './SituationStateMachine';
import { ProvenanceTree } from './ProvenanceTree';
import { useNomosStore } from '@/lib/nomos-store';
import type { EffectKind, FiredEffect } from '@/kernel/primitives/types';
import { cn } from '@/lib/utils';

const KIND_META: Record<EffectKind, { label: string; color: string; icon: React.ReactNode }> = {
  RIGHT: { label: 'Rights', color: 'emerald', icon: <ShieldCheck className="size-3.5" /> },
  PERMISSION: { label: 'Permissions', color: 'teal', icon: <Sparkles className="size-3.5" /> },
  OBLIGATION: { label: 'Obligations', color: 'amber', icon: <CheckCircle2 className="size-3.5" /> },
  RESTRICTION: { label: 'Restrictions', color: 'rose', icon: <AlertTriangle className="size-3.5" /> },
  FEE: { label: 'Fees', color: 'zinc', icon: <Coins className="size-3.5" /> },
  OPTION: { label: 'Options', color: 'violet', icon: <ListChecks className="size-3.5" /> },
  CONSEQUENCE: { label: 'Consequences', color: 'orange', icon: <AlertTriangle className="size-3.5" /> },
};

const KIND_CARD_COLOR: Record<EffectKind, string> = {
  RIGHT: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  PERMISSION: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  OBLIGATION: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  RESTRICTION: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  FEE: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  OPTION: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  CONSEQUENCE: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
};

function bucketEffects(fired: FiredEffect[]): Record<EffectKind, FiredEffect[]> {
  const out: Record<EffectKind, FiredEffect[]> = {
    RIGHT: [],
    PERMISSION: [],
    OBLIGATION: [],
    RESTRICTION: [],
    FEE: [],
    OPTION: [],
    CONSEQUENCE: [],
  };
  for (const fe of fired) {
    out[fe.effect.kind].push(fe);
  }
  return out;
}

function Empty() {
  return (
    <Card className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
      <CardContent className="flex flex-col items-center gap-3">
        <div className="rounded-full bg-emerald-500/10 p-3">
          <GitBranch className="size-6 text-emerald-600" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium">No decision computed yet</p>
          <p className="text-xs text-muted-foreground">
            Run an evaluation to compute the state snapshot — fired effects, obligations, restrictions, and
            full provenance will appear here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DecisionResult() {
  const decision = useNomosStore((s) => s.decision);
  const evaluating = useNomosStore((s) => s.evaluating);
  const situation = useNomosStore((s) =>
    s.orient?.situations.find((x) => x.id === s.decision?.state.situationId) ?? null,
  );
  const [expandedKind, setExpandedKind] = useState<EffectKind | null>(null);

  const buckets = useMemo(
    () => (decision ? bucketEffects(decision.state.firedEffects) : null),
    [decision],
  );

  if (evaluating && !decision) {
    return (
      <Card className="flex h-full min-h-[280px] flex-col gap-3">
        <CardHeader>
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!decision) return <Empty />;

  const { state } = decision;
  const firedCount = state.firedEffects.length;
  const jurisdictions = state.jurisdictionIds;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex h-full flex-col gap-4"
    >
      {/* Top state snapshot card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                State Snapshot
                <TruthBadge level={state.truthLevel} size="md" />
              </CardTitle>
              <CardDescription className="font-mono text-[11px]">
                situation {state.situationId} · subject {state.subjectId}
              </CardDescription>
            </div>
            <div className="text-right text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="size-3" />
                computedAt: {state.computedAt}
              </div>
              <div>as_of: {state.asOf}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {jurisdictions.map((jid) => (
              <span
                key={jid}
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
              >
                {jid}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="font-mono text-lg font-semibold tabular-nums">
                {state.applicableRules.length}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                applicable rules
              </div>
            </div>
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2">
              <div className="font-mono text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {firedCount}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                fired effects
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="font-mono text-lg font-semibold tabular-nums">
                {decision.provenance.length}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                provenance entries
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* State machine strip */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Situation State Machine</CardTitle>
          <CardDescription className="text-xs">
            Border-crossing flow — terminal state targeted by current evaluation is highlighted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SituationStateMachine
            situation={situation}
            highlightStates={['CUSTOMS', 'COMPLETION']}
          />
        </CardContent>
      </Card>

      {/* Effects grid */}
      {buckets && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fired Effects</CardTitle>
            <CardDescription className="text-xs">
              Click a bucket to expand its details. Empty buckets show 0.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {(Object.keys(KIND_META) as EffectKind[])
                .filter((k) => k !== 'CONSEQUENCE')
                .map((kind) => {
                  const items = buckets[kind];
                  const meta = KIND_META[kind];
                  const isExpanded = expandedKind === kind;
                  const hasItems = items.length > 0;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setExpandedKind(isExpanded ? null : kind)}
                      disabled={!hasItems}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-center transition-all',
                        hasItems ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50',
                        isExpanded ? KIND_CARD_COLOR[kind] : 'border-border bg-card',
                      )}
                      aria-pressed={isExpanded}
                    >
                      <span className={cn('text-muted-foreground', isExpanded && 'opacity-90')}>
                        {meta.icon}
                      </span>
                      <span
                        className={cn(
                          'font-mono text-xl font-bold tabular-nums',
                          isExpanded ? '' : 'text-foreground',
                        )}
                      >
                        {items.length}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wider">
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
            </div>
            {expandedKind && buckets[expandedKind] && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-1.5 border-t border-border pt-2"
              >
                {buckets[expandedKind].map((fe, i) => (
                  <div key={`${fe.ruleId}-${fe.effect.code}-${i}`} className="flex items-start gap-2">
                    <TruthBadge level={fe.truthLevel} size="sm" />
                    <EffectBadge effect={fe.effect} className="flex-1" />
                  </div>
                ))}
              </motion.div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Obligations + Rights + Permissions + Restrictions summary list */}
      {(state.obligations.length > 0 ||
        state.rights.length > 0 ||
        state.permissions.length > 0 ||
        state.restrictions.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Buckets</CardTitle>
            <CardDescription className="text-xs">
              The state's high-level bucketed outcome.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BucketBlock title="Obligations" items={state.obligations.map((o) => `${o.label}${o.dueBy ? ` · due ${o.dueBy}` : ''}`)} color="amber" />
            <BucketBlock title="Rights" items={state.rights.map((r) => r.label)} color="emerald" />
            <BucketBlock title="Permissions" items={state.permissions.map((p) => p.label)} color="teal" />
            <BucketBlock title="Restrictions" items={state.restrictions.map((r) => r.label)} color="rose" />
          </CardContent>
        </Card>
      )}

      {/* Options / Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lock className="size-3.5 text-amber-600" />
            Available Options &amp; Actions
          </CardTitle>
          <CardDescription className="text-xs">
            Precondition-gated actions from the situation pack.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.options.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No available options for this state. The action preconditions are not met.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {state.options.map((opt) => (
                <li
                  key={opt.id}
                  className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-700 dark:text-violet-300">
                      OPTION
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{opt.code}</span>
                    <span className="text-xs font-medium">{opt.label}</span>
                    {opt.actionId && (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        action: {opt.actionId}
                      </span>
                    )}
                  </div>
                  {opt.detail && <p className="text-[11px] text-muted-foreground">{opt.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Provenance tree */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <GitBranch className="size-3.5 text-emerald-600" />
            Provenance Tree
          </CardTitle>
          <CardDescription className="text-xs">
            DECISION → RULE → SOURCE → AUTHORITY → FACTS → EVIDENCE → CALCULATION → ASSUMPTIONS.
            Every material decision carries provenance (I6).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProvenanceTree provenance={decision.provenance} />
        </CardContent>
      </Card>
    </motion.div>
  );
}

function BucketBlock({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: 'amber' | 'emerald' | 'teal' | 'rose';
}) {
  const colorClass = {
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
    teal: 'border-teal-500/30 bg-teal-500/5 text-teal-700 dark:text-teal-300',
    rose: 'border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300',
  }[color];
  return (
    <div className={cn('rounded-md border p-2', colorClass)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wider">{title}</span>
        <span className="font-mono text-sm">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-1 text-[11px] opacity-60">none</p>
      ) : (
        <ScrollArea className="mt-1 max-h-24">
          <ul className="space-y-0.5 text-[11px]">
            {items.map((it, i) => (
              <li key={i} className="leading-tight">
                · {it}
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
