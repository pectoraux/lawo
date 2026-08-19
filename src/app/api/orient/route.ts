/**
 * GET /api/orient
 * Returns the orientation overview — the entry point for the consumer UI.
 * Lists situations, packages, jurisdiction tree, planes, rule types,
 * truth levels, and demo presets. Domain-neutral (no vertical logic).
 *
 * NOTE: Identity is NOT included. The authoritative identity source is the
 * NextAuth session (DB-backed User table). The demo quick-login buttons in
 * the AuthGate use DEMO_ACCOUNTS from src/lib/auth/demoAccounts.ts directly —
 * that is a UI concern, not a platform concern. There is no duplicate identity
 * system (Phase 5 of the authorization sprint removed Identity.ts).
 */
import { NextResponse } from 'next/server';
import { createPackageRegistry } from '@/packages/registry/PackageRegistry';
import { TRUTH_LEVELS, TRUTH_LABEL, TRUTH_DESCRIPTION } from '@/kernel/truth/truth';
import type { PackageManifest, Situation, Jurisdiction, JurisdictionEdge, Authority, Source, Rule, Action, Procedure } from '@/kernel/primitives/types';

export const dynamic = 'force-static';

export function GET() {
  const registry = createPackageRegistry();

  const situations = registry.listSituations();
  const packages = registry.listPackages();
  const jurisdictions = registry.listJurisdictions();
  const jurisdictionEdges = registry.jurisdictionGraph.allEdges();
  const authorities = registry.listAuthorities();
  const sources = registry.listSources();
  const rules = registry.listRules();
  const actions = registry.listActions();
  const procedures = registry.listProcedures();

  const planes = [
    { id: 'experience', label: 'Experience Plane', description: 'Consumer / business / enterprise clients, web, mobile, API, conversational UI.' },
    { id: 'intelligence', label: 'Intelligence Plane', description: 'Context construction, state engine, rule engine, decision, optimization, agent runtime.' },
    { id: 'knowledge', label: 'Knowledge Plane', description: 'Entity, fact, jurisdiction, authority, rule, procedure, place, evidence, temporal graphs.' },
    { id: 'execution', label: 'Execution Plane', description: 'Government integrations, forms, filings, payments, notifications, document generation.' },
    { id: 'foundation', label: 'Platform Foundation', description: 'Multi-tenancy, identity, authorization, encryption, auditing, provenance, package registry.' },
  ];

  const ruleTypes = [
    { code: 'DETERMINISTIC', label: 'Deterministic', description: 'Pure rule, no interpretation needed. Output is fully reproducible.' },
    { code: 'CONDITIONAL', label: 'Conditional', description: 'Outcome depends on which conditions match; still deterministic.' },
    { code: 'DISCRETIONARY', label: 'Discretionary / Interpretive', description: 'Requires human interpretation. System never collapses this into a fact (§12).' },
    { code: 'PREDICTIVE', label: 'Predictive', description: 'Forecasted outcome. Never presented as a fact (I8).' },
  ];

  const truthLevels = TRUTH_LEVELS.map((code) => ({
    code,
    label: TRUTH_LABEL[code],
    description: TRUTH_DESCRIPTION[code],
  }));

  const response: OrientResponse = {
    situations,
    packages,
    jurisdictions,
    jurisdictionEdges,
    authorities,
    sources,
    rules: rules.map(stripRuleForListing),
    actions,
    procedures,
    planes,
    ruleTypes,
    truthLevels,
  };

  return NextResponse.json(response);
}

function stripRuleForListing(r: Rule) {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    type: r.type,
    truthLevel: r.truthLevel,
    jurisdictionId: r.jurisdictionId,
    authorityId: r.authorityId,
    sourceId: r.sourceId,
    packageId: r.packageId,
    temporal: r.temporal,
  };
}

interface OrientResponse {
  situations: Situation[];
  packages: PackageManifest[];
  jurisdictions: Jurisdiction[];
  jurisdictionEdges: JurisdictionEdge[];
  authorities: Authority[];
  sources: Source[];
  rules: ReturnType<typeof stripRuleForListing>[];
  actions: Action[];
  procedures: Procedure[];
  planes: { id: string; label: string; description: string }[];
  ruleTypes: { code: string; label: string; description: string }[];
  truthLevels: { code: string; label: string; description: string }[];
}
