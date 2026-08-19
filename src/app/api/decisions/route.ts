/**
 * GET /api/decisions?subjectId=X&limit=20
 * POST /api/decisions { decisionId, subjectId, situationId, state, provenance, asOf, truthLevel }
 *
 * Persists a DecisionRecord via Prisma (architecture §35 audit contract).
 * GET reads the recent decisions for a subject (or all if no subjectId).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { StateSnapshot, Provenance } from '@/kernel/primitives/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subjectId');
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 20)) : 20;

  try {
    const records = await db.decisionRecord.findMany({
      where: subjectId ? { subjectId } : undefined,
      orderBy: { computedAt: 'desc' },
      take: limit,
    });
    const decisions = records.map((r) => ({
      id: r.id,
      decisionId: r.decisionId,
      subjectId: r.subjectId,
      situationId: r.situationId,
      asOf: r.asOf,
      computedAt: r.computedAt,
      truthLevel: r.truthLevel,
      state: JSON.parse(r.stateJson) as StateSnapshot,
      provenance: JSON.parse(r.provenanceJson) as Provenance[],
    }));
    return NextResponse.json({ decisions, count: decisions.length });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read decisions', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

interface SaveDecisionBody {
  decisionId: string;
  subjectId: string;
  situationId?: string;
  state: StateSnapshot;
  provenance: Provenance[];
  asOf: string;
  truthLevel: string;
  tenantId?: string | null;
}

export async function POST(req: NextRequest) {
  let body: SaveDecisionBody;
  try {
    body = (await req.json()) as SaveDecisionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.decisionId || !body.subjectId || !body.state || !body.asOf) {
    return NextResponse.json(
      { error: 'Missing required fields: decisionId, subjectId, state, asOf' },
      { status: 400 },
    );
  }

  try {
    const record = await db.decisionRecord.create({
      data: {
        decisionId: body.decisionId,
        subjectId: body.subjectId,
        situationId: body.situationId ?? null,
        stateJson: JSON.stringify(body.state),
        provenanceJson: JSON.stringify(body.provenance),
        asOf: new Date(body.asOf),
        computedAt: new Date(body.state.computedAt),
        truthLevel: body.truthLevel,
        tenantId: body.tenantId ?? null,
      },
    });
    return NextResponse.json({ saved: true, id: record.id });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to persist decision', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
