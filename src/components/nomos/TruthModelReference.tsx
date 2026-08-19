'use client';

import { Layers3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TRUTH_BADGE, TRUTH_LABEL, TRUTH_DESCRIPTION } from '@/kernel/truth/truth';
import { TRUTH_LEVELS } from '@/kernel/truth/truth';
import { cn } from '@/lib/utils';

/**
 * TruthModelReference — read-only 2-column grid of T0–T5 reference cards.
 */
export function TruthModelReference() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Layers3 className="size-4 text-amber-600" aria-hidden />
          Truth / Confidence Model
        </CardTitle>
        <CardDescription className="text-xs">
          T0–T5 — preserved end-to-end (storage → reasoning → UI → audit). I8: weaker wins.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TRUTH_LEVELS.map((code) => {
            const palette = TRUTH_BADGE[code];
            return (
              <div
                key={code}
                className={cn(
                  'flex flex-col gap-0.5 rounded-md border p-2',
                  palette.bg,
                  palette.border,
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('inline-block size-2 shrink-0 rounded-full', palette.dot)} aria-hidden />
                  <span className={cn('shrink-0 font-mono text-sm font-bold', palette.text)}>{code}</span>
                  <span className={cn('min-w-0 flex-1 break-words text-xs font-medium', palette.text)}>
                    {TRUTH_LABEL[code]}
                  </span>
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  {TRUTH_DESCRIPTION[code]}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Authoritative: <span className="font-mono text-emerald-700 dark:text-emerald-300">T0/T1</span> ·
          Interpretive: <span className="font-mono text-amber-700 dark:text-amber-300">T2/T3</span> ·
          Community: <span className="font-mono text-zinc-700 dark:text-zinc-300">T4</span> ·
          Predictive: <span className="font-mono text-rose-700 dark:text-rose-300">T5</span> (never a fact — I8).
        </p>
      </CardContent>
    </Card>
  );
}
