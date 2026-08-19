'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { History, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { AuditEvent } from '@/kernel/primitives/types';
import { getAudit } from '@/lib/nomos-api';
import { cn } from '@/lib/utils';

const SEVERITY_COLOR: Record<AuditEvent['severity'], string> = {
  INFO: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  WARN: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  ERROR: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  CRITICAL: 'bg-rose-600/20 text-rose-800 dark:text-rose-200 border-rose-600/40',
};

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString();
  } catch {
    return iso.slice(11, 19);
  }
}

export function AuditTrail() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await getAudit(50);
      setEvents(r.events);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="size-4 text-zinc-600" aria-hidden />
              Audit Trail
            </CardTitle>
            <CardDescription className="text-xs">
              {events.length} recent events · auto-refreshes every 30s
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => void refresh()}
            aria-label="Refresh audit trail"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && events.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="space-y-1.5">
              {events.length === 0 ? (
                <li className="rounded border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">
                  No audit events yet. Run an evaluation to generate one.
                </li>
              ) : (
                events.map((e, i) => (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                    className="flex items-start gap-2 rounded border border-border bg-card p-1.5 text-[11px]"
                  >
                    <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {fmtTime(e.timestamp)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn('px-1 py-0 text-[9px] font-bold', SEVERITY_COLOR[e.severity])}
                    >
                      {e.severity}
                    </Badge>
                    <div className="flex-1">
                      <div className="font-medium">{e.action}</div>
                      <div className="text-[10px] text-muted-foreground">
                        actor: <span className="font-mono">{e.actor}</span>
                        {e.subjectId && (
                          <>
                            {' · subject: '}
                            <span className="font-mono">{e.subjectId}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.li>
                ))
              )}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
