/**
 * Nomos — Rule Engine  (architecture §10, §11, contracts/rule.md)
 * --------------------------------------------------
 * The RuleEngine is the ONLY authoritative source of "did this rule fire?"
 * in the platform. It is fully deterministic (I5) — no IO, no LLM, no
 * Date.now(), no hidden state. Same inputs → identical RuleEvaluationResult.
 *
 * Algorithm:
 *   1. If `covers(rule.temporal, asOf)` is false → return matched=false with
 *      a single calculation step explaining the temporal skip.
 *   2. Evaluate `rule.ruleIr.conditions` against facts via `evaluateCondition`.
 *   3. For each exception in `rule.ruleIr.exceptions`, evaluate it. If ANY
 *      exception matches, set matched=false and skippedDueToException=true.
 *   4. If conditions match AND no exception matches: matched=true,
 *      firedEffects = rule.ruleIr.effects mapped to FiredEffect shape.
 *   5. Build a calculation array of steps: one for the condition result,
 *      one per exception result, one for the outcome.
 *
 * `evaluateAll` pre-filters rules whose `temporal` does not cover `asOf` —
 * those still produce a result (so callers see them), but the result carries
 * a `temporal` calculation step. We do NOT short-circuit because audit
 * provenance (I6) requires showing every rule that was considered.
 */

import type {
  CalculationStep,
  Fact,
  Rule,
  RuleEffect,
  RuleEvaluationResult,
  TruthLevel,
} from '@/kernel/primitives/types';
import type { CompiledRuleEngine } from '@/kernel/contracts/contracts';
import type { CompiledRule } from '@/kernel/rules/CompiledRule';
import { covers } from '@/kernel/time/TemporalModel';
import { evaluateCondition } from '@/kernel/rules/conditionEval';

/**
 * Internal: evaluate a condition tree + exception list + effect list against
 * facts at asOf. Both `Rule` and `CompiledRule` reduce to this same core
 * algorithm because CompiledRule's normalised tree has identical semantics.
 *
 * This is shared by `evaluate` (Rule) and `evaluateCompiled` (CompiledRule)
 * so the algorithm is provably identical between the two paths.
 */
function evaluateCore(
  ruleId: string,
  truthLevel: TruthLevel,
  temporal: CompiledRule['temporal'],
  conditions: import('@/kernel/primitives/types').ConditionNode,
  exceptions: import('@/kernel/primitives/types').ConditionNode[],
  effects: RuleEffect[],
  facts: Fact[],
  asOf: string,
): RuleEvaluationResult {
  const calculation: CalculationStep[] = [];

  // ---- Step 1: temporal coverage (I7) ----
  const temporalOk = covers(temporal, asOf);
  calculation.push({
    description: 'Temporal coverage check',
    input: { validFrom: temporal.validFrom, validTo: temporal.validTo ?? null, asOf },
    output: temporalOk,
    ruleClause: 'temporal',
  });

  if (!temporalOk) {
    return {
      ruleId,
      matched: false,
      skippedDueToException: false,
      firedEffects: [],
      truthLevel,
      calculation,
    };
  }

  // ---- Step 2: conditions ----
  const conditionsMatch = evaluateCondition(conditions, facts);
  calculation.push({
    description: 'Condition tree evaluation',
    input: { conditions, factCount: facts.length },
    output: conditionsMatch,
    ruleClause: 'conditions',
  });

  // ---- Step 3: exceptions ----
  let exceptionMatched = false;
  let firstMatchingExceptionIndex = -1;
  for (let i = 0; i < exceptions.length; i++) {
    const ex = exceptions[i]!;
    const matched = evaluateCondition(ex, facts);
    calculation.push({
      description: `Exception[${i}] evaluation`,
      input: { exception: ex },
      output: matched,
      ruleClause: `exception[${i}]`,
    });
    if (matched && !exceptionMatched) {
      exceptionMatched = true;
      firstMatchingExceptionIndex = i;
    }
  }

  // ---- Step 4: outcome ----
  const matched = conditionsMatch && !exceptionMatched;
  let firedEffects: RuleEffect[] = [];
  if (matched) {
    // Materialise effects (deep clone to prevent caller mutation).
    firedEffects = effects.map((e) => ({ ...e, amount: e.amount ? { ...e.amount } : undefined }));
  }

  const outcomeDescription = !conditionsMatch
    ? 'Conditions not satisfied — rule does not fire'
    : exceptionMatched
      ? `Rule skipped due to exception[${firstMatchingExceptionIndex}]`
      : 'Conditions satisfied and no exception matched — rule fires';

  calculation.push({
    description: outcomeDescription,
    input: { conditionsMatch, exceptionMatched },
    output: matched,
    ruleClause: 'outcome',
  });

  return {
    ruleId,
    matched,
    skippedDueToException: exceptionMatched,
    firedEffects,
    truthLevel,
    calculation,
  };
}

class DeterministicRuleEngine implements CompiledRuleEngine {
  evaluate(rule: Rule, facts: Fact[], asOf: string): RuleEvaluationResult {
    return evaluateCore(
      rule.id,
      rule.truthLevel,
      rule.temporal,
      rule.ruleIr.conditions,
      rule.ruleIr.exceptions ?? [],
      rule.ruleIr.effects,
      facts,
      asOf,
    );
  }

  evaluateAll(rules: Rule[], facts: Fact[], asOf: string): RuleEvaluationResult[] {
    return rules.map((rule) => this.evaluate(rule, facts, asOf));
  }

  /**
   * Evaluate a `CompiledRule` — the pre-validated, normalised, hashed runtime
   * representation produced by `compileRule`. The evaluation algorithm is
   * IDENTICAL to `evaluate` — the compiled rule's condition tree has the same
   * semantics (it is normalised but not transformed). The benefit is that
   * compiled rules can be cached, hashed, and trusted without re-validating
   * on every call (per RULE-010, I5, I13).
   */
  evaluateCompiled(rule: CompiledRule, facts: Fact[], asOf: string): RuleEvaluationResult {
    return evaluateCore(
      rule.id,
      rule.truthLevel,
      rule.temporal,
      rule.compiledConditions,
      rule.compiledExceptions,
      rule.effects,
      facts,
      asOf,
    );
  }

  evaluateAllCompiled(
    rules: CompiledRule[],
    facts: Fact[],
    asOf: string,
  ): RuleEvaluationResult[] {
    return rules.map((rule) => this.evaluateCompiled(rule, facts, asOf));
  }
}

/**
 * Factory — produces a fresh, deterministic RuleEngine that ALSO implements
 * the CompiledRuleEngine contract (i.e. accepts CompiledRule inputs).
 *
 * Callers that only need the FROZEN `RuleEngine` contract can assign the
 * result to `RuleEngine`; callers that need `evaluateCompiled` assign it to
 * `CompiledRuleEngine`.
 */
export function createRuleEngine(): CompiledRuleEngine {
  return new DeterministicRuleEngine();
}

// Convenience re-export so callers can import the result type from the same
// module if they wish (the canonical type lives in primitives/types).
export type { RuleEvaluationResult, TruthLevel } from '@/kernel/primitives/types';
