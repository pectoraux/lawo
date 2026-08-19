'use client';

import { useEffect, useState } from 'react';
import { Package, Boxes, Loader2 } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { TruthBadge } from './TruthBadge';
import { getPackages, type PackagesResponse } from '@/lib/nomos-api';
import type { PackageCategory } from '@/kernel/primitives/types';
import { cn } from '@/lib/utils';

const CATEGORY_COLOR: Record<PackageCategory, string> = {
  JURISDICTION: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  DOMAIN: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  SITUATION: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  CAPABILITY: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
};

export function PackageRegistry() {
  const [data, setData] = useState<PackagesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getPackages();
        if (!cancelled) setData(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Boxes className="size-4 text-emerald-600" aria-hidden />
          Package Registry
        </CardTitle>
        <CardDescription className="text-xs">
          {data ? `${data.packages.length} packages loaded` : 'Loading package manifests…'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <Accordion type="multiple" defaultValue={[]} className="w-full">
              {data?.packages.map((p) => (
                <AccordionItem key={p.manifest.packageId} value={p.manifest.packageId}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex w-full flex-wrap items-center gap-2 pr-2 text-left">
                      <Package className="size-4 text-emerald-600" aria-hidden />
                      <span className="font-mono text-xs">{p.manifest.packageId}</span>
                      <span className="text-[10px] text-muted-foreground">v{p.manifest.version}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'px-1 py-0 text-[9px] uppercase tracking-wider',
                          CATEGORY_COLOR[p.manifest.category],
                        )}
                      >
                        {p.manifest.category}
                      </Badge>
                      <span className="ml-auto flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                        <span>{p.counts.rules}r</span>
                        <span>·{p.counts.situations}s</span>
                        <span>·{p.counts.procedures}p</span>
                        <span>·{p.counts.actions}a</span>
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 p-1 text-xs">
                      <p className="text-muted-foreground">{p.manifest.description}</p>

                      <div>
                        <div className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Dependencies
                        </div>
                        {p.manifest.dependencies.length === 0 ? (
                          <p className="text-muted-foreground">none (root)</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {p.manifest.dependencies.map((d) => (
                              <li key={d.packageId} className="font-mono text-[11px]">
                                {d.packageId}{' '}
                                <span className="text-muted-foreground">{d.versionRange}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div>
                        <div className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Supported Jurisdictions
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {p.jurisdictions.length === 0 ? (
                            <span className="text-muted-foreground">none</span>
                          ) : (
                            p.jurisdictions.map((j) => (
                              <span
                                key={j.id}
                                className="rounded border border-border bg-muted/40 px-1 py-0 font-mono text-[10px]"
                              >
                                {j.code}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Rules ({p.rules.length})
                        </div>
                        <ul className="space-y-1">
                          {p.rules.length === 0 ? (
                            <li className="text-muted-foreground">none</li>
                          ) : (
                            p.rules.map((r) => (
                              <li key={r.id} className="flex items-center gap-1.5">
                                <TruthBadge level={r.truthLevel} size="sm" />
                                <span className="font-mono text-[11px]">{r.code}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="truncate text-[11px]">{r.title}</span>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>

                      <div>
                        <div className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Actions ({p.actions.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {p.actions.length === 0 ? (
                            <span className="text-muted-foreground">none</span>
                          ) : (
                            p.actions.map((a) => (
                              <span
                                key={a.id}
                                className="rounded border border-border bg-muted/40 px-1 py-0 font-mono text-[10px]"
                              >
                                {a.code} ({a.kind})
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Verification
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          signedBy {p.manifest.verificationMetadata.signedBy} ·{' '}
                          {p.manifest.verificationMetadata.signedAt}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          hash: {p.manifest.verificationMetadata.hash.slice(0, 24)}…
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        )}
        {!loading && data && (
          <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="size-2.5" aria-hidden /> In-memory registry; immutable after publication (I10).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
