/**
 * GET /api/packages
 * Lists all package manifests with their rule/situation/procedure/action counts.
 */
import { NextResponse } from 'next/server';
import { createPackageRegistry } from '@/packages/registry/PackageRegistry';

export const dynamic = 'force-static';

export function GET() {
  const registry = createPackageRegistry();
  const manifests = registry.listPackages();

  const packages = manifests.map((m) => {
    const rules = registry.listRules(m.packageId);
    const situations = registry.listSituations(m.packageId);
    const procedures = registry.listProcedures();
    const actions = registry.listActions(m.packageId);
    const jurisdictions = registry.listJurisdictions(m.packageId);
    const authorities = registry.listAuthorities(m.packageId);
    const sources = registry.listSources(m.packageId);

    return {
      manifest: m,
      counts: {
        rules: rules.length,
        situations: situations.length,
        procedures: procedures.filter((p) => situations.some((s) => s.id === p.situationId)).length,
        actions: actions.length,
        jurisdictions: jurisdictions.length,
        authorities: authorities.length,
        sources: sources.length,
      },
      rules: rules.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        type: r.type,
        truthLevel: r.truthLevel,
        jurisdictionId: r.jurisdictionId,
      })),
      situations: situations.map((s) => ({ id: s.id, code: s.code, label: s.label, description: s.description })),
      actions: actions.map((a) => ({ id: a.id, code: a.code, label: a.label, kind: a.kind })),
      jurisdictions: jurisdictions.map((j) => ({ id: j.id, code: j.code, name: j.name, kind: j.kind })),
    };
  });

  return NextResponse.json({ packages });
}
