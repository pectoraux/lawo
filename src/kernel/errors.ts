/**
 * Nomos — Typed Error Model  (architecture §23)
 * --------------------------------------------------
 * Explicit typed errors for the rule/package lifecycle. Each error identifies
 * the relevant package/rule when safe. Errors are NEVER swallowed in the
 * compiler/validator/registry — they propagate to the caller.
 */

/** Base class for all Nomos platform errors. */
export abstract class NomosError extends Error {
  abstract readonly code: string;
  cause?: unknown;
  details: string[];

  constructor(message: string, details?: string[], cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details ?? [];
    if (cause !== undefined) this.cause = cause;
  }
}

/** A RuleIR object failed validation. */
export class InvalidRuleIR extends NomosError {
  readonly code = 'INVALID_RULE_IR';
  ruleId?: string;

  constructor(ruleId: string | undefined, details: string[]) {
    super(`Invalid RuleIR${ruleId ? ` for rule ${ruleId}` : ''}`, details);
    this.ruleId = ruleId;
  }
}

/** A package failed validation. */
export class InvalidPackage extends NomosError {
  readonly code = 'INVALID_PACKAGE';
  packageId?: string;

  constructor(packageId: string | undefined, details: string[]) {
    super(`Invalid package${packageId ? ` ${packageId}` : ''}`, details);
    this.packageId = packageId;
  }
}

/** A package dependency is missing. */
export class MissingDependency extends NomosError {
  readonly code = 'MISSING_DEPENDENCY';

  constructor(
    public packageId: string,
    public missingPackageId: string,
    public versionRange?: string,
  ) {
    super(
      `Package ${packageId} depends on ${missingPackageId}` +
        (versionRange ? ` (${versionRange})` : '') +
        ' which is not registered',
    );
  }
}

/** Two packages have conflicting dependency version requirements. */
export class DependencyConflict extends NomosError {
  readonly code = 'DEPENDENCY_CONFLICT';

  constructor(
    public packageId: string,
    public conflictPackageId: string,
    detail: string,
  ) {
    super(
      `Dependency conflict: ${packageId} and ${conflictPackageId} require incompatible versions`,
      [detail],
    );
  }
}

/** Two versions of the same package are both marked active. */
export class PackageVersionConflict extends NomosError {
  readonly code = 'PACKAGE_VERSION_CONFLICT';

  constructor(
    public packageId: string,
    public version1: string,
    public version2: string,
  ) {
    super(`Package ${packageId} has conflicting active versions: ${version1} vs ${version2}`);
  }
}

/** Requested package was not found in the registry. */
export class PackageNotFound extends NomosError {
  readonly code = 'PACKAGE_NOT_FOUND';

  constructor(public packageId: string, public version?: string) {
    super(`Package ${packageId}${version ? `@${version}` : ''} not found`);
  }
}

/** Requested rule was not found. */
export class RuleNotFound extends NomosError {
  readonly code = 'RULE_NOT_FOUND';

  constructor(public ruleId: string) {
    super(`Rule ${ruleId} not found`);
  }
}

/** A temporal range is invalid (validTo <= validFrom, or malformed dates). */
export class InvalidTemporalRange extends NomosError {
  readonly code = 'INVALID_TEMPORAL_RANGE';

  constructor(
    public validFrom: string,
    public validTo?: string,
  ) {
    super(
      `Invalid temporal range: validFrom=${validFrom}` +
        (validTo ? `, validTo=${validTo}` : ''),
    );
  }
}

/** RuleIR compilation failed. */
export class CompilationError extends NomosError {
  readonly code = 'COMPILATION_ERROR';
  ruleId?: string;

  constructor(detail: string, ruleId?: string) {
    super(`Compilation error${ruleId ? ` for rule ${ruleId}` : ''}: ${detail}`, [detail]);
    this.ruleId = ruleId;
  }
}

/** Rule evaluation failed at runtime. */
export class EvaluationError extends NomosError {
  readonly code = 'EVALUATION_ERROR';
  ruleId?: string;

  constructor(detail: string, ruleId?: string) {
    super(`Evaluation error${ruleId ? ` for rule ${ruleId}` : ''}: ${detail}`, [detail]);
    this.ruleId = ruleId;
  }
}

/** Provenance construction failed. */
export class ProvenanceError extends NomosError {
  readonly code = 'PROVENANCE_ERROR';
  decisionId?: string;

  constructor(detail: string, decisionId?: string) {
    super(`Provenance error${decisionId ? ` for decision ${decisionId}` : ''}: ${detail}`, [detail]);
    this.decisionId = decisionId;
  }
}

/** Historical evaluation could not resolve the requested package/rule versions. */
export class HistoricalResolutionError extends NomosError {
  readonly code = 'HISTORICAL_RESOLUTION_ERROR';

  constructor(detail: string) {
    super(`Historical resolution error: ${detail}`, [detail]);
  }
}
