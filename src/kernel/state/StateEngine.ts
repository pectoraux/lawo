/**
 * Nomos — State Engine  (architecture §4, contracts/state.md)
 * --------------------------------------------------
 * The StateEngine folds RuleEvaluationResults into a StateSnapshot: it
 * collects every fired effect, buckets them by EffectKind into the typed
 * obligation/right/permission/restriction/option collections, computes the
 * overall truthLevel (the WEAKER truth level wins, per I8) and produces the
 * inspectable first-class state.
 *
 * The engine itself is domain-agnostic (I1). It does not know what a
 * "border crossing" or "insurance claim" is — it only knows about rule
 * effects and their kinds.
 *
 * Determinism: evaluation is pure relative to its inputs. The only
 * non-deterministic surface is `computedAt` (an informational timestamp);
 * the rest of the snapshot is byte-stable for identical inputs.
 */

import type {
  ContextBundle,
  FiredEffect,
  Obligation,
  Option,
  Permission,
  Restriction,
  Right,
  Rule,
  Situation,
  StateSnapshot,
  TruthLevel,
} from '@/kernel/primitives/types';
import type { RuleEngine } from '@/kernel/contracts/contracts';
import type { StateEngine } from '@/kernel/contracts/contracts';
import { combineTruthLevels } from '@/kernel/truth/truth';

class DefaultStateEngine implements StateEngine {
  compute(
    bundle: ContextBundle,
    situation: Situation | undefined,
    rules: Rule[],
    ruleEngine: RuleEngine,
  ): StateSnapshot {
    const request = bundle.request;

    // 1. Evaluate every applicable rule against the request facts at asOf.
    const evaluations = ruleEngine.evaluateAll(rules, request.facts, request.asOf);

    // 2. Collect every fired effect, preserving (ruleId, effect, truthLevel).
    const firedEffects: FiredEffect[] = [];
    for (const ev of evaluations) {
      if (!ev.matched) continue;
      for (const effect of ev.firedEffects) {
        firedEffects.push({
          ruleId: ev.ruleId,
          effect,
          truthLevel: ev.truthLevel,
        });
      }
    }

    // 3. Bucket effects by kind. FEE and CONSEQUENCE effects are NOT bucketed —
    //    they remain only in `firedEffects` for downstream consumption.
    const obligations: Obligation[] = [];
    const rights: Right[] = [];
    const permissions: Permission[] = [];
    const restrictions: Restriction[] = [];
    const options: Option[] = [];

    // Track effect codes per rule to build stable, deduplicated ids.
    const seenIds = new Set<string>();

    for (const fe of firedEffects) {
      const rule = rules.find((r) => r.id === fe.ruleId);
      const authorityId = rule?.authorityId ?? 'unknown-authority';
      const effect = fe.effect;
      const id = `${fe.ruleId}:${effect.code}`;

      switch (effect.kind) {
        case 'OBLIGATION': {
          if (seenIds.has(id)) break;
          seenIds.add(id);
          obligations.push({
            id,
            code: effect.code,
            label: effect.label,
            dueBy: effect.detail ? extractDueBy(effect.detail) : undefined,
            authorityId,
          });
          break;
        }
        case 'RIGHT': {
          if (seenIds.has(id)) break;
          seenIds.add(id);
          rights.push({ id, code: effect.code, label: effect.label });
          break;
        }
        case 'PERMISSION': {
          if (seenIds.has(id)) break;
          seenIds.add(id);
          permissions.push({ id, code: effect.code, label: effect.label });
          break;
        }
        case 'RESTRICTION': {
          if (seenIds.has(id)) break;
          seenIds.add(id);
          restrictions.push({ id, code: effect.code, label: effect.label });
          break;
        }
        case 'OPTION': {
          if (seenIds.has(id)) break;
          seenIds.add(id);
          options.push({
            id,
            code: effect.code,
            label: effect.label,
            detail: effect.detail,
            // ActionModel re-evaluates preconditions if needed; not set here.
            actionId: undefined,
          });
          break;
        }
        case 'FEE':
        case 'CONSEQUENCE':
        default: {
          // Remain in firedEffects only.
          break;
        }
      }
    }

    // 4. Overall truth level — the weakest among fired effects (I8).
    //    If nothing fired, default to T0 (an empty state is still
    //    authoritative — it just means no obligations/rights apply).
    const truthLevel: TruthLevel =
      firedEffects.length > 0
        ? combineTruthLevels(firedEffects.map((fe) => fe.truthLevel))
        : 'T0';

    // 5. applicableRules = the rules passed in (already filtered to those
    //    in effect by the rule engine via `covers(temporal, asOf)` upstream).
    const applicableRules = rules;

    return {
      situationId: situation?.id ?? 'adhoc',
      subjectId: request.subjectId,
      jurisdictionIds: request.jurisdictionIds,
      asOf: request.asOf,
      computedAt: new Date().toISOString(),
      applicableRules,
      firedEffects,
      options,
      obligations,
      rights,
      permissions,
      restrictions,
      truthLevel,
      provenance: [], // Filled by ProvenanceBuilder.
    };
  }
}

/**
 * Heuristic: attempt to extract a due-by date from an effect.detail string.
 * Looks for an ISO date substring (YYYY-MM-DD). Returns undefined if none.
 *
 * This is intentionally permissive — it inspects the free-text detail field,
 * not authoritative data. Packages that need an exact dueBy should populate
 * it explicitly via a structured extension (out of v1 scope).
 */
function extractDueBy(detail: string): string | undefined {
  // ISO date substring — YYYY-MM-DD
  const match = detail.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : undefined;
}

/**
 * Factory — produces a fresh, deterministic StateEngine.
 */
export function createStateEngine(): StateEngine {
  return new DefaultStateEngine();
}
