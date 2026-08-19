/**
 * Nomos — Decision Engine  (architecture §28, contracts/decision.md)
 * --------------------------------------------------
 * The orchestrator. Given a ContextRequest and a PackageRegistry, it
 * assembles the full decision pipeline:
 *
 *   ContextBuilder → RuleEngine → StateEngine → ProvenanceBuilder
 *                 → AuditEvent[]
 *
 * The DecisionEngine does NOT call any LLM (I5) — the entire pipeline is
 * deterministic modulo `producedAt` / `computedAt` / `timestamp`
 * (informational ISO timestamps).
 *
 * Inputs:
 *   - request:  ContextRequest (subjectId, asOf, facts, jurisdictionIds, ...)
 *   - registry: PackageRegistry (the universe of available packages)
 *
 * Output:
 *   - state:      StateSnapshot with provenance populated
 *   - provenance: Provenance[] (one per matched rule evaluation)
 *   - audit:      AuditEvent[] (at minimum: one "decision.computed" event)
 *
 * AUDIT CONTRACT (aligned with ADR 0014):
 *   The engine does NOT persist audit events itself. It constructs the
 *   AuditEvent[] array and returns it to the caller. The caller (the route
 *   handler) is responsible for persisting the audit event via the
 *   appropriate AuditLog method:
 *     - record()       for durable persistence (throws on failure)
 *     - recordBestEffort() for non-durable informational events
 *
 *   This removes the previous fire-and-forget contract that conflicted with
 *   the AuditLog's durable record() method. The engine is now audit-log
 *   agnostic — it doesn't inject or call an AuditLog at all. Callers that
 *   want audit persistence must do it explicitly at the route boundary.
 *
 *   This is the correct separation: the engine computes; the route handler
 *   decides the durability policy.
 */

import type {
  AuditEvent,
  ContextRequest,
  Provenance,
  StateSnapshot,
} from '@/kernel/primitives/types';
import type { DecisionEngine, PackageRegistry } from '@/kernel/contracts/contracts';
import { createContextBuilder } from '@/intelligence/context/ContextBuilder';
import { createRuleEngine } from '@/kernel/rules/RuleEngine';
import { createStateEngine } from '@/kernel/state/StateEngine';
import { createProvenanceBuilder } from '@/kernel/provenance/ProvenanceBuilder';

class DefaultDecisionEngine implements DecisionEngine {
  decide(
    request: ContextRequest,
    registry: PackageRegistry,
  ): { state: StateSnapshot; provenance: Provenance[]; audit: AuditEvent[] } {
    // 1. Identity for this decision.
    const decisionId = crypto.randomUUID();

    // 2. Build the context bundle (resolved jurisdictions, authorities,
    //    applicable rules, evidence, sources).
    const contextBuilder = createContextBuilder();
    const bundle = contextBuilder.build(request, registry);

    // 3. Resolve the situation (optional — decisions may be ad-hoc).
    const situation = request.situationId
      ? registry.listSituations().find((s) => s.id === request.situationId)
      : undefined;

    // 4. Evaluate every applicable rule against the facts at asOf.
    const ruleEngine = createRuleEngine();
    const rules = bundle.applicableRules;
    const evaluations = ruleEngine.evaluateAll(rules, request.facts, request.asOf);

    // 5. Fold evaluations into a StateSnapshot.
    const stateEngine = createStateEngine();
    const state = stateEngine.compute(bundle, situation, rules, ruleEngine);

    // Override applicableRules to be only those that actually matched —
    // callers want to see "what fired", not the candidate set.
    const matchedRuleIds = new Set(
      evaluations.filter((e) => e.matched).map((e) => e.ruleId),
    );
    state.applicableRules = rules.filter((r) => matchedRuleIds.has(r.id));

    // 6. Build provenance chains for matched rules.
    const matchedEvaluations = evaluations.filter((e) => e.matched);
    const provenanceBuilder = createProvenanceBuilder();
    const provenance = provenanceBuilder.build(
      decisionId,
      matchedEvaluations,
      rules,
      bundle,
      request.asOf,
      state.truthLevel,
    );
    state.provenance = provenance;

    // 7. Construct the audit event. The engine does NOT persist it — the
    //    caller (route handler) is responsible for durability. This aligns
    //    with ADR 0014: the route handler decides whether to use durable
    //    record() or non-durable recordBestEffort().
    const auditEvent: AuditEvent = {
      id: crypto.randomUUID(),
      tenantId: request.tenantId ?? null,
      actor: 'decision-engine',
      action: 'decision.computed',
      subjectId: request.subjectId,
      timestamp: new Date().toISOString(),
      severity: 'INFO',
      payload: {
        decisionId,
        subjectId: request.subjectId,
        situationId: request.situationId ?? null,
        firedEffectCount: state.firedEffects.length,
        truthLevel: state.truthLevel,
      },
    };

    return {
      state,
      provenance,
      audit: [auditEvent],
    };
  }
}

/**
 * Factory — produces a fresh DecisionEngine. The auditLog parameter is
 * accepted for backward compatibility with the contract interface but is
 * no longer used (the engine does not persist audit events; callers do).
 */
export function createDecisionEngine(_auditLog?: unknown): DecisionEngine {
  return new DefaultDecisionEngine();
}
