/**
 * Nomos — Evidence Graph  (architecture §16, contracts/evidence.md)
 * --------------------------------------------------
 * Minimal in-memory Evidence store keyed by fact id and document id.
 * Backed by two indices (byFact, byDocument) so lookups are O(k) where k
 * is the number of evidence items for the target.
 *
 * The EvidenceGraph is a KNOWLEDGE-PLANE structure (Plane C). It is NOT
 * authoritative — it is an index over extracted facts. The authority lies
 * upstream in the document pipeline (INPUT → CLASSIFY → OCR → EXTRACT →
 * NORMALIZE → ENTITY RESOLUTION → FACTS → EVIDENCE GRAPH).
 */

import type { Evidence } from '@/kernel/primitives/types';

export interface EvidenceGraph {
  /** Insert an Evidence item. Idempotent on id — re-adding replaces. */
  add(e: Evidence): void;
  /** All evidence items whose `extractedFactIds` includes `factId`. */
  forFact(factId: string): Evidence[];
  /** All evidence items whose `documentId` matches `documentId`. */
  forDocument(documentId: string): Evidence[];
  /** All evidence items, in insertion order. */
  all(): Evidence[];
}

class InMemoryEvidenceGraph implements EvidenceGraph {
  private readonly byId = new Map<string, Evidence>();
  private readonly byFact = new Map<string, Evidence[]>();
  private readonly byDocument = new Map<string, Evidence[]>();
  private readonly insertionOrder: string[] = [];

  add(e: Evidence): void {
    // If re-adding, remove the old entry from indices first.
    const existing = this.byId.get(e.id);
    if (existing) {
      this.removeFromIndex(this.byFact, existing.extractedFactIds, existing.id);
      if (existing.documentId) {
        this.removeFromIndex(this.byDocument, [existing.documentId], existing.id);
      }
    } else {
      this.insertionOrder.push(e.id);
    }

    this.byId.set(e.id, e);
    for (const fid of e.extractedFactIds) {
      let list = this.byFact.get(fid);
      if (!list) {
        list = [];
        this.byFact.set(fid, list);
      }
      list.push(e);
    }
    if (e.documentId) {
      let list = this.byDocument.get(e.documentId);
      if (!list) {
        list = [];
        this.byDocument.set(e.documentId, list);
      }
      list.push(e);
    }
  }

  forFact(factId: string): Evidence[] {
    return [...(this.byFact.get(factId) ?? [])];
  }

  forDocument(documentId: string): Evidence[] {
    return [...(this.byDocument.get(documentId) ?? [])];
  }

  all(): Evidence[] {
    return this.insertionOrder
      .map((id) => this.byId.get(id))
      .filter((e): e is Evidence => e !== undefined);
  }

  private removeFromIndex(
    index: Map<string, Evidence[]>,
    keys: string[],
    evidenceId: string,
  ): void {
    for (const k of keys) {
      const list = index.get(k);
      if (!list) continue;
      const i = list.findIndex((e) => e.id === evidenceId);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) index.delete(k);
    }
  }
}

/**
 * Factory — produces a fresh, empty EvidenceGraph.
 */
export function createEvidenceGraph(): EvidenceGraph {
  return new InMemoryEvidenceGraph();
}
