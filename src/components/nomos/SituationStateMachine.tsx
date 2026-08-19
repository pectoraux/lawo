'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Situation } from '@/kernel/primitives/types';
import { cn } from '@/lib/utils';

interface Props {
  situation: Situation | null;
  currentState?: string;
  /** Comma-separated list of state ids the engine considers "evaluating against" */
  highlightStates?: string[];
  className?: string;
}

const FALLBACK_STATES = [
  { id: 'APPROACH', label: 'Approach' },
  { id: 'ORIGIN_EXIT', label: 'Origin Exit' },
  { id: 'TRANSITION', label: 'Transition' },
  { id: 'DESTINATION_ENTRY', label: 'Destination Entry' },
  { id: 'CUSTOMS', label: 'Customs' },
  { id: 'COMPLETION', label: 'Completion' },
];

/**
 * SituationStateMachine — horizontal flow of the 6 border-crossing states
 * with the current/evaluating state highlighted in emerald (Framer Motion
 * pulse). Falls back to the canonical 6-state flow if the situation pack
 * is unavailable.
 */
export function SituationStateMachine({
  situation,
  currentState,
  highlightStates,
  className,
}: Props) {
  const states = situation?.states?.length ? situation.states : FALLBACK_STATES;
  const highlight = new Set(highlightStates ?? (currentState ? [currentState] : []));

  return (
    <div
      className={cn(
        'flex w-full items-stretch gap-1 overflow-x-auto pb-1',
        className,
      )}
      role="list"
      aria-label="Situation state machine"
    >
      {states.map((st, idx) => {
        const active = highlight.has(st.id);
        const terminal = (st as { isTerminal?: boolean }).isTerminal === true;
        return (
          <div key={st.id} className="flex items-stretch gap-1" role="listitem">
            <motion.div
              initial={false}
              animate={
                active
                  ? { scale: 1.04, boxShadow: '0 0 0 2px rgba(16,185,129,0.55)' }
                  : { scale: 1, boxShadow: '0 0 0 0 rgba(16,185,129,0)' }
              }
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className={cn(
                'flex min-w-[88px] flex-col gap-0.5 rounded-md border px-2.5 py-1.5',
                active
                  ? 'border-emerald-500/60 bg-emerald-500/15'
                  : terminal
                    ? 'border-zinc-300/60 bg-zinc-100 dark:border-zinc-700/60 dark:bg-zinc-800/50'
                    : 'border-border bg-card',
              )}
            >
              <span
                className={cn(
                  'font-mono text-[10px] uppercase tracking-wider',
                  active ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground',
                )}
              >
                {st.id}
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium leading-tight',
                  active ? 'text-emerald-900 dark:text-emerald-100' : 'text-foreground',
                )}
              >
                {st.label}
              </span>
              {terminal && (
                <span className="mt-0.5 text-[9px] uppercase text-muted-foreground">terminal</span>
              )}
            </motion.div>
            {idx < states.length - 1 && (
              <ArrowRight
                className="mt-3 size-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
