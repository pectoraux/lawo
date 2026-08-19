/**
 * Nomos — Provenance Builder  (architecture §14, contracts/decision.md)
 * --------------------------------------------------
 * For each matched rule evaluation, builds a Provenance chain:
 *
 *   DECISION → RULE → SOURCE → AUTHORITY → VERSION
 *           → FACTS → EVIDENCE → CALCULATION → ASSUMPTIONS
 *
 * (I6, I13). The builder is deterministic modulo `producedAt` (an
 * informational timestamp). It performs NO IO and never consults an LLM.
 *
 * Inputs come from the ContextBundle (already resolved upstream by the
 * ContextBuilder) — we only resolve references by id, falling back to
 * synthesised SourceRef / AuthorityRef if a lookup misses (defensive).
 */

import type {
  Authority,
  AuthorityRef,
  CalculationStep,
  ConditionNode,
  ContextBundle,
  Evidence,
  EvidenceRef,
  Fact,
  FactRef,
  Provenance,
  Rule,
  RuleEvaluationResult,
  Source,
  SourceRef,
  TruthLevel,
} from '@/kernel/primitives/types';
import type { ProvenanceBuilder } from '@/kernel/contracts/contracts';

/**
 * Recursively walk a ConditionNode tree and collect every `leaf.fact`
 * attribute name. Returns a deduplicated list in walk order.
 */
function collectLeafAttributes(node: ConditionNode): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const visit = (n: ConditionNode): void => {
    switch (n.kind) {
      case 'leaf': {
        if (!seen.has(n.fact)) {
          seen.add(n.fact);
          result.push(n.fact);
        }
        break;
      }
      case 'and':
      case 'or': {
        for (const child of n.children) visit(child);
        break;
      }
      case 'not': {
        visit(n.child);
        break;
      }
      default: {
        // Exhaustiveness guard — unknown node kinds contribute no attributes.
        break;
      }
    }
  };

  visit(node);
  return result;
}

/**
 * Walk BOTH the rule's conditions and all its exceptions when collecting
 * referenced fact attributes. Every attribute the rule could possibly
 * inspect during evaluation is included so the Provenance chain is
 * complete even for rules that were skipped due to a matching exception
 * (though we only build provenance for matched rules today).
 */
function collectRuleFactAttributes(rule: Rule): string[] {
  const attrs = collectLeafAttributes(rule.ruleIr.conditions);
  for (const ex of rule.ruleIr.exceptions ?? []) {
    for (const a of collectLeafAttributes(ex)) {
      if (!attrs.includes(a)) attrs.push(a);
    }
  }
  return attrs;
}

/** Build a SourceRef from a Source; falls back to a synthesised ref. */
function buildSourceRef(rule: Rule, sources: Source[]): SourceRef {
  const source = sources.find((s) => s.id === rule.sourceId);
  if (source) {
    return {
      sourceId: source.id,
      citation: source.citation,
      url: source.url,
    };
  }
  // Defensive fallback.
  return {
    sourceId: rule.sourceId,
    citation: rule.sourceId,
  };
}

/** Build an AuthorityRef from an Authority; falls back to a synthesised ref. */
function buildAuthorityRef(rule: Rule, authorities: Authority[]): AuthorityRef {
  const authority = authorities.find((a) => a.id === rule.authorityId);
  if (authority) {
    return {
      authorityId: authority.id,
      name: authority.name,
      jurisdictionId: authority.jurisdictionId,
    };
  }
  return {
    authorityId: rule.authorityId,
    name: rule.authorityId,
    jurisdictionId: rule.jurisdictionId,
  };
}

/**
 * Build FactRefs for every fact referenced by the rule's condition tree.
 * Deduplicates by factId. If the bundle.request.facts contains multiple
 * facts for the same attribute, all are included.
 */
function buildFactRefs(rule: Rule, bundleFacts: Fact[]): FactRef[] {
  const attributes = collectRuleFactAttributes(rule);
  const attrSet = new Set(attributes);
  const refs: FactRef[] = [];
  const seenIds = new Set<string>();

  for (const fact of bundleFacts) {
    if (!attrSet.has(fact.attribute)) continue;
    if (seenIds.has(fact.id)) continue;
    seenIds.add(fact.id);
    refs.push({
      factId: fact.id,
      subjectId: fact.subjectId,
      attribute: fact.attribute,
      value: fact.value,
      truthLevel: fact.truthLevel,
    });
  }
  return refs;
}

/**
 * Build EvidenceRefs from the bundle's evidence list — include any
 * evidence whose `extractedFactIds` overlap with the ids of the facts
 * referenced by the rule's condition tree.
 */
function buildEvidenceRefs(rule: Rule, bundleFacts: Fact[], evidence: Evidence[]): EvidenceRef[] {
  const attributes = collectRuleFactAttributes(rule);
  const attrSet = new Set(attributes);
  const usedFactIds = new Set<string>();
  for (const fact of bundleFacts) {
    if (attrSet.has(fact.attribute)) usedFactIds.add(fact.id);
  }

  if (usedFactIds.size === 0) return [];

  const refs: EvidenceRef[] = [];
  const seenEvidenceIds = new Set<string>();
  for (const e of evidence) {
    const overlaps = e.extractedFactIds.some((fid) => usedFactIds.has(fid));
    if (!overlaps) continue;
    if (seenEvidenceIds.has(e.id)) continue;
    seenEvidenceIds.add(e.id);
    refs.push({
      evidenceId: e.id,
      documentId: e.documentId,
      page: e.page,
      region: e.region,
    });
  }
  return refs;
}

class DefaultProvenanceBuilder implements ProvenanceBuilder {
  build(
    decisionId: string,
    ruleEvaluations: RuleEvaluationResult[],
    rules: Rule[],
    bundle: ContextBundle,
    asOf: string,
    truthLevel: TruthLevel,
  ): Provenance[] {
    const producedAt = new Date().toISOString();
    const rulesById = new Map<string, Rule>();
    for (const r of rules) rulesById.set(r.id, r);

    const result: Provenance[] = [];

    for (const ev of ruleEvaluations) {
      if (!ev.matched) continue;
      const rule = rulesById.get(ev.ruleId);
      if (!rule) {
        // Defensive: matched evaluation has no corresponding rule — skip.
        continue;
      }

      const source = buildSourceRef(rule, bundle.sources);
      const authority = buildAuthorityRef(rule, bundle.resolvedAuthorities);
      const facts = buildFactRefs(rule, bundle.request.facts);
      const evidenceRefs = buildEvidenceRefs(rule, bundle.request.facts, bundle.evidence);
      const calculation: CalculationStep[] = ev.calculation.map((s) => ({ ...s }));

      result.push({
        decisionId,
        ruleId: rule.id,
        ruleVersion: rule.temporal.version,
        source,
        authority,
        facts,
        evidence: evidenceRefs,
        calculation,
        assumptions: [], // Populated by future LLM extractors (always empty in v1).
        truthLevel: ev.truthLevel,
        asOf,
        producedAt,
      });
    }

    // Note: `truthLevel` parameter (the overall state truth level) is passed
    // for context — each provenance entry carries the per-rule truth level
    // (I8: the overall decision truth level is the weakest among fired rules).
    void truthLevel;
    return result;
  }
}

/**
 * Factory — produces a fresh ProvenanceBuilder.
 */
export function createProvenanceBuilder(): ProvenanceBuilder {
  return new DefaultProvenanceBuilder();
}
