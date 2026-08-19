/**
 * Nomos — Rule Compiler  (architecture §11, Deliverable C)
 * --------------------------------------------------
 * Transforms validated RuleIR into a CompiledRule — the executable runtime
 * representation. The compiler:
 *
 *   1. Validates the rule (calls validateRule). Throws CompilationError if invalid.
 *   2. Normalizes the condition tree (flattens nested and/or, deduplicates
 *      children). Does NOT change semantics.
 *   3. Computes a SHA-256 hash of the canonical JSON representation (excluding
 *      the hash field). This makes the compiled representation immutable and
 *      tamper-evident (RULE-010).
 *
 * The compiled representation is traceable to the original RuleIR via
 * `sourceRuleIrId`.
 *
 * The compiler does NOT use eval(), Function(), or dynamically generated
 * executable JavaScript. Rules remain data. (RULE-002, I5.)
 *
 * The compiler is deterministic: same input always produces the same hash.
 */

import { createHash } from 'node:crypto';
import type {
  ConditionNode,
  Rule,
  RuleEffect,
  RuleType,
  TemporalRange,
  TruthLevel,
} from '@/kernel/primitives/types';
import { validateRule } from '@/kernel/rules/RuleIRValidator';
import { CompilationError } from '@/kernel/errors';

export interface CompiledRule {
  // Identity (preserved from Rule)
  id: string;
  code: string;
  title: string;
  packageId: string;
  ruleVersion: number;
  // Compiled condition tree (normalized — same semantics, potentially optimized)
  compiledConditions: ConditionNode;
  compiledExceptions: ConditionNode[];
  effects: RuleEffect[];
  // Metadata (preserved)
  jurisdictionId: string;
  authorityId: string;
  sourceId: string;
  type: RuleType;
  truthLevel: TruthLevel;
  temporal: TemporalRange;
  // Provenance — traceable to original RuleIR
  sourceRuleIrId: string;
  compiledAt: string;
  // Integrity
  hash: string;
}

/** Compile a single Rule into a CompiledRule. Throws CompilationError if invalid. */
export function compileRule(rule: Rule): CompiledRule {
  // 1. Validate
  const result = validateRule(rule);
  if (!result.valid) {
    throw new CompilationError(
      `Rule ${rule.id} failed validation: ${result.errors.join('; ')}`,
      rule.id,
    );
  }

  // 2. Normalize condition trees (semantic-preserving)
  const compiledConditions = normalizeConditionNode(rule.ruleIr.conditions);
  const compiledExceptions = rule.ruleIr.exceptions.map((ex) => normalizeConditionNode(ex));

  // 3. Build the compiled rule (without hash first)
  const compiledAt = new Date().toISOString();
  const compiled: Omit<CompiledRule, 'hash'> = {
    id: rule.id,
    code: rule.code,
    title: rule.title,
    packageId: rule.packageId,
    ruleVersion: rule.temporal.version,
    compiledConditions,
    compiledExceptions,
    effects: rule.ruleIr.effects.map((e) => ({ ...e })),
    jurisdictionId: rule.jurisdictionId,
    authorityId: rule.authorityId,
    sourceId: rule.sourceId,
    type: rule.type,
    truthLevel: rule.truthLevel,
    temporal: { ...rule.temporal },
    sourceRuleIrId: rule.ruleIr.id,
    compiledAt,
  };

  // 4. Compute SHA-256 hash of the canonical JSON (excluding the hash field)
  const hash = computeHash(compiled);

  return { ...compiled, hash };
}

/** Compile multiple rules. Throws on the first invalid rule. */
export function compileRules(rules: Rule[]): CompiledRule[] {
  return rules.map(compileRule);
}

// ---------------------------------------------------------------------------
// Condition tree normalization (semantic-preserving)
// ---------------------------------------------------------------------------

/**
 * Normalize a ConditionNode tree:
 * - Flatten nested `and`/`or` (e.g., and(and(a, b), c) → and(a, b, c))
 * - Deduplicate children (same child appearing twice → one occurrence)
 *
 * This does NOT change semantics — it's a canonical form for hashing and
 * potential future optimization. The evaluator produces identical results
 * on the original and normalized tree.
 */
function normalizeConditionNode(node: ConditionNode): ConditionNode {
  switch (node.kind) {
    case 'leaf': {
      // Leaves are already in canonical form.
      return { ...node };
    }
    case 'and':
    case 'or': {
      const normalizedChildren = flattenAndDedup(node.kind, node.children.map(normalizeConditionNode));
      if (normalizedChildren.length === 1) {
        // Single child — unwrap (and(x) → x). Semantically equivalent.
        return normalizedChildren[0]!;
      }
      return { kind: node.kind, children: normalizedChildren };
    }
    case 'not': {
      return { kind: 'not', child: normalizeConditionNode(node.child) };
    }
    default: {
      // Unknown node kind — return as-is (the validator will have flagged it).
      return node;
    }
  }
}

/**
 * Flatten nested same-kind nodes and deduplicate children by JSON representation.
 */
function flattenAndDedup(kind: 'and' | 'or', children: ConditionNode[]): ConditionNode[] {
  const flattened: ConditionNode[] = [];
  const seen = new Set<string>();

  const visit = (node: ConditionNode): void => {
    if (node.kind === kind) {
      for (const child of node.children) visit(child);
    } else {
      const key = JSON.stringify(node);
      if (!seen.has(key)) {
        seen.add(key);
        flattened.push(node);
      }
    }
  };

  for (const child of children) visit(child);
  return flattened;
}

/**
 * Compute a SHA-256 hash of the canonical JSON representation of a CompiledRule
 * (excluding the hash field itself). The hash is deterministic — same input
 * always produces the same hash. This makes the compiled rule immutable and
 * tamper-evident (RULE-010).
 *
 * Note: `compiledAt` is excluded from the hash computation because it's an
 * informational timestamp that would make the hash non-deterministic.
 */
function computeHash(compiled: Omit<CompiledRule, 'hash'>): string {
  // Create a canonical representation excluding compiledAt (informational)
  // and the hash field (which doesn't exist yet on this object).
  const canonical = {
    id: compiled.id,
    code: compiled.code,
    title: compiled.title,
    packageId: compiled.packageId,
    ruleVersion: compiled.ruleVersion,
    compiledConditions: compiled.compiledConditions,
    compiledExceptions: compiled.compiledExceptions,
    effects: compiled.effects,
    jurisdictionId: compiled.jurisdictionId,
    authorityId: compiled.authorityId,
    sourceId: compiled.sourceId,
    type: compiled.type,
    truthLevel: compiled.truthLevel,
    temporal: compiled.temporal,
    sourceRuleIrId: compiled.sourceRuleIrId,
  };

  const json = JSON.stringify(canonical, Object.keys(canonical).sort());
  return createHash('sha256').update(json).digest('hex');
}
