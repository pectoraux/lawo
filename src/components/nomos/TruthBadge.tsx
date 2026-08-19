'use client';

import { TRUTH_BADGE, TRUTH_LABEL, TRUTH_DESCRIPTION } from '@/kernel/truth/truth';
import type { TruthLevel } from '@/kernel/primitives/types';
import { cn } from '@/lib/utils';

interface Props {
  level: TruthLevel;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Show the long-form description (size lg only). */
  withDescription?: boolean;
}

/**
 * TruthBadge — small colored badge visualising a TruthLevel (T0–T5).
 * Uses the FROZEN TRUTH_BADGE color tokens (emerald/amber/zinc/rose).
 */
export function TruthBadge({ level, size = 'sm', className, withDescription = false }: Props) {
  const palette = TRUTH_BADGE[level];
  const label = TRUTH_LABEL[level];

  if (size === 'lg') {
    return (
      <div
        className={cn(
          'inline-flex flex-col gap-0.5 rounded-lg border px-3 py-2',
          palette.bg,
          palette.border,
          className,
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className={cn('inline-block size-2 rounded-full', palette.dot)} aria-hidden />
          <span className={cn('text-sm font-semibold tabular-nums', palette.text)}>{level}</span>
          <span className={cn('text-sm font-medium', palette.text)}>{label}</span>
        </div>
        {withDescription && (
          <p className="text-xs text-muted-foreground">{TRUTH_DESCRIPTION[level]}</p>
        )}
      </div>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        size === 'md' ? 'px-2.5 py-1 text-sm' : '',
        palette.bg,
        palette.border,
        palette.text,
        className,
      )}
      title={`${level} — ${label}: ${TRUTH_DESCRIPTION[level]}`}
    >
      <span className={cn('inline-block size-1.5 rounded-full', palette.dot)} aria-hidden />
      <span className="tabular-nums">{level}</span>
      {size === 'md' && <span className="opacity-80">{label}</span>}
    </span>
  );
}
