/**
 * POST /api/state
 * The primary endpoint — runs the full DecisionEngine pipeline:
 *   ContextBuilder → RuleEngine → StateEngine → ProvenanceBuilder → AuditLog
 * Returns the computed StateSnapshot, provenance chain, and audit events.
 *
 * DECISION INTEGRITY (Phase 3):
 *   The client sends a DecisionRequest: { subjectId, asOf, situationId, facts,
 *   jurisdictionIds, objective }. The server runs the DecisionEngine and
 *   produces the authoritative DecisionRecord fields (truthLevel, provenance,
 *   state, computedAt). The client CANNOT supply these fields.
 *
 *   If `persist: true`, the resulting DecisionRecord is saved server-side,
 *   scoped to the authenticated user's tenantId (NEVER a client-supplied tenantId).
 *
 * Deterministic modulo informational timestamps (I5, I6, I13).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createPackageRegistry } from '@/packages/registry/PackageRegistry';
import { createDecisionEngine } from '@/intelligence/decision/DecisionEngine';
import { createDbAuditLog, createInMemoryAuditLog } from '@/platform/audit/AuditLog';
import { requireUserWithScope } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { recordAuditBestEffort } from '@/lib/auth/audit';
import type { ContextRequest, Fact } from '@/kernel/primitives/types';

export const dynamic = 'force-dynamic';

interface StateRequestBody {
  subjectId: string;
  asOf: string;                  // ISO date
  situationId?: string;
  facts: Fact[];
  jurisdictionIds: string[];
  objective?: string;
  persist?: boolean;             // if true, persist the DecisionRecord server-side
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
  const auditLog = body.persist ? createDbAuditLog() : createInMemoryAuditLog();
  const decisionEngine = createDecisionEngine(auditLog);

  // The tenantId is derived from the authenticated session — NEVER from the
  // client. This is the core tenant-authorization enforcement.
  const contextRequest: ContextRequest = {
    subjectId: body.subjectId,
    asOf: body.asOf,
    situationId: body.situationId,
    facts: body.facts,
    jurisdictionIds: body.jurisdictionIds,
    objective: body.objective,
    tenantId: user.tenantId,
  };

  const result = decisionEngine.decide(contextRequest, registry);

  // If persist=true, save the DecisionRecord server-side. All authoritative
  // fields (truthLevel, provenance, state, computedAt) come from the engine,
  // not the client. The record is scoped to the caller's tenantId.
  if (body.persist && result.state.firedEffects.length > 0) {
    try {
      await db.decisionRecord.create({
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
      await recordAuditBestEffort({
        tenantId: user.tenantId,
        actor: user.email,
        action: 'decision.persist',
        subjectId: body.subjectId,
        severity: 'INFO',
        payload: {
          situationId: body.situationId ?? null,
          firedEffects: result.state.firedEffects.length,
          truthLevel: result.state.truthLevel,
        },
      });
    } catch (err) {
      // Persistence failure is non-fatal — the decision was still computed
      // and returned to the caller. Log and continue.
      console.error('[state] decision persistence failed:', err);
    }
  }

  return NextResponse.json({
    state: result.state,
    provenance: result.provenance,
    audit: result.audit,
  });
}
