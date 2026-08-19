/**
 * GET /api/jurisdictions
 * Returns the full jurisdiction graph: nodes + edges, grouped by package.
 */
import { NextResponse } from 'next/server';
import { createPackageRegistry } from '@/packages/registry/PackageRegistry';

export const dynamic = 'force-static';

export function GET() {
  const registry = createPackageRegistry();
  const jurisdictions = registry.listJurisdictions();
  const edges = registry.jurisdictionGraph.allEdges();
  const authorities = registry.listAuthorities();
  const sources = registry.listSources();

  // Group jurisdictions by kind for visualization
  const byKind: Record<string, typeof jurisdictions> = {};
  for (const j of jurisdictions) {
    if (!byKind[j.kind]) byKind[j.kind] = [];
    byKind[j.kind].push(j);
  }

  // Build a quick adjacency map: each jurisdiction -> [parent ids] + [children ids]
  const adjacency: Record<string, { parents: string[]; children: string[]; edges: { relation: string; otherId: string }[] }> = {};
  for (const j of jurisdictions) {
    adjacency[j.id] = { parents: [], children: [], edges: [] };
  }
  for (const e of edges) {
    if (adjacency[e.fromId]) {
      adjacency[e.fromId].children.push(e.toId);
      adjacency[e.fromId].edges.push({ relation: e.relation, otherId: e.toId });
    }
    if (adjacency[e.toId]) {
      adjacency[e.toId].parents.push(e.fromId);
      adjacency[e.toId].edges.push({ relation: e.relation, otherId: e.fromId });
    }
  }

  return NextResponse.json({
    jurisdictions,
    edges,
    byKind,
    adjacency,
    authorities,
    sources,
    relationTypes: [
      'APPLIES_TO', 'OVERRIDES', 'PREEMPTS', 'IMPLEMENTS', 'DERIVES_FROM',
      'MODIFIES', 'EXEMPTS', 'REFERENCES', 'SUPERSEDES', 'INTERPRETS', 'CONDITIONAL_ON',
    ],
  });
}
