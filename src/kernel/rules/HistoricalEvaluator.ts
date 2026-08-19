/**
 * Nomos — Historical Evaluator  (architecture §14, §15; RULE-009; I13)
 * --------------------------------------------------
 * Evaluates a `ContextRequest` against EXACT package versions, NOT the
 * currently-active versions. This is the foundation of historical
 * reproducibility (per I13): a decision made last year must be reconstructable
 * today using the rule versions, facts, and package versions that existed then.
 *
 * If a requested version doesn't exist, throws `HistoricalResolutionError`.
 *
 * The HistoricalEvaluator is the ONLY path that guarantees historical
 * reproducibility — the regular `DecisionEngine.decide()` uses the currently-
 * active versions, which may change between calls.
 */

import type {
  Action,
  Authority,
  ContextRequest,
  Evidence,
  Jurisdiction,
  PackageManifest,
  Procedure,
  Provenance,
  Rule,
  Situation,
  Source,
  StateSnapshot,
  AuditEvent,
} from '@/kernel/primitives/types';
import type { PackageRegistry, JurisdictionGraph } from '@/kernel/contracts/contracts';
import type { VersionedPackageRegistry } from '@/packages/VersionedPackageRegistry';
import { createContextBuilder } from '@/intelligence/context/ContextBuilder';
import { createRuleEngine } from '@/kernel/rules/RuleEngine';
import { createStateEngine } from '@/kernel/state/StateEngine';
import { createProvenanceBuilder } from '@/kernel/provenance/ProvenanceBuilder';
import { createJurisdictionGraph } from '@/kernel/jurisdiction/JurisdictionGraph';
import { HistoricalResolutionError } from '@/kernel/errors';

/**
 * A pinned package version: "evaluate using exactly this version, even if a
 * newer version is currently active."
 */
export interface PinnedPackageVersion {
  packageId: string;
  version: string;
}

/**
 * Evaluate a request against pinned package versions. Returns the resulting
 * `StateSnapshot` + `Provenance[]` + `AuditEvent[]`.
 *
 * Algorithm:
 *   1. For every (packageId, version) in `packageVersions`: look up the
 *      full `LoadedPackage` via `getLoadedPackageAtVersion`. If any version
 *      doesn't exist, throw `HistoricalResolutionError`.
 *   2. Build a synthetic registry view exposing ONLY the pinned versions
 *      (so the ContextBuilder doesn't pick up newer versions).
 *   3. Run the standard pipeline: ContextBuilder → RuleEngine → StateEngine
 *      → ProvenanceBuilder.
 *
 * The pipeline is identical to the regular DecisionEngine; the only
 * difference is which package versions are visible to the ContextBuilder.
 */
export function evaluateHistorically(
  request: ContextRequest,
  registry: VersionedPackageRegistry,
  packageVersions: PinnedPackageVersion[],
): { state: StateSnapshot; provenance: Provenance[]; audit: AuditEvent[] } {
  // 1. Validate that every requested version exists, and collect the loaded
  //    packages so the pinned view can expose their contents.
  const pinnedLoaded: { pin: PinnedPackageVersion; pkg: NonNullable<ReturnType<VersionedPackageRegistry['getLoadedPackageAtVersion']>> }[] = [];
  for (const pin of packageVersions) {
    const pkg = registry.getLoadedPackageAtVersion(pin.packageId, pin.version);
    if (!pkg) {
      throw new HistoricalResolutionError(
        `Historical evaluation cannot resolve ${pin.packageId}@${pin.version} — version not registered`,
      );
    }
    pinnedLoaded.push({ pin, pkg });
  }

  // 2. Build a synthetic registry view exposing ONLY the pinned versions.
  const pinnedRegistry: PackageRegistry = new PinnedRegistryView(
    registry,
    pinnedLoaded.map((p) => p.pkg),
  );

  // 3. Standard pipeline.
  const decisionId = `historical:${request.subjectId}:${request.asOf}`;

  const contextBuilder = createContextBuilder();
  const bundle = contextBuilder.build(request, pinnedRegistry);

  const situation = request.situationId
    ? pinnedRegistry.listSituations().find((s) => s.id === request.situationId)
    : undefined;

  const ruleEngine = createRuleEngine();
  const rules = bundle.applicableRules;
  const evaluations = ruleEngine.evaluateAll(rules, request.facts, request.asOf);

  const stateEngine = createStateEngine();
  const state = stateEngine.compute(bundle, situation, rules, ruleEngine);

  const matchedRuleIds = new Set(
    evaluations.filter((e) => e.matched).map((e) => e.ruleId),
  );
  state.applicableRules = rules.filter((r) => matchedRuleIds.has(r.id));

  // RULE-008: build the packageVersions map for provenance from the pinned
  // versions (NOT from the registry's active packages).
  const packageVersionMap = new Map<string, string>();
  for (const pin of packageVersions) {
    packageVersionMap.set(pin.packageId, pin.version);
  }
  const provenanceBuilder = createProvenanceBuilder(packageVersionMap);
  const provenance = provenanceBuilder.build(
    decisionId,
    evaluations.filter((e) => e.matched),
    rules,
    bundle,
    request.asOf,
    state.truthLevel,
  );
  state.provenance = provenance;

  const auditEvent: AuditEvent = {
    id: `audit:${decisionId}`,
    tenantId: request.tenantId ?? null,
    actor: 'historical-evaluator',
    action: 'decision.historical',
    subjectId: request.subjectId,
    timestamp: new Date().toISOString(),
    severity: 'INFO',
    payload: {
      decisionId,
      subjectId: request.subjectId,
      asOf: request.asOf,
      pinnedPackageVersions: packageVersions,
      firedEffectCount: state.firedEffects.length,
      truthLevel: state.truthLevel,
    },
  };

  return { state, provenance, audit: [auditEvent] };
}

// ---------------------------------------------------------------------------
// PinnedRegistryView — exposes ONLY the pinned LoadedPackages via the
// PackageRegistry contract. The ContextBuilder uses this view and sees only
// the historically-pinned rules / jurisdictions / authorities / sources.
// ---------------------------------------------------------------------------

class PinnedRegistryView implements PackageRegistry {
  private readonly _pinnedJurisdictionGraph: JurisdictionGraph;

  constructor(
    private readonly inner: VersionedPackageRegistry,
    private readonly pinned: import('@/packages/loader').LoadedPackage[],
  ) {
    // Build a jurisdiction graph from ONLY the pinned packages — not the
    // registry-wide graph (which contains jurisdictions from ALL registered
    // versions). This ensures historical evaluation sees only the
    // jurisdiction state that existed at the pinned versions (RULE-012).
    const graph = createJurisdictionGraph();
    for (const pkg of pinned) {
      for (const j of pkg.jurisdictions) graph.add(j);
      for (const e of pkg.jurisdictionEdges) graph.addEdge(e);
    }
    this._pinnedJurisdictionGraph = graph;
  }

  get jurisdictionGraph() {
    return this._pinnedJurisdictionGraph;
  }

  listPackages(category?: PackageManifest['category']): PackageManifest[] {
    const out: PackageManifest[] = [];
    for (const pkg of this.pinned) {
      if (category === undefined || pkg.manifest.category === category) {
        out.push(pkg.manifest);
      }
    }
    return out;
  }

  getPackage(packageId: string): PackageManifest | undefined {
    return this.pinned.find((p) => p.manifest.packageId === packageId)?.manifest;
  }

  listRules(packageId?: string): Rule[] {
    const out: Rule[] = [];
    for (const pkg of this.targetPackages(packageId)) {
      for (const r of pkg.rules) out.push(r);
    }
    return out;
  }

  listSituations(packageId?: string): Situation[] {
    const out: Situation[] = [];
    for (const pkg of this.targetPackages(packageId)) {
      for (const s of pkg.situations) out.push(s);
    }
    return out;
  }

  listProcedures(situationId?: string): Procedure[] {
    const out: Procedure[] = [];
    for (const pkg of this.pinned) {
      for (const p of pkg.procedures) {
        if (situationId === undefined || p.situationId === situationId) out.push(p);
      }
    }
    return out;
  }

  listActions(packageId?: string): Action[] {
    const out: Action[] = [];
    for (const pkg of this.targetPackages(packageId)) {
      for (const a of pkg.actions) out.push(a);
    }
    return out;
  }

  listJurisdictions(packageId?: string): Jurisdiction[] {
    const out: Jurisdiction[] = [];
    for (const pkg of this.targetPackages(packageId)) {
      for (const j of pkg.jurisdictions) out.push(j);
    }
    return out;
  }

  listAuthorities(packageId?: string): Authority[] {
    const out: Authority[] = [];
    for (const pkg of this.targetPackages(packageId)) {
      for (const a of pkg.authorities) out.push(a);
    }
    return out;
  }

  listSources(packageId?: string): Source[] {
    const out: Source[] = [];
    for (const pkg of this.targetPackages(packageId)) {
      for (const s of pkg.sources) out.push(s);
    }
    return out;
  }

  listEvidence(): Evidence[] {
    const out: Evidence[] = [];
    for (const pkg of this.pinned) {
      for (const e of pkg.evidence) out.push(e);
    }
    return out;
  }

  // ----- Helpers ------------------------------------------------------

  private targetPackages(packageId?: string): import('@/packages/loader').LoadedPackage[] {
    if (packageId === undefined) return this.pinned;
    return this.pinned.filter((p) => p.manifest.packageId === packageId);
  }
}
