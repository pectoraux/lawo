/**
 * Nomos — Package Registry  (architecture §18, §19, §35)
 * -------------------------------------------------------
 * Concrete implementation of the FROZEN PackageRegistry interface from
 * @/kernel/contracts/contracts. Consumes the LoadedPackage[] produced by
 * @/packages/loader and builds a global JurisdictionGraph (from
 * @/kernel/jurisdiction/JurisdictionGraph) populated with every jurisdiction
 * + edge from every loaded package.
 *
 * Contract (FROZEN — see @/kernel/contracts/contracts):
 *   listPackages(category?)           — filter by category
 *   getPackage(packageId)             — return manifest by id
 *   listRules(packageId?)             — flatten + optional filter
 *   listSituations(packageId?)        — flatten + optional filter
 *   listProcedures(situationId?)      — flatten + optional filter by situation
 *   listActions(packageId?)           — flatten + optional filter
 *   listJurisdictions(packageId?)     — flatten + optional filter
 *   listAuthorities(packageId?)       — flatten + optional filter
 *   listSources(packageId?)           — flatten + optional filter
 *   listEvidence()                    — flatten across all packages
 *   jurisdictionGraph                — global JurisdictionGraph getter
 *
 * The JurisdictionGraph is the FROZEN contract surface implemented at
 * @/kernel/jurisdiction/JurisdictionGraph (Task 4). The registry instantiates
 * it via the createJurisdictionGraph() factory and feeds it every jurisdiction
 * + edge from every loaded package. Cross-package lineage edges (e.g., the
 * ECOWAS package owning the DERIVES_FROM edges that link jur.ghana and
 * jur.togo to jur.ecowas) assemble correctly because the graph is global.
 */
import type {
  Action,
  Authority,
  Evidence,
  Jurisdiction,
  JurisdictionEdge,
  PackageManifest,
  Procedure,
  Rule,
  Situation,
  Source,
} from '@/kernel/primitives/types';
import type {
  JurisdictionGraph,
  PackageRegistry as PackageRegistryContract,
} from '@/kernel/contracts/contracts';
import { createJurisdictionGraph } from '@/kernel/jurisdiction/JurisdictionGraph';
import { loadBuiltinPackages, type LoadedPackage } from '@/packages/loader';

// ============================================================================
// PackageRegistry — concrete implementation of the FROZEN contract.
// ============================================================================
export class PackageRegistry implements PackageRegistryContract {
  private readonly packages: LoadedPackage[];
  private readonly byId: Map<string, LoadedPackage>;
  private readonly _jurisdictionGraph: JurisdictionGraph;

  constructor(packages: LoadedPackage[]) {
    this.packages = packages;
    this.byId = new Map(packages.map((p) => [p.manifest.packageId, p]));

    // Build the global JurisdictionGraph from every package's jurisdictions +
    // edges. The graph assembles cross-package lineage edges (e.g., the
    // ECOWAS package owns the DERIVES_FROM edges that link jur.ghana and
    // jur.togo to jur.ecowas — see src/lib/packages-data/ecowas-jurisdiction.ts;
    // the AfCFTA package owns the DERIVES_FROM edges from jur.ecowas, jur.ghana,
    // and jur.togo to jur.afcfta — see src/lib/packages-data/afcfta-jurisdiction.ts).
    const graph = createJurisdictionGraph();
    for (const pkg of packages) {
      for (const j of pkg.jurisdictions) graph.add(j);
      for (const e of pkg.jurisdictionEdges) graph.addEdge(e);
    }
    this._jurisdictionGraph = graph;
  }

  get jurisdictionGraph(): JurisdictionGraph {
    return this._jurisdictionGraph;
  }

  // ----- Package manifests -------------------------------------------------
  listPackages(category?: PackageManifest['category']): PackageManifest[] {
    if (category === undefined) {
      return this.packages.map((p) => p.manifest);
    }
    return this.packages
      .filter((p) => p.manifest.category === category)
      .map((p) => p.manifest);
  }

  getPackage(packageId: string): PackageManifest | undefined {
    return this.byId.get(packageId)?.manifest;
  }

  // ----- Knowledge artefacts (flattened across packages) ------------------
  listRules(packageId?: string): Rule[] {
    if (packageId === undefined) {
      return this.packages.flatMap((p) => p.rules);
    }
    return this.byId.get(packageId)?.rules ?? [];
  }

  listSituations(packageId?: string): Situation[] {
    if (packageId === undefined) {
      return this.packages.flatMap((p) => p.situations);
    }
    return this.byId.get(packageId)?.situations ?? [];
  }

  listProcedures(situationId?: string): Procedure[] {
    const all = this.packages.flatMap((p) => p.procedures);
    if (situationId === undefined) return all;
    return all.filter((proc) => proc.situationId === situationId);
  }

  listActions(packageId?: string): Action[] {
    if (packageId === undefined) {
      return this.packages.flatMap((p) => p.actions);
    }
    return this.byId.get(packageId)?.actions ?? [];
  }

  listJurisdictions(packageId?: string): Jurisdiction[] {
    if (packageId === undefined) {
      return this.packages.flatMap((p) => p.jurisdictions);
    }
    return this.byId.get(packageId)?.jurisdictions ?? [];
  }

  listAuthorities(packageId?: string): Authority[] {
    if (packageId === undefined) {
      return this.packages.flatMap((p) => p.authorities);
    }
    return this.byId.get(packageId)?.authorities ?? [];
  }

  listSources(packageId?: string): Source[] {
    if (packageId === undefined) {
      return this.packages.flatMap((p) => p.sources);
    }
    return this.byId.get(packageId)?.sources ?? [];
  }

  listEvidence(): Evidence[] {
    return this.packages.flatMap((p) => p.evidence);
  }
}

// ============================================================================
// Factory — single entry point used by the API layer / engines.
// ============================================================================
/**
 * Build a PackageRegistry pre-populated with every built-in package data module
 * under src/lib/packages-data. This is the canonical constructor for the
 * platform's in-process registry; alternative constructors could load packages
 * from disk or a remote registry (out of scope for this task).
 */
export function createPackageRegistry(): PackageRegistry {
  return new PackageRegistry(loadBuiltinPackages());
}
