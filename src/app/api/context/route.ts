/**
 * POST /api/context
 * UNDERSTAND family — build a ContextBundle from a ContextRequest.
 * Resolves jurisdictions, authorities, applicable rules, evidence, sources.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createPackageRegistry } from '@/packages/registry/PackageRegistry';
import { createContextBuilder } from '@/intelligence/context/ContextBuilder';
import { requireUserWithScope } from '@/lib/auth/guards';
import type { ContextRequest } from '@/kernel/primitives/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { user, response } = await requireUserWithScope(req);
  if (response) return response;

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
  // Override tenantId with the session's tenant — never trust the client.
  const scopedRequest: ContextRequest = { ...body, tenantId: user.tenantId };
  const bundle = contextBuilder.build(scopedRequest, registry);

  return NextResponse.json(bundle);
}
