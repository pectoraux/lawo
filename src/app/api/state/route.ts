/**
 * POST /api/state
 * The primary endpoint — runs the full DecisionEngine pipeline:
 *   ContextBuilder → RuleEngine → StateEngine → ProvenanceBuilder → AuditLog
 * Returns the computed StateSnapshot, provenance chain, and audit events.
 *
 * Deterministic modulo informational timestamps (I5, I6, I13).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createPackageRegistry } from '@/packages/registry/PackageRegistry';
import { createDecisionEngine } from '@/intelligence/decision/DecisionEngine';
import { createDbAuditLog, createInMemoryAuditLog } from '@/platform/audit/AuditLog';
import type { ContextRequest, Fact } from '@/kernel/primitives/types';

export const dynamic = 'force-dynamic';

interface StateRequestBody {
  subjectId: string;
  asOf: string;                  // ISO date
  situationId?: string;
  facts: Fact[];
  jurisdictionIds: string[];
  objective?: string;
  tenantId?: string | null;
  persist?: boolean;             // if true, persist audit + decision record
}

export async function POST(req: NextRequest) {
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

  const contextRequest: ContextRequest = {
    subjectId: body.subjectId,
    asOf: body.asOf,
    situationId: body.situationId,
    facts: body.facts,
    jurisdictionIds: body.jurisdictionIds,
    objective: body.objective,
    tenantId: body.tenantId ?? null,
  };

  const result = decisionEngine.decide(contextRequest, registry);

  return NextResponse.json({
    state: result.state,
    provenance: result.provenance,
    audit: result.audit,
  });
}
