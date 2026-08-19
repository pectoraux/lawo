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
import type { RuleEngine } from '@/kernel/contracts/contracts';
import { covers } from '@/kernel/time/TemporalModel';
import { evaluateCondition } from '@/kernel/rules/conditionEval';

class DeterministicRuleEngine implements RuleEngine {
  evaluate(rule: Rule, facts: Fact[], asOf: string): RuleEvaluationResult {
    const calculation: CalculationStep[] = [];

    // ---- Step 1: temporal coverage (I7) ----
    const temporalOk = covers(rule.temporal, asOf);
    calculation.push({
      description: 'Temporal coverage check',
      input: { validFrom: rule.temporal.validFrom, validTo: rule.temporal.validTo ?? null, asOf },
      output: temporalOk,
      ruleClause: 'temporal',
    });

    if (!temporalOk) {
      return {
        ruleId: rule.id,
        matched: false,
        skippedDueToException: false,
        firedEffects: [],
        truthLevel: rule.truthLevel,
        calculation,
      };
    }

    // ---- Step 2: conditions ----
    const conditionsMatch = evaluateCondition(rule.ruleIr.conditions, facts);
    calculation.push({
      description: 'Condition tree evaluation',
      input: { conditions: rule.ruleIr.conditions, factCount: facts.length },
      output: conditionsMatch,
      ruleClause: 'conditions',
    });

    // ---- Step 3: exceptions ----
    const exceptions = rule.ruleIr.exceptions ?? [];
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
      // Materialise effects from the RuleIR.
      firedEffects = rule.ruleIr.effects.map((e) => ({ ...e }));
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
      ruleId: rule.id,
      matched,
      skippedDueToException: exceptionMatched,
      firedEffects,
      truthLevel: rule.truthLevel,
      calculation,
    };
  }

  evaluateAll(rules: Rule[], facts: Fact[], asOf: string): RuleEvaluationResult[] {
    return rules.map((rule) => this.evaluate(rule, facts, asOf));
  }
}

/**
 * Factory — produces a fresh, deterministic RuleEngine.
 */
export function createRuleEngine(): RuleEngine {
  return new DeterministicRuleEngine();
}

// Convenience re-export so callers can import the result type from the same
// module if they wish (the canonical type lives in primitives/types).
export type { RuleEvaluationResult, TruthLevel } from '@/kernel/primitives/types';
