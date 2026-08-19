/**
 * Nomos — Versioned Package Registry  (architecture §18–§20, RULE-005, RULE-009)
 * --------------------------------------------------
 * Extends the FROZEN `PackageRegistry` contract with:
 *
 *   - Versioning — multiple versions of the same package can coexist; the
 *     registry stores packages by `(packageId, version)` and exposes
 *     `listVersions`, `getPackageAtVersion`, `getRulesAtVersion`.
 *
 *   - Activation — at most one version of a package is "active" at a time;
 *     `activatePackage` / `deactivatePackage` / `getActiveVersion` /
 *     `getActivePackages` expose the activation state.
 *
 *   - Dependency resolution — `resolveDependencies` checks that every
 *     dependency exists at a version satisfying its declared range;
 *     `detectCycles` does a topological sort and reports any cycle paths.
 *
 *   - Historical evaluation — `getRulesAtVersion` returns the rules from a
 *     specific package version, enabling `evaluateHistorically` to pin
 *     exact package versions (per RULE-009, I13).
 *
 * NO vertical branching — the registry never special-cases a package by id.
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
import type { LoadedPackage } from '@/packages/loader';
import { createJurisdictionGraph } from '@/kernel/jurisdiction/JurisdictionGraph';
import { validatePackage } from '@/packages/PackageValidator';
import { satisfiesVersionRange, selectHighestVersion } from '@/packages/semver';
import { InvalidPackage, PackageNotFound, PackageVersionConflict, MissingDependency, DependencyConflict } from '@/kernel/errors';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResolvedDependency {
  packageId: string;
  version: string;
  versionRange: string;
  satisfied: boolean;
}

export interface ActivePackage {
  packageId: string;
  version: string;
  activatedAt: string;
  hash: string;
}

// ---------------------------------------------------------------------------
// Storage key — `(packageId, version)`
// ---------------------------------------------------------------------------
interface VersionedKey {
  packageId: string;
  version: string;
}

function keyOf(k: VersionedKey): string {
  return `${k.packageId}@${k.version}`;
}

// ---------------------------------------------------------------------------
// VersionedPackageRegistry
// ---------------------------------------------------------------------------
export class VersionedPackageRegistry implements PackageRegistryContract {
  /**
   * All loaded packages, indexed by `${packageId}@${version}`. The same
   * packageId may have multiple entries with different versions.
   */
  private readonly byKey: Map<string, LoadedPackage> = new Map();
  /**
   * Map from `packageId` → list of versions registered (insertion order).
   */
  private readonly versionsByPackage: Map<string, string[]> = new Map();
  /**
   * Map from `packageId` → currently-active version (string). Only one
   * version of a package may be active at a time (per I10).
   */
  private readonly activeVersion: Map<string, string> = new Map();
  /**
   * Map from `packageId` → activation metadata (timestamp + hash).
   */
  private readonly activationMeta: Map<string, { activatedAt: string; hash: string }> = new Map();
  /**
   * The unified jurisdiction graph assembled across ALL registered packages
   * (every version of every package contributes its jurisdictions + edges).
   * This matches the base PackageRegistry's contract.
   */
  private readonly _jurisdictionGraph: ReturnType<typeof createJurisdictionGraph>;

  constructor() {
    this._jurisdictionGraph = createJurisdictionGraph();
  }

  // ----- Package registration --------------------------------------------

  /**
   * Register a package at its declared version. Validates the package's
   * STRUCTURE (manifest, rules, dependencies-as-declared, etc.) but does NOT
   * cross-check that declared dependencies exist in the registry yet —
   * packages may be registered in any order, and dependency cross-checks are
   * performed separately by `resolveDependencies` (per section 20 gate 6).
   *
   * Throws `InvalidPackage` if structural validation fails (atomic — no
   * partial state). Idempotent: re-registering the same `(packageId, version)`
   * is a no-op if the content is identical; throws `PackageVersionConflict`
   * otherwise (per I10 — immutable after publication).
   */
  registerPackage(pkg: LoadedPackage): void {
    // Structural validation only — no registry cross-check (the registry may
    // not yet have the declared dependencies registered).
    const result = validatePackage(pkg);
    if (!result.valid) {
      throw new InvalidPackage(
        pkg.manifest.packageId,
        [`Cannot register: validation failed`, ...result.errors],
      );
    }
    const k = keyOf({ packageId: pkg.manifest.packageId, version: pkg.manifest.version });
    const existing = this.byKey.get(k);
    if (existing) {
      // Idempotent re-registration: compare by manifest hash.
      if (existing.manifest.verificationMetadata.hash !== pkg.manifest.verificationMetadata.hash) {
        throw new PackageVersionConflict(
          pkg.manifest.packageId,
          pkg.manifest.version,
          pkg.manifest.version,
        );
      }
      // Same content — no-op.
      return;
    }
    this.byKey.set(k, pkg);
    const versions = this.versionsByPackage.get(pkg.manifest.packageId) ?? [];
    versions.push(pkg.manifest.version);
    this.versionsByPackage.set(pkg.manifest.packageId, versions);

    // Feed jurisdictions + edges to the global graph.
    for (const j of pkg.jurisdictions) this._jurisdictionGraph.add(j);
    for (const e of pkg.jurisdictionEdges) this._jurisdictionGraph.addEdge(e);
  }

  /**
   * Activate a specific version of a package. The package must already be
   * registered AND its dependencies must be resolved (every dependency exists
   * at a satisfying version; no cycles). If a different version is currently
   * active, it remains active until the new activation succeeds — the swap is
   * atomic (no partially-switched state).
   *
   * Throws if:
   *   - the package version is not registered (PackageNotFound)
   *   - a dependency is missing (MissingDependency)
   *   - no satisfying dependency version exists (MissingDependency)
   *   - a dependency cycle is detected (DependencyConflict)
   *
   * (RULE-013, RULE-014)
   */
  activatePackage(packageId: string, version: string): void {
    const k = keyOf({ packageId: packageId, version });
    const pkg = this.byKey.get(k);
    if (!pkg) {
      throw new PackageNotFound(packageId, version);
    }

    // Dependency resolution — must succeed before activation.
    const deps = pkg.manifest.dependencies ?? [];
    for (const dep of deps) {
      const depVersions = this.listVersions(dep.packageId);
      if (depVersions.length === 0) {
        throw new MissingDependency(packageId, dep.packageId, dep.versionRange);
      }
      const satisfying = depVersions.filter((v) => satisfiesVersionRange(v, dep.versionRange));
      if (satisfying.length === 0) {
        throw new MissingDependency(packageId, dep.packageId, dep.versionRange);
      }
    }

    // Cycle detection — the activation graph must be acyclic.
    const cycles = this.detectCycles();
    if (cycles.length > 0) {
      throw new DependencyConflict(
        packageId,
        cycles[0]?.[0] ?? 'unknown',
        `Dependency cycle detected: ${cycles.map((c) => c.join(' → ')).join('; ')}`,
      );
    }

    // Atomic swap: save the current active version so we can restore it if
    // anything goes wrong. Since all checks above passed, the swap is safe.
    const previousVersion = this.activeVersion.get(packageId);
    this.activeVersion.set(packageId, version);
    this.activationMeta.set(packageId, {
      activatedAt: new Date().toISOString(),
      hash: pkg.manifest.verificationMetadata.hash,
    });
    // If we reach here, the activation succeeded. The previous version is
    // now superseded (not partially active alongside the new one).
    void previousVersion;
  }

  /** Deactivate a specific version. No-op if not currently active. */
  deactivatePackage(packageId: string, version: string): void {
    const current = this.activeVersion.get(packageId);
    if (current === version) {
      this.activeVersion.delete(packageId);
      this.activationMeta.delete(packageId);
    }
  }

  /** Returns the currently-active version of `packageId`, or undefined. */
  getActiveVersion(packageId: string): string | undefined {
    return this.activeVersion.get(packageId);
  }

  /** Returns all registered versions of `packageId` in insertion order. */
  listVersions(packageId: string): string[] {
    return [...(this.versionsByPackage.get(packageId) ?? [])];
  }

  /** Returns metadata for every currently-active package. */
  getActivePackages(): ActivePackage[] {
    const out: ActivePackage[] = [];
    for (const [packageId, version] of this.activeVersion) {
      const meta = this.activationMeta.get(packageId)!;
      out.push({
        packageId,
        version,
        activatedAt: meta.activatedAt,
        hash: meta.hash,
      });
    }
    return out;
  }

  // ----- Dependency resolution -------------------------------------------

  /**
   * Resolve every declared dependency of `(packageId, version)` against the
   * registry. Returns one `ResolvedDependency` per declared dependency, with
   * `satisfied: true` if a registered version satisfies the range.
   *
   * The active version is preferred if it satisfies; otherwise the highest
   * registered version that satisfies is the candidate. If no version
   * satisfies, `satisfied: false`.
   */
  resolveDependencies(packageId: string, version: string): ResolvedDependency[] {
    const pkg = this.getLoadedPackage(packageId, version);
    if (!pkg) return [];
    const out: ResolvedDependency[] = [];
    for (const dep of pkg.manifest.dependencies) {
      const activeVersion = this.activeVersion.get(dep.packageId);
      let candidateVersion: string | undefined;
      if (activeVersion && satisfiesVersionRange(activeVersion, dep.versionRange)) {
        candidateVersion = activeVersion;
      } else {
        // Pick the highest registered version satisfying the range — using
        // true SemVer precedence, not string comparison (RULE-015).
        const versions = this.listVersions(dep.packageId);
        const satisfying = versions.filter((v) => satisfiesVersionRange(v, dep.versionRange));
        candidateVersion = selectHighestVersion(satisfying) ?? undefined;
      }
      out.push({
        packageId: dep.packageId,
        version: candidateVersion ?? '',
        versionRange: dep.versionRange,
        satisfied: candidateVersion !== undefined,
      });
    }
    return out;
  }

  /**
   * Detect cycles in the package dependency graph. Returns an array of cycle
   * paths (each path is a list of `packageId`s, with the first id repeated at
   * the end to close the cycle). Empty array if no cycles.
   *
   * Topological-sort based (DFS with three colours: WHITE / GREY / BLACK).
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>(); // BLACK
    const inStack = new Set<string>(); // GREY
    const stack: string[] = [];

    // Collect all distinct (packageId, version) pairs.
    const allKeys: VersionedKey[] = [];
    for (const [k, pkg] of this.byKey) {
      allKeys.push({ packageId: pkg.manifest.packageId, version: pkg.manifest.version });
      void k;
    }

    const visit = (packageId: string, version: string): void => {
      const nodeKey = keyOf({ packageId, version });
      if (visited.has(nodeKey)) return;
      if (inStack.has(nodeKey)) {
        // Found a cycle — extract the cycle from the stack.
        const idx = stack.indexOf(nodeKey);
        if (idx !== -1) {
          const cycle = stack.slice(idx).concat([nodeKey]);
          cycles.push(cycle);
        }
        return;
      }
      inStack.add(nodeKey);
      stack.push(nodeKey);

      const pkg = this.byKey.get(nodeKey);
      if (pkg) {
        for (const dep of pkg.manifest.dependencies) {
          // Follow the active version (or the highest registered version) of
          // the dependency. If the dependency isn't registered, skip — that's
          // a separate "unsatisfied dependency" error, not a cycle.
          const activeVersion = this.activeVersion.get(dep.packageId);
          const versions = this.listVersions(dep.packageId);
          if (activeVersion && satisfiesVersionRange(activeVersion, dep.versionRange)) {
            visit(dep.packageId, activeVersion);
          } else {
            // Pick the highest registered version satisfying the range (SemVer).
            const satisfying = versions.filter((v) => satisfiesVersionRange(v, dep.versionRange));
            const best = selectHighestVersion(satisfying);
            if (best) visit(dep.packageId, best);
          }
        }
      }

      stack.pop();
      inStack.delete(nodeKey);
      visited.add(nodeKey);
    };

    for (const k of allKeys) visit(k.packageId, k.version);
    return cycles;
  }

  // ----- Historical evaluation ------------------------------------------

  /**
   * Return the rules from a specific package version. Throws
   * `PackageNotFound` if the (packageId, version) pair is not registered.
   *
   * Used by the HistoricalEvaluator to pin exact package versions when
   * evaluating past decisions (per RULE-009, I13).
   */
  getRulesAtVersion(packageId: string, version: string): Rule[] {
    const pkg = this.getLoadedPackage(packageId, version);
    if (!pkg) {
      throw new PackageNotFound(packageId, version);
    }
    return [...pkg.rules];
  }

  /**
   * Return the manifest for a specific package version, or undefined if not
   * registered.
   */
  getPackageAtVersion(packageId: string, version: string): PackageManifest | undefined {
    return this.byKey.get(keyOf({ packageId, version }))?.manifest;
  }

  /**
   * Return the full `LoadedPackage` for a specific version, or undefined.
   * Used by the HistoricalEvaluator to access the per-version rules,
   * authorities, sources, situations, procedures, actions, jurisdictions,
   * and evidence (per RULE-009, I13).
   */
  getLoadedPackageAtVersion(packageId: string, version: string): LoadedPackage | undefined {
    return this.byKey.get(keyOf({ packageId, version }));
  }

  // ----- PackageRegistry contract (FROZEN) ------------------------------

  get jurisdictionGraph(): JurisdictionGraph {
    return this._jurisdictionGraph;
  }

  /**
   * List manifests of currently-ACTIVE packages, optionally filtered by
   * category. If NO version of a package is active, that package is omitted
   * from the listing (callers should use `listVersions` to enumerate all
   * registered versions).
   */
  listPackages(category?: PackageManifest['category']): PackageManifest[] {
    const out: PackageManifest[] = [];
    for (const [packageId, version] of this.activeVersion) {
      const pkg = this.byKey.get(keyOf({ packageId, version }))!;
      if (category === undefined || pkg.manifest.category === category) {
        out.push(pkg.manifest);
      }
    }
    return out;
  }

  /**
   * Return the manifest of the currently-ACTIVE version of `packageId`, or
   * undefined if no version is active or the package is not registered.
   */
  getPackage(packageId: string): PackageManifest | undefined {
    const v = this.activeVersion.get(packageId);
    if (!v) return undefined;
    return this.byKey.get(keyOf({ packageId, version: v }))?.manifest;
  }

  /** Flatten rules from every ACTIVE package, optionally filtered. */
  listRules(packageId?: string): Rule[] {
    return this.flatMapActive(packageId, (p) => p.rules);
  }

  listSituations(packageId?: string): Situation[] {
    return this.flatMapActive(packageId, (p) => p.situations);
  }

  listProcedures(situationId?: string): Procedure[] {
    const all = this.flatMapActive(undefined, (p) => p.procedures);
    if (situationId === undefined) return all;
    return all.filter((p) => p.situationId === situationId);
  }

  listActions(packageId?: string): Action[] {
    return this.flatMapActive(packageId, (p) => p.actions);
  }

  listJurisdictions(packageId?: string): Jurisdiction[] {
    return this.flatMapActive(packageId, (p) => p.jurisdictions);
  }

  listAuthorities(packageId?: string): Authority[] {
    return this.flatMapActive(packageId, (p) => p.authorities);
  }

  listSources(packageId?: string): Source[] {
    return this.flatMapActive(packageId, (p) => p.sources);
  }

  listEvidence(): Evidence[] {
    return this.flatMapActive(undefined, (p) => p.evidence);
  }

  // ----- Internals ------------------------------------------------------

  private flatMapActive<T>(
    packageId: string | undefined,
    selector: (p: LoadedPackage) => T[],
  ): T[] {
    const out: T[] = [];
    const targets: string[] = packageId
      ? this.activeVersion.has(packageId)
        ? [packageId]
        : []
      : Array.from(this.activeVersion.keys());
    for (const pid of targets) {
      const v = this.activeVersion.get(pid)!;
      const pkg = this.byKey.get(keyOf({ packageId: pid, version: v }))!;
      for (const item of selector(pkg)) out.push(item);
    }
    return out;
  }

  private getLoadedPackage(packageId: string, version: string): LoadedPackage | undefined {
    return this.byKey.get(keyOf({ packageId, version }));
  }

  /**
   * Build a thin read-only view of this registry suitable for passing as
   * the `PackageRegistry` argument to `validatePackage(..., registry)` during
   * `registerPackage`. Avoids infinite recursion by NOT triggering further
   * validation.
   */
  private asRegistryForValidation(): PackageRegistryContract {
    // Arrow functions capture `this` lexically — no aliasing needed.
    return {
      jurisdictionGraph: this.jurisdictionGraph,
      listPackages: (cat?: PackageManifest['category']) => this.listPackages(cat),
      getPackage: (pid: string) => this.getPackage(pid),
      listRules: (pid?: string) => this.listRules(pid),
      listSituations: (pid?: string) => this.listSituations(pid),
      listProcedures: (sid?: string) => this.listProcedures(sid),
      listActions: (pid?: string) => this.listActions(pid),
      listJurisdictions: (pid?: string) => this.listJurisdictions(pid),
      listAuthorities: (pid?: string) => this.listAuthorities(pid),
      listSources: (pid?: string) => this.listSources(pid),
      listEvidence: () => this.listEvidence(),
    };
  }
}

// ---------------------------------------------------------------------------
// Factory — empty registry; caller registers packages explicitly.
// ---------------------------------------------------------------------------

/**
 * Build an empty `VersionedPackageRegistry`. Callers register packages
 * explicitly via `registerPackage` and activate versions via
 * `activatePackage`.
 *
 * This is the canonical constructor for the versioned registry. The legacy
 * `createPackageRegistry()` (in `src/packages/registry/PackageRegistry.ts`)
 * is unversioned — it returns every loaded package as "active" without
 * distinguishing versions. New code should use `createVersionedPackageRegistry`.
 */
export function createVersionedPackageRegistry(): VersionedPackageRegistry {
  return new VersionedPackageRegistry();
}

// Re-export the LoadedPackage type for convenience.
export type { LoadedPackage } from '@/packages/loader';
