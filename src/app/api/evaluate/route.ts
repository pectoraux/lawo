/**
 * POST /api/evaluate
 * EVALUATE family — runs the deterministic RuleEngine over a fact set.
 * Returns per-rule evaluation results with calculation steps and fired effects.
 * Never invokes an LLM (I5).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createPackageRegistry } from '@/packages/registry/PackageRegistry';
import { createRuleEngine } from '@/kernel/rules/RuleEngine';
import { guardMutation } from '@/lib/auth/guards';
import type { Fact } from '@/kernel/primitives/types';

export const dynamic = 'force-dynamic';

interface EvaluateRequestBody {
  facts: Fact[];
  jurisdictionIds: string[];
  asOf: string;
  situationId?: string;
  packageId?: string;
}

export async function POST(req: NextRequest) {
  const guard = await guardMutation(req);
  if (guard) return guard;

  let body: EvaluateRequestBody;
  try {
    body = (await req.json()) as EvaluateRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.facts) || !body.asOf || !Array.isArray(body.jurisdictionIds)) {
    return NextResponse.json(
      { error: 'Missing required fields: facts[], asOf, jurisdictionIds[]' },
      { status: 400 },
    );
  }

  const registry = createPackageRegistry();

  // Resolve jurisdictions applicable as of the requested date
  const applicableJurisdictions = registry.jurisdictionGraph.applicableFor(body.jurisdictionIds, body.asOf);
  const applicableJurisdictionIds = new Set(applicableJurisdictions.map((j) => j.id));

  // Filter rules: in effect as of asOf AND jurisdiction matches AND optional package filter
  const allRules = registry.listRules(body.packageId);
  const candidateRules = allRules.filter((r) => {
    const inEffect = r.temporal.validFrom <= body.asOf && (r.temporal.validTo == null || body.asOf < r.temporal.validTo);
    const inScope = applicableJurisdictionIds.has(r.jurisdictionId);
    return inEffect && inScope;
  });

  const ruleEngine = createRuleEngine();
  const evaluations = ruleEngine.evaluateAll(candidateRules, body.facts, body.asOf);

  return NextResponse.json({
    asOf: body.asOf,
    requestedJurisdictionIds: body.jurisdictionIds,
    resolvedJurisdictions: applicableJurisdictions,
    evaluatedRuleCount: evaluations.length,
    evaluations,
  });
}
