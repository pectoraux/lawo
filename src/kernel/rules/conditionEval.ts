/**
 * Nomos — Pure Condition Evaluator  (architecture §10, §11)
 * --------------------------------------------------
 * `evaluateCondition(node, facts)` is a PURE function: same inputs → same
 * output, byte-for-byte. No IO, no Date.now(), no LLM (I5). It traverses a
 * ConditionNode boolean expression tree and returns true/false.
 *
 * Leaf semantics:
 *   - eq      — strict equality (===) against `node.value`
 *   - neq     — strict inequality (!==)
 *   - gt/gte/lt/lte — numeric comparison; if factValue is non-numeric OR
 *                     Number(factValue) is NaN, returns false (does not throw).
 *                     facts may be partial.
 *   - in      — Array.isArray(node.value) && node.value.includes(factValue)
 *   - contains — factValue is a string or array that contains node.value
 *   - exists   — any fact with attribute === node.fact exists, regardless of
 *                value. The leaf's `value` field is ignored.
 *
 * Missing-fact handling:
 *   - For all operators, if no fact has the matching attribute, return false
 *     (the rule's condition is not satisfied). We deliberately do NOT throw —
 *     facts may legitimately be partial (I5 — deterministic, defensive).
 */

import type { ConditionNode, Fact } from '@/kernel/primitives/types';

/** Find all facts whose `attribute` matches `attribute`. */
function factsForAttribute(facts: Fact[], attribute: string): Fact[] {
  return facts.filter((f) => f.attribute === attribute);
}

/** Coerce a value to a finite number, or undefined if not numeric. */
function toFiniteNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return undefined;
}

/** Evaluate a single leaf node against the supplied facts. */
function evaluateLeaf(
  node: Extract<ConditionNode, { kind: 'leaf' }>,
  facts: Fact[],
): boolean {
  const matching = factsForAttribute(facts, node.fact);

  switch (node.operator) {
    case 'exists': {
      // Any fact with this attribute, regardless of value.
      return matching.length > 0;
    }

    case 'eq': {
      // Strict equality against node.value. If multiple facts match, ANY match
      // satisfies the leaf (OR semantics) — typical for partial fact sets.
      for (const f of matching) {
        if (f.value === node.value) return true;
      }
      return false;
    }

    case 'neq': {
      // True iff at least one matching fact's value differs from node.value
      // AND there is at least one matching fact. (No matching facts -> false.)
      if (matching.length === 0) return false;
      for (const f of matching) {
        if (f.value !== node.value) return true;
      }
      return false;
    }

    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const target = toFiniteNumber(node.value);
      if (target === undefined) return false;
      for (const f of matching) {
        const v = toFiniteNumber(f.value);
        if (v === undefined) continue;
        if (node.operator === 'gt' && v > target) return true;
        if (node.operator === 'gte' && v >= target) return true;
        if (node.operator === 'lt' && v < target) return true;
        if (node.operator === 'lte' && v <= target) return true;
      }
      return false;
    }

    case 'in': {
      if (!Array.isArray(node.value)) return false;
      for (const f of matching) {
        if (node.value.includes(f.value)) return true;
      }
      return false;
    }

    case 'contains': {
      for (const f of matching) {
        if (typeof f.value === 'string') {
          if (typeof node.value === 'string' && f.value.includes(node.value)) return true;
          if (typeof node.value === 'number' && f.value.includes(String(node.value))) return true;
        } else if (Array.isArray(f.value)) {
          if (f.value.includes(node.value)) return true;
        }
      }
      return false;
    }

    default: {
      // Exhaustiveness check — if a new operator is added without handling
      // here, fail closed (return false) rather than throwing.
      return false;
    }
  }
}

/**
 * Pure recursive evaluator. Returns true iff the condition tree is satisfied
 * by the supplied facts. Never throws on missing/wrong-type facts.
 */
export function evaluateCondition(node: ConditionNode, facts: Fact[]): boolean {
  switch (node.kind) {
    case 'leaf':
      return evaluateLeaf(node, facts);
    case 'and':
      return node.children.every((child) => evaluateCondition(child, facts));
    case 'or':
      return node.children.some((child) => evaluateCondition(child, facts));
    case 'not':
      return !evaluateCondition(node.child, facts);
    default: {
      // Exhaustiveness guard — unknown node kinds fail closed.
      return false;
    }
  }
}
