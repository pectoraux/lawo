/**
 * Nomos — Package Validator  (architecture §18–§20, RULE-004)
 * --------------------------------------------------
 * A PURE, deterministic validator that rejects malformed `LoadedPackage`
 * instances before they can enter an active registry. Mirrors the 10-point
 * quality gate from `package-spec/manifest-spec.md` (subset checkable at
 * load time — runtime gate 4 "deterministic tests" and gate 5 "regression
 * fixtures" are run separately by the test runner).
 *
 * No IO, no LLM. The validator is a pure function over its inputs.
 *
 * Validation covers:
 *   - Manifest required fields (packageId, name, version, category, description)
 *   - version is a valid semver string (e.g., "1.0.0", "1.2.3-beta+exp")
 *   - category is one of JURISDICTION | DOMAIN | SITUATION | CAPABILITY
 *   - Every dependency references a package that exists (if registry provided)
 *   - Every dependency's version range can be satisfied (if registry provided)
 *   - Every rule has a valid jurisdictionId (in package or dependency)
 *   - Every rule has a valid authorityId
 *   - Every rule has a valid sourceId
 *   - Every rule passes validateRule()
 *   - No duplicate rule IDs within the package
 *   - No duplicate jurisdiction codes within the package
 *   - verificationMetadata has signedBy, signedAt, hash (all non-empty)
 *
 * "No partially valid package" — if ANY validation fails, the whole package
 * is invalid (per section 20). All errors are collected and returned.
 */

import type {
  Authority,
  Jurisdiction,
  PackageCategory,
  PackageManifest,
  Rule,
  Source,
} from '@/kernel/primitives/types';
import type { LoadedPackage } from '@/packages/loader';
import type { PackageRegistry } from '@/kernel/contracts/contracts';
import { validateRule } from '@/kernel/rules/RuleIRValidator';
import { isValidSemver, satisfiesVersionRange } from '@/packages/semver';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------
export interface PackageValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Allowed sets
// ---------------------------------------------------------------------------
const ALLOWED_CATEGORIES: ReadonlySet<PackageCategory> = new Set<PackageCategory>([
  'JURISDICTION',
  'DOMAIN',
  'SITUATION',
  'CAPABILITY',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a `LoadedPackage`. If `registry` is provided, dependency references
 * are also checked against the registry (the package must resolve every
 * dependency against a registered manifest at a satisfying version).
 *
 * The validator is PURE: same inputs → same result (per I5, I13).
 */
export function validatePackage(
  pkg: LoadedPackage,
  registry?: PackageRegistry,
): PackageValidationResult {
  const errors: string[] = [];
  const manifest = pkg.manifest;

  // ----- Manifest required fields ----------------------------------------
  if (!isNonEmptyString(manifest.packageId)) {
    errors.push('manifest.packageId must be a non-empty string');
  }
  if (!isNonEmptyString(manifest.name)) {
    errors.push('manifest.name must be a non-empty string');
  }
  if (!isNonEmptyString(manifest.version)) {
    errors.push('manifest.version must be a non-empty string');
  } else if (!isValidSemver(manifest.version)) {
    errors.push(
      `manifest.version (${manifest.version}) is not a valid semver string (expected MAJOR.MINOR.PATCH)`,
    );
  }
  if (typeof manifest.category !== 'string' || !ALLOWED_CATEGORIES.has(manifest.category)) {
    errors.push(
      `manifest.category must be one of ${[...ALLOWED_CATEGORIES].join('|')}, got ${JSON.stringify(manifest.category)}`,
    );
  }
  if (!isNonEmptyString(manifest.description)) {
    errors.push('manifest.description must be a non-empty string');
  }

  // ----- verificationMetadata --------------------------------------------
  const vm = manifest.verificationMetadata;
  if (vm === null || typeof vm !== 'object') {
    errors.push('manifest.verificationMetadata must be an object');
  } else {
    if (!isNonEmptyString(vm.signedBy)) {
      errors.push('manifest.verificationMetadata.signedBy must be a non-empty string');
    }
    if (!isNonEmptyString(vm.signedAt)) {
      errors.push('manifest.verificationMetadata.signedAt must be a non-empty string');
    }
    if (!isNonEmptyString(vm.hash)) {
      errors.push('manifest.verificationMetadata.hash must be a non-empty string');
    }
  }

  // ----- Dependencies ---------------------------------------------------
  if (!Array.isArray(manifest.dependencies)) {
    errors.push('manifest.dependencies must be an array');
  } else {
    for (let i = 0; i < manifest.dependencies.length; i++) {
      const dep = manifest.dependencies[i]!;
      if (!isNonEmptyString(dep.packageId)) {
        errors.push(`manifest.dependencies[${i}].packageId must be a non-empty string`);
      }
      if (!isNonEmptyString(dep.versionRange)) {
        errors.push(`manifest.dependencies[${i}].versionRange must be a non-empty string`);
      }
    }
    // If a registry is provided, verify each dependency resolves.
    if (registry) {
      for (const dep of manifest.dependencies) {
        const depManifest = registry.getPackage(dep.packageId);
        if (!depManifest) {
          errors.push(
            `dependency '${dep.packageId}' (range ${dep.versionRange}) is not registered`,
          );
          continue;
        }
        if (!satisfiesVersionRange(depManifest.version, dep.versionRange)) {
          errors.push(
            `dependency '${dep.packageId}' version ${depManifest.version} does not satisfy range ${dep.versionRange}`,
          );
        }
      }
    }
  }

  // ----- Index package contents for cross-validation --------------------
  const jurisdictionIds = new Set<string>(pkg.jurisdictions.map((j: Jurisdiction) => j.id));
  const jurisdictionCodes = new Set<string>();
  const authorityIds = new Set<string>(pkg.authorities.map((a: Authority) => a.id));
  const sourceIds = new Set<string>(pkg.sources.map((s: Source) => s.id));

  // Include dependency jurisdictions/authorities/sources if a registry is provided.
  if (registry) {
    for (const dep of manifest.dependencies) {
      for (const j of registry.listJurisdictions(dep.packageId)) jurisdictionIds.add(j.id);
      for (const a of registry.listAuthorities(dep.packageId)) authorityIds.add(a.id);
      for (const s of registry.listSources(dep.packageId)) sourceIds.add(s.id);
    }
  }

  // ----- Duplicate jurisdiction codes within package --------------------
  for (const j of pkg.jurisdictions) {
    if (jurisdictionCodes.has(j.code)) {
      errors.push(`duplicate jurisdiction code '${j.code}' within package ${manifest.packageId}`);
    } else {
      jurisdictionCodes.add(j.code);
    }
  }

  // ----- Rules ----------------------------------------------------------
  const ruleIds = new Set<string>();
  for (const rule of pkg.rules) {
    if (ruleIds.has(rule.id)) {
      errors.push(`duplicate rule id '${rule.id}' within package ${manifest.packageId}`);
    } else {
      ruleIds.add(rule.id);
    }

    // Rule-level validation (uses the kernel's RuleIRValidator).
    const ruleResult = validateRule(rule);
    if (!ruleResult.valid) {
      for (const e of ruleResult.errors) {
        errors.push(`rule '${rule.id}': ${e}`);
      }
    }

    // Cross-reference checks: jurisdictionId / authorityId / sourceId.
    if (isNonEmptyString(rule.jurisdictionId) && !jurisdictionIds.has(rule.jurisdictionId)) {
      errors.push(
        `rule '${rule.id}' references unknown jurisdictionId '${rule.jurisdictionId}'`,
      );
    }
    if (isNonEmptyString(rule.authorityId) && !authorityIds.has(rule.authorityId)) {
      errors.push(
        `rule '${rule.id}' references unknown authorityId '${rule.authorityId}'`,
      );
    }
    if (isNonEmptyString(rule.sourceId) && !sourceIds.has(rule.sourceId)) {
      errors.push(
        `rule '${rule.id}' references unknown sourceId '${rule.sourceId}'`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
