'use client';

import type { RuleEffect, EffectKind } from '@/kernel/primitives/types';
import { cn } from '@/lib/utils';

interface Props {
  effect: Pick<RuleEffect, 'kind' | 'code' | 'label' | 'detail' | 'amount'>;
  className?: string;
  showAmount?: boolean;
}

/**
 * EffectBadge — colored by EffectKind. NOTE: violet (not indigo/blue) for OPTION.
 */
const PALETTE: Record<EffectKind, { bg: string; text: string; border: string; dot: string }> = {
  RIGHT: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  PERMISSION: {
    bg: 'bg-teal-500/15',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-500/30',
    dot: 'bg-teal-500',
  },
  OBLIGATION: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500',
  },
  RESTRICTION: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/30',
    dot: 'bg-rose-500',
  },
  FEE: {
    bg: 'bg-zinc-500/15',
    text: 'text-zinc-700 dark:text-zinc-300',
    border: 'border-zinc-500/30',
    dot: 'bg-zinc-500',
  },
  OPTION: {
    bg: 'bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/30',
    dot: 'bg-violet-500',
  },
  CONSEQUENCE: {
    bg: 'bg-orange-500/15',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-500/30',
    dot: 'bg-orange-500',
  },
};

export function EffectBadge({ effect, className, showAmount = true }: Props) {
  const p = PALETTE[effect.kind];
  return (
    <span
      className={cn(
        'inline-flex flex-col gap-0.5 rounded-md border px-2 py-1',
        p.bg,
        p.border,
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn('inline-block size-1.5 rounded-full', p.dot)} aria-hidden />
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', p.text)}>
          {effect.kind}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{effect.code}</span>
      </span>
      <span className="text-xs font-medium leading-tight">{effect.label}</span>
      {showAmount && effect.amount && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {effect.amount.value.toLocaleString()} {effect.amount.currency}
          {effect.amount.basis ? ` · ${effect.amount.basis}` : ''}
        </span>
      )}
      {effect.detail && (
        <span className="text-[11px] text-muted-foreground leading-snug">{effect.detail}</span>
      )}
    </span>
  );
}
