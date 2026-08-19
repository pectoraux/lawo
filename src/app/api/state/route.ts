/**
 * POST /api/state
 * The primary endpoint — runs the full DecisionEngine pipeline:
 *   ContextBuilder → RuleEngine → StateEngine → ProvenanceBuilder → AuditLog
 * Returns the computed StateSnapshot, provenance chain, and audit events.
 *
 * DECISION INTEGRITY (ADR 0013):
 *   The client sends a DecisionRequest: { subjectId, asOf, situationId, facts,
 *   jurisdictionIds, objective }. The server runs the DecisionEngine and
 *   produces the authoritative DecisionRecord fields (truthLevel, provenance,
 *   state, computedAt). The client CANNOT supply these fields.
 *
 * FACT INGESTION CONTRACT (ADR 0017):
 *   API-supplied facts are UNTRUSTED INPUT. The server normalizes every
 *   submitted fact's `tenantId` to the authenticated session's tenantId.
 *   A tenant-A user cannot manufacture facts that claim to belong to tenant B.
 *   The fact's `truthLevel` is preserved (the caller may assert a fact at T0
 *   if they have authoritative evidence; the engine and UI surface this).
 *
 * TRANSACTIONAL PERSISTENCE (ADR 0017):
 *   When `persist: true`, the decision record AND its durable audit event are
 *   persisted as a unit. If either fails, the API returns an error — it does
 *   NOT silently return HTTP 200 while persistence failed. The response
 *   explicitly distinguishes:
 *     - computed successfully (persist=false)
 *     - computed + persisted durably (persist=true, success)
 *     - computed but persistence failed (persist=true, failure → HTTP 500)
 *
 * Deterministic modulo informational timestamps (I5, I6, I13).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createPackageRegistry } from '@/packages/registry/PackageRegistry';
import { createDecisionEngine } from '@/intelligence/decision/DecisionEngine';
import { requireUserWithScope } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/auth/audit';
import type { ContextRequest, Fact } from '@/kernel/primitives/types';

export const dynamic = 'force-dynamic';

interface StateRequestBody {
  subjectId: string;
  asOf: string;                  // ISO date
  situationId?: string;
  facts: Fact[];
  jurisdictionIds: string[];
  objective?: string;
  persist?: boolean;             // if true, persist the DecisionRecord + durable audit
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireUserWithScope(req);
  if (response) return response;

  let body: StateRequestBody;
  try {
    body = (await req.json()) as StateRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  if (!body.subjectId || !body.asOf || !Array.isArray(body.facts) || !Array.isArray(body.jurisdictionIds)) {
    return NextResponse.json(
      { error: 'Missing required fields: subjectId, asOf, facts[], jurisdictionIds[]' },
      { status: 400 },
    );
  }

  const registry = createPackageRegistry();
  const decisionEngine = createDecisionEngine();

  // FACT NORMALIZATION (ADR 0017): API-supplied facts are untrusted input.
  // Override every fact's tenantId with the session's tenantId so a caller
  // cannot manufacture facts that claim to belong to another tenant.
  // The fact's truthLevel, attribute, value, and observedAt are preserved —
  // the caller may assert a fact at any truth level; the engine and UI
  // surface this transparently.
  const normalizedFacts: Fact[] = body.facts.map((f) => ({
    ...f,
    tenantId: user.tenantId,
    subjectId: body.subjectId, // facts are about the request's subject
  }));

  // The tenantId is derived from the authenticated session — NEVER from the
  // client. This is the core tenant-authorization enforcement.
  const contextRequest: ContextRequest = {
    subjectId: body.subjectId,
    asOf: body.asOf,
    situationId: body.situationId,
    facts: normalizedFacts,
    jurisdictionIds: body.jurisdictionIds,
    objective: body.objective,
    tenantId: user.tenantId,
  };

  const result = decisionEngine.decide(contextRequest, registry);

  // If persist=true, persist the decision record + durable audit transactionally.
  // If either fails, return an error — do NOT silently return success.
  let persisted = false;
  let persistenceError: string | null = null;
  if (body.persist && result.state.firedEffects.length > 0) {
    try {
      // 1. Persist the DecisionRecord.
      const record = await db.decisionRecord.create({
        data: {
          decisionId: result.state.provenance[0]?.decisionId ?? `dec_${Date.now()}`,
          subjectId: body.subjectId,
          situationId: body.situationId ?? null,
          stateJson: JSON.parse(JSON.stringify(result.state)) as object,
          provenanceJson: JSON.parse(JSON.stringify(result.provenance)) as object,
          asOf: new Date(body.asOf),
          computedAt: new Date(result.state.computedAt),
          truthLevel: result.state.truthLevel,
          tenantId: user.tenantId,
        },
      });

      // 2. Persist the durable audit event. If this fails, roll back the
      //    decision record so we don't have an un-audited persisted decision.
      try {
        await recordAudit({
          tenantId: user.tenantId,
          actor: user.email,
          action: 'decision.persist',
          subjectId: body.subjectId,
          severity: 'INFO',
          payload: {
            decisionRecordId: record.id,
            decisionId: record.decisionId,
            situationId: body.situationId ?? null,
            firedEffects: result.state.firedEffects.length,
            truthLevel: result.state.truthLevel,
          },
        });
        persisted = true;
      } catch (auditErr) {
        // Durable audit failed — roll back the decision record.
        await db.decisionRecord.delete({ where: { id: record.id } }).catch(() => {});
        console.error('[state] durable audit failed — rolled back decision record:', auditErr);
        persistenceError = 'Audit persistence failed — the decision was not persisted.';
      }
    } catch (err) {
      console.error('[state] decision persistence failed:', err);
      persistenceError = err instanceof Error ? err.message : 'Decision persistence failed.';
    }

    if (persistenceError) {
      return NextResponse.json(
        {
          error: 'Decision was computed but could not be persisted durably.',
          detail: persistenceError,
          state: result.state,
          provenance: result.provenance,
          audit: result.audit,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    state: result.state,
    provenance: result.provenance,
    audit: result.audit,
    persisted,
  });
}
