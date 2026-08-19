/**
 * POST /api/context
 * UNDERSTAND family — build a ContextBundle from a ContextRequest.
 * Resolves jurisdictions, authorities, applicable rules, evidence, sources.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createPackageRegistry } from '@/packages/registry/PackageRegistry';
import { createContextBuilder } from '@/intelligence/context/ContextBuilder';
import { guardMutation } from '@/lib/auth/guards';
import type { ContextRequest } from '@/kernel/primitives/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await guardMutation(req);
  if (guard) return guard;

  let body: ContextRequest;
  try {
    body = (await req.json()) as ContextRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.subjectId || !body.asOf || !Array.isArray(body.facts) || !Array.isArray(body.jurisdictionIds)) {
    return NextResponse.json(
      { error: 'Missing required fields: subjectId, asOf, facts[], jurisdictionIds[]' },
      { status: 400 },
    );
  }

  const registry = createPackageRegistry();
  const contextBuilder = createContextBuilder();
  const bundle = contextBuilder.build(body, registry);

  return NextResponse.json(bundle);
}
