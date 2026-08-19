'use client';

import { useEffect, useState } from 'react';
import { GitGraph } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { getJurisdictions, type JurisdictionsResponse } from '@/lib/nomos-api';
import type { JurisdictionKind, Jurisdiction } from '@/kernel/primitives/types';
import { cn } from '@/lib/utils';

const KIND_COLOR: Record<JurisdictionKind, string> = {
  COUNTRY: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  REGION: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  STATE: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  MUNICIPALITY: 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300',
  REGULATOR: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  COURT: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  SPECIAL_ZONE: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  FREE_ZONE: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  SUPRANATIONAL: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  BILATERAL: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  INTERNATIONAL: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
};

const EDGE_RELATION_COLOR: Record<string, string> = {
  APPLIES_TO: 'text-emerald-600 dark:text-emerald-400',
  DERIVES_FROM: 'text-rose-600 dark:text-rose-400',
  IMPLEMENTS: 'text-amber-600 dark:text-amber-400',
  REFERENCES: 'text-teal-600 dark:text-teal-400',
};

interface TreeNode {
  jur: Jurisdiction;
  depth: number;
  children: TreeNode[];
}

/**
 * Builds an indented forest view from the jurisdictions + edges. Each root is
 * a jurisdiction with no incoming DERIVES_FROM/APPLIES_TO/IMPLEMENTS edges.
 */
function buildForest(jurisdictions: Jurisdiction[], edges: { fromId: string; toId: string; relation: string }[]): TreeNode[] {
  const childMap = new Map<string, { jur: Jurisdiction; relation: string }[]>();
  const hasParent = new Set<string>();

  for (const e of edges) {
    if (['APPLIES_TO', 'DERIVES_FROM', 'IMPLEMENTS', 'REFERENCES'].includes(e.relation)) {
      // Convention: fromId is the parent / supranational body, toId is the child.
      // In our package data, edges go e.g. ECOWAS→Ghana (DERIVES_FROM), so the
      // parent (root) is the source — but for visual nesting we want
      // SUPRANATIONAL at the top. So treat the fromId as parent if from-kind is
      // "more global", else invert.
      const from = jurisdictions.find((j) => j.id === e.fromId);
      const to = jurisdictions.find((j) => j.id === e.toId);
      if (!from || !to) continue;
      const fromIsParent =
        from.kind === 'SUPRANATIONAL' ||
        from.kind === 'INTERNATIONAL' ||
        from.kind === 'BILATERAL';
      const parent = fromIsParent ? from : to;
      const child = fromIsParent ? to : from;
      if (!childMap.has(parent.id)) childMap.set(parent.id, []);
      childMap.get(parent.id)!.push({ jur: child, relation: e.relation });
      hasParent.add(child.id);
    }
  }

  const roots = jurisdictions.filter((j) => !hasParent.has(j.id));
  const visited = new Set<string>();
  function buildNode(jur: Jurisdiction, depth: number): TreeNode {
    if (visited.has(jur.id)) {
      return { jur, depth, children: [] };
    }
    visited.add(jur.id);
    const kids = childMap.get(jur.id) ?? [];
    return {
      jur,
      depth,
      children: kids.map((c) => buildNode(c.jur, depth + 1)),
    };
  }
  // Sort roots: supranational first, then countries, then regions.
  const rank: Record<JurisdictionKind, number> = {
    SUPRANATIONAL: 0,
    INTERNATIONAL: 1,
    BILATERAL: 2,
    COUNTRY: 3,
    REGION: 4,
    STATE: 5,
    MUNICIPALITY: 6,
    REGULATOR: 7,
    COURT: 8,
    SPECIAL_ZONE: 9,
    FREE_ZONE: 10,
  };
  return roots
    .sort((a, b) => (rank[a.kind] ?? 99) - (rank[b.kind] ?? 99))
    .map((r) => buildNode(r, 0));
}

function TreeRow({ node, relations }: { node: TreeNode; relations: Map<string, string[]> }) {
  return (
    <div className="flex flex-col">
      <div
        className="flex flex-wrap items-center gap-1.5 py-0.5"
        style={{ paddingLeft: `${node.depth * 14}px` }}
      >
        <span
          className={cn(
            'inline-block size-1.5 shrink-0 rounded-full',
            node.jur.kind === 'COUNTRY' && 'bg-emerald-500',
            node.jur.kind === 'SUPRANATIONAL' && 'bg-rose-500',
            (node.jur.kind === 'REGION' ||
              node.jur.kind === 'STATE' ||
              node.jur.kind === 'MUNICIPALITY') &&
              'bg-amber-500',
            (node.jur.kind === 'SPECIAL_ZONE' || node.jur.kind === 'FREE_ZONE') && 'bg-violet-500',
            (node.jur.kind === 'REGULATOR') && 'bg-teal-500',
            node.jur.kind === 'INTERNATIONAL' && 'bg-zinc-500',
          )}
          aria-hidden
        />
        <span
          className={cn(
            'shrink-0 rounded border px-1 py-0 font-mono text-[10px] font-medium',
            KIND_COLOR[node.jur.kind],
          )}
          title={`${node.jur.kind} · ${node.jur.id}`}
        >
          {node.jur.code}
        </span>
        <span className="min-w-0 flex-1 break-words text-[11px]">{node.jur.name}</span>
        <span className="hidden font-mono text-[9px] text-muted-foreground sm:inline">{node.jur.id}</span>
      </div>
      {/* Edges to this node (incoming) */}
      {relations.get(node.jur.id)?.length ? (
        <div
          className="flex flex-wrap gap-1 break-words text-[9px] text-muted-foreground"
          style={{ paddingLeft: `${node.depth * 14 + 24}px` }}
        >
          {relations.get(node.jur.id)!.map((r, i) => (
            <span
              key={i}
              className={cn('font-mono uppercase', EDGE_RELATION_COLOR[r] ?? 'text-muted-foreground')}
            >
              ←{r}
            </span>
          ))}
        </div>
      ) : null}
      {node.children.map((child) => (
        <TreeRow key={child.jur.id} node={child} relations={relations} />
      ))}
    </div>
  );
}

export function JurisdictionGraphPanel() {
  const [data, setData] = useState<JurisdictionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getJurisdictions();
        if (!cancelled) setData(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const forest = data ? buildForest(data.jurisdictions, data.edges) : [];

  // Map: jurisdictionId -> list of incoming edge relations
  const incomingRelations = new Map<string, string[]>();
  if (data) {
    for (const e of data.edges) {
      if (!incomingRelations.has(e.toId)) incomingRelations.set(e.toId, []);
      incomingRelations.get(e.toId)!.push(e.relation);
      // Also treat fromId as having a reference if edge is symmetric-style
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <GitGraph className="size-4 text-rose-600" aria-hidden />
          Jurisdiction Graph
        </CardTitle>
        <CardDescription className="text-xs">
          {data
            ? `${data.jurisdictions.length} jurisdictions · ${data.edges.length} edges · 11 relation types`
            : 'Loading graph…'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2 pl-4" />
            <Skeleton className="h-4 w-3/4 pl-8" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="space-y-0.5">
              {forest.map((root) => (
                <TreeRow key={root.jur.id} node={root} relations={incomingRelations} />
              ))}
            </div>
          </ScrollArea>
        )}
        <div className="mt-3 flex flex-wrap gap-1 text-[9px] text-muted-foreground">
          <span className="font-mono">Edges:</span>
          <span className="text-emerald-600">APPLIES_TO</span>·
          <span className="text-rose-600">DERIVES_FROM</span>·
          <span className="text-amber-600">IMPLEMENTS</span>·
          <span className="text-teal-600">REFERENCES</span>·
          <span>OVERRIDES</span>·
          <span>PREEMPTS</span>·
          <span>MODIFIES</span>·
          <span>EXEMPTS</span>·
          <span>SUPERSEDES</span>·
          <span>INTERPRETS</span>·
          <span>CONDITIONAL_ON</span>
        </div>
      </CardContent>
    </Card>
  );
}
