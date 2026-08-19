/**
 * Nomos — Jurisdiction Graph  (architecture §5, contracts/state.md)
 * --------------------------------------------------
 * In-memory directed graph of Jurisdictions and JurisdictionEdges.
 *
 * The graph supports 11 frozen relation types. Two navigational directions
 * are exposed:
 *
 *   - ancestors(id)   — traverses APPLIES_TO / DERIVES_FROM / IMPLEMENTS /
 *                       REFERENCES / INTERPRETS  (from -> to), upward.
 *   - descendants(id) — traverses the INVERSE of OVERRIDES / PREEMPTS /
 *                       MODIFIES / EXEMPTS / CONDITIONAL_ON / SUPERSEDES
 *                       (to -> from), downward.
 *
 * Both traversals are cycle-safe (visited-set deduplication) and return
 * nearest-first results. `applicableFor(ids, asOf)` returns the union of the
 * given jurisdictions and all their ancestors, filtered to those whose
 * `temporal` range covers `asOf`.
 *
 * Determinism: the implementation is pure relative to its inputs. Same
 * `add` / `addEdge` order + same query → same result, byte-for-byte.
 */

import type {
  Jurisdiction,
  JurisdictionEdge,
  JurisdictionRelation,
} from '@/kernel/primitives/types';
import type { JurisdictionGraph } from '@/kernel/contracts/contracts';
import { covers } from '@/kernel/time/TemporalModel';

// Relations traversed upward (from -> to) by ancestors().
const ANCESTOR_RELATIONS: ReadonlySet<JurisdictionRelation> = new Set([
  'APPLIES_TO',
  'DERIVES_FROM',
  'IMPLEMENTS',
  'REFERENCES',
  'INTERPRETS',
]);

// Relations whose INVERSE (to -> from) is traversed downward by descendants().
const DESCENDANT_RELATIONS: ReadonlySet<JurisdictionRelation> = new Set([
  'OVERRIDES',
  'PREEMPTS',
  'MODIFIES',
  'EXEMPTS',
  'CONDITIONAL_ON',
  'SUPERSEDES',
]);

/**
 * In-memory JurisdictionGraph implementation.
 *
 * Stored as:
 *   - nodes: Map<id, Jurisdiction>
 *   - outEdges: Map<fromId, JurisdictionEdge[]>
 *   - inEdges: Map<toId, JurisdictionEdge[]>
 */
class InMemoryJurisdictionGraph implements JurisdictionGraph {
  private readonly nodes = new Map<string, Jurisdiction>();
  private readonly outEdges = new Map<string, JurisdictionEdge[]>();
  private readonly inEdges = new Map<string, JurisdictionEdge[]>();

  add(j: Jurisdiction): void {
    this.nodes.set(j.id, j);
    if (!this.outEdges.has(j.id)) this.outEdges.set(j.id, []);
    if (!this.inEdges.has(j.id)) this.inEdges.set(j.id, []);
  }

  addEdge(e: JurisdictionEdge): void {
    // Ensure both endpoint entries exist (the jurisdictions may not have
    // been registered via add() yet — defensive).
    if (!this.outEdges.has(e.fromId)) this.outEdges.set(e.fromId, []);
    if (!this.inEdges.has(e.toId)) this.inEdges.set(e.toId, []);
    this.outEdges.get(e.fromId)!.push(e);
    this.inEdges.get(e.toId)!.push(e);
  }

  get(id: string): Jurisdiction | undefined {
    return this.nodes.get(id);
  }

  /**
   * Traverse upward (from -> to) following APPLIES_TO / DERIVES_FROM /
   * IMPLEMENTS / REFERENCES / INTERPRETS. Returns ancestors nearest-first,
   * deduplicated, no cycles.
   */
  ancestors(id: string): Jurisdiction[] {
    const result: Jurisdiction[] = [];
    const seen = new Set<string>();
    seen.add(id);

    // BFS — nearest-first.
    const queue: string[] = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const edges = this.outEdges.get(current) ?? [];
      for (const edge of edges) {
        if (!ANCESTOR_RELATIONS.has(edge.relation)) continue;
        if (seen.has(edge.toId)) continue;
        seen.add(edge.toId);
        const node = this.nodes.get(edge.toId);
        if (node) result.push(node);
        queue.push(edge.toId);
      }
    }
    return result;
  }

  /**
   * Traverse downward by following the inverse of OVERRIDES / PREEMPTS /
   * MODIFIES / EXEMPTS / CONDITIONAL_ON / SUPERSEDES. I.e. find edges where
   * toId === id and the relation is one of those six, then descend into
   * the fromId nodes. Returns nearest-first, deduplicated, no cycles.
   */
  descendants(id: string): Jurisdiction[] {
    const result: Jurisdiction[] = [];
    const seen = new Set<string>();
    seen.add(id);

    const queue: string[] = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      // Incoming edges — i.e. edges where toId === current.
      const incoming = this.inEdges.get(current) ?? [];
      for (const edge of incoming) {
        if (!DESCENDANT_RELATIONS.has(edge.relation)) continue;
        if (seen.has(edge.fromId)) continue;
        seen.add(edge.fromId);
        const node = this.nodes.get(edge.fromId);
        if (node) result.push(node);
        queue.push(edge.fromId);
      }
    }
    return result;
  }

  /**
   * Returns the union of (given jurisdictions + all their ancestors), filtered
   * to those whose `temporal` range covers `asOf`. Deduplicates and preserves
   * discovery order (input jurisdictions first, then ancestors in BFS order).
   */
  applicableFor(jurisdictionIds: string[], asOf: string): Jurisdiction[] {
    const result: Jurisdiction[] = [];
    const seen = new Set<string>();

    // First include the explicitly-named jurisdictions (if they exist and cover asOf).
    for (const id of jurisdictionIds) {
      if (seen.has(id)) continue;
      const node = this.nodes.get(id);
      if (!node) continue;
      seen.add(id);
      if (covers(node.temporal, asOf)) result.push(node);
    }

    // Then walk ancestors of each, in input order, BFS nearest-first.
    for (const id of jurisdictionIds) {
      const anc = this.ancestors(id);
      for (const node of anc) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        if (covers(node.temporal, asOf)) result.push(node);
      }
    }

    return result;
  }

  /**
   * Returns all edges where fromId === id OR toId === id. Stable order:
   * out-edges first (in insertion order), then in-edges.
   */
  relations(id: string): JurisdictionEdge[] {
    const out = this.outEdges.get(id) ?? [];
    const incoming = this.inEdges.get(id) ?? [];
    return [...out, ...incoming];
  }

  all(): Jurisdiction[] {
    return Array.from(this.nodes.values());
  }

  allEdges(): JurisdictionEdge[] {
    const all: JurisdictionEdge[] = [];
    for (const list of this.outEdges.values()) {
      for (const e of list) all.push(e);
    }
    return all;
  }
}

/**
 * Factory — produces a fresh, empty JurisdictionGraph.
 */
export function createJurisdictionGraph(): JurisdictionGraph {
  return new InMemoryJurisdictionGraph();
}
