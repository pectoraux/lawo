/**
 * Nomos — Decision Engine  (architecture §28, contracts/decision.md)
 * --------------------------------------------------
 * The orchestrator. Given a ContextRequest and a PackageRegistry, it
 * assembles the full decision pipeline:
 *
 *   ContextBuilder → RuleEngine → StateEngine → ProvenanceBuilder
 *                 → AuditEvent[]
 *
 * The DecisionEngine is the only component that records audit events (via
 * the injected AuditLog). It does NOT call any LLM (I5) — the entire
 * pipeline is deterministic modulo `producedAt` / `computedAt` /
 * `timestamp` (informational ISO timestamps).
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
 * The injected AuditLog defaults to createInMemoryAuditLog() so callers
 * that don't supply one still see audit events in the returned array.
 *
 * Synchronous contract: `decide()` returns the result synchronously
 * (the contract type is sync). The AuditLog itself is async, so the
 * engine enqueues the record call without awaiting — it constructs the
 * AuditEvent locally (id + timestamp) so callers see the event in the
 * response immediately, and the persistence call is fired-and-forget
 * (errors swallowed silently — audit recording MUST NEVER throw, per
 * the AuditLog contract).
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
import { createInMemoryAuditLog } from '@/platform/audit/AuditLog';
import type { AuditLog } from '@/platform/audit/AuditLog';

class DefaultDecisionEngine implements DecisionEngine {
  private readonly auditLog: AuditLog;

  constructor(auditLog?: AuditLog) {
    this.auditLog = auditLog ?? createInMemoryAuditLog();
  }

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

    // 7. Emit an audit event: "decision.computed".
    //    We synthesize id + timestamp locally so the caller sees the event
    //    synchronously. We then enqueue the audit-log record() call — the
    //    AuditLog will assign its own id/timestamp for persistence, which is
    //    acceptable: the audit array returned here is for the immediate
    //    response; the persisted record is for the long-term trail.
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

    // Fire-and-forget: persist to the audit log. Never throw from this path.
    // We include the persisted event id in the response payload for callers
    // that want to correlate later.
    const persistedPromise = this.auditLog
      .record({
        tenantId: auditEvent.tenantId,
        actor: auditEvent.actor,
        action: auditEvent.action,
        subjectId: auditEvent.subjectId,
        severity: auditEvent.severity,
        payload: { ...auditEvent.payload, responseEventId: auditEvent.id },
      })
      .catch((err: unknown) => {
        // Audit recording MUST NEVER throw (AuditLog contract). If the
        // underlying log fails despite its own safeguards, log to console
        // and continue — the response still carries the local event.
        console.warn('[DecisionEngine] auditLog.record failed:', err);
      });
    void persistedPromise;

    return {
      state,
      provenance,
      audit: [auditEvent],
    };
  }
}

/**
 * Factory — produces a fresh DecisionEngine with the supplied audit log
 * (or the in-memory default if none is supplied).
 */
export function createDecisionEngine(auditLog?: AuditLog): DecisionEngine {
  return new DefaultDecisionEngine(auditLog);
}
