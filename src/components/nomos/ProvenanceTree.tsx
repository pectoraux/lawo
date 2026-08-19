'use client';

import { motion } from 'framer-motion';
import { FileText, Link2, Calculator, Flag, Scale, BookOpen } from 'lucide-react';
import type { Provenance } from '@/kernel/primitives/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TruthBadge } from './TruthBadge';
import { cn } from '@/lib/utils';

interface Props {
  provenance: Provenance[];
  className?: string;
}

function fmt(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function TreeNode({
  icon,
  label,
  children,
  mono,
  className,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  children?: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className="ml-2 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700/80">
      <div className={cn('flex items-center gap-1.5 text-xs', className)}>
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className={cn(mono && 'font-mono text-[11px]', 'ml-1')}>{children}</div>
    </div>
  );
}

function Leaf({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="ml-2 border-l border-zinc-200 pl-2 dark:border-zinc-700/60">
      <div className={cn(mono && 'font-mono', 'text-[11px]')}>{children}</div>
    </div>
  );
}

/**
 * ProvenanceTree — visualization of the DECISION → RULE → SOURCE → AUTHORITY
 * → FACTS → EVIDENCE → CALCULATION → ASSUMPTIONS chain. Designed to be
 * readable at a glance with monospace IDs and truth-level badges inline.
 */
export function ProvenanceTree({ provenance, className }: Props) {
  if (!provenance || provenance.length === 0) {
    return (
      <div className={cn('text-xs text-muted-foreground', className)}>
        No provenance entries — no rule fired (the state is authoritative-empty: T0).
      </div>
    );
  }
  return (
    <ScrollArea className={cn('max-h-96 rounded-md', className)}>
      <div className="space-y-3">
        {provenance.map((p, i) => (
          <motion.div
            key={`${p.decisionId}-${p.ruleId}-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05 }}
            className="rounded-md border border-border bg-card p-3"
          >
            {/* Rule line */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Scale className="size-4 text-emerald-600" aria-hidden />
              <span className="font-mono text-xs text-muted-foreground">RULE</span>
              <span className="font-mono text-xs font-semibold">{p.ruleId}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                v{p.ruleVersion}
              </span>
              <TruthBadge level={p.truthLevel} size="sm" />
              <span className="font-mono text-[10px] text-muted-foreground">
                · decision {p.decisionId.slice(0, 8)}
              </span>
            </div>

            <div className="mt-2 space-y-2">
              {/* Authority */}
              <TreeNode
                icon={<Flag className="size-3" />}
                label="Authority"
                className="text-amber-700 dark:text-amber-300"
              >
                <span className="font-medium">{p.authority.name}</span>{' '}
                <span className="font-mono text-[10px] text-muted-foreground">
                  ({p.authority.authorityId} · jur {p.authority.jurisdictionId})
                </span>
              </TreeNode>

              {/* Source */}
              <TreeNode
                icon={<BookOpen className="size-3" />}
                label="Source"
                className="text-amber-700 dark:text-amber-300"
              >
                <span className="font-medium">{p.source.citation}</span>{' '}
                <span className="font-mono text-[10px] text-muted-foreground">
                  ({p.source.sourceId})
                </span>
                {p.source.url && (
                  <a
                    href={p.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 inline-flex items-center gap-0.5 text-teal-600 hover:underline dark:text-teal-300"
                  >
                    <Link2 className="size-3" aria-hidden /> source
                  </a>
                )}
              </TreeNode>

              {/* Facts */}
              <TreeNode
                icon={<FileText className="size-3" />}
                label={`Facts (${p.facts.length})`}
                className="text-emerald-700 dark:text-emerald-300"
              >
                {p.facts.length === 0 ? (
                  <span className="text-muted-foreground">none</span>
                ) : (
                  <ul className="space-y-0.5">
                    {p.facts.map((f, j) => (
                      <li key={`${f.factId}-${j}`} className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-muted-foreground">{f.factId}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{f.attribute}</span>
                        <span className="text-muted-foreground">=</span>
                        <span className="rounded bg-emerald-500/10 px-1 font-mono text-[11px] text-emerald-800 dark:text-emerald-200">
                          {fmt(f.value)}
                        </span>
                        <TruthBadge level={f.truthLevel} size="sm" />
                      </li>
                    ))}
                  </ul>
                )}
              </TreeNode>

              {/* Evidence */}
              <TreeNode
                icon={<FileText className="size-3" />}
                label={`Evidence (${p.evidence.length})`}
                className="text-teal-700 dark:text-teal-300"
              >
                {p.evidence.length === 0 ? (
                  <span className="text-muted-foreground">none</span>
                ) : (
                  <ul className="space-y-0.5">
                    {p.evidence.map((e, j) => (
                      <li key={`${e.evidenceId}-${j}`} className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono">{e.evidenceId}</span>
                        {e.documentId && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            doc:{e.documentId}
                          </span>
                        )}
                        {e.page != null && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            p:{e.page}
                          </span>
                        )}
                        {e.region && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            region:{e.region}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TreeNode>

              {/* Calculation */}
              <TreeNode
                icon={<Calculator className="size-3" />}
                label={`Calculation (${p.calculation.length})`}
                className="text-zinc-700 dark:text-zinc-300"
              >
                {p.calculation.length === 0 ? (
                  <span className="text-muted-foreground">none</span>
                ) : (
                  <ul className="space-y-1">
                    {p.calculation.map((c, j) => (
                      <li key={j}>
                        <Leaf>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{c.description}</span>
                            {c.ruleClause && (
                              <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {c.ruleClause}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                            <span>input:</span>
                            <span className="font-mono text-[10px]">{fmt(c.input)}</span>
                            <span className="text-emerald-600">→</span>
                            <span>output:</span>
                            <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                              {fmt(c.output)}
                            </span>
                          </div>
                        </Leaf>
                      </li>
                    ))}
                  </ul>
                )}
              </TreeNode>

              {/* Assumptions */}
              <TreeNode
                icon={<Flag className="size-3" />}
                label="Assumptions"
                className="text-rose-700 dark:text-rose-300"
              >
                {p.assumptions.length === 0 ? (
                  <span className="text-muted-foreground">none</span>
                ) : (
                  <ul className="list-disc pl-4">
                    {p.assumptions.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                )}
              </TreeNode>
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="font-mono">as_of={p.asOf}</span>
              <span>·</span>
              <span className="font-mono">produced={p.producedAt}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </ScrollArea>
  );
}
