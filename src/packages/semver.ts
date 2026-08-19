/**
 * Nomos — Shared SemVer Utility  (architecture §19, Deliverable F)
 * --------------------------------------------------
 * The ONE canonical SemVer implementation used by both PackageValidator
 * and VersionedPackageRegistry. No duplicated version logic.
 *
 * Implements SemVer 2.0.0 precedence rules:
 *   - Major.Minor.Patch numeric comparison
 *   - A version WITHOUT prerelease > a version WITH prerelease (1.0.0 > 1.0.0-alpha)
 *   - Prerelease identifiers compared element by element:
 *     - numeric identifiers compared numerically (10 > 2)
 *     - alphanumeric identifiers compared lexically (alpha < beta)
 *     - numeric > alphanumeric (1 > alpha)
 *   - Build metadata is IGNORED for precedence (per SemVer spec)
 *
 * Range format (subset of npm):
 *   ^1.2.3   compatible-with: same major, >= 1.2.3 and < 2.0.0
 *   ~1.2.3   patch-only: same major+minor, >= 1.2.3 and < 1.3.0
 *   1.2.3    exact match
 *   >=1.2.3  greater-than-or-equal
 *   >1.2.3   greater-than
 *   <=1.2.3  less-than-or-equal
 *   <1.2.3   less-than
 *   *        any version
 */

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[] | null; // split by '.', e.g. ['alpha', '10']
  build: string | null;        // ignored for precedence
}

/** Parse a SemVer string. Returns null if malformed. */
export function parseSemver(v: string): ParsedSemver | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(SEMVER_RE);
  if (!m) return null;
  return {
    major: parseInt(m[1]!, 10),
    minor: parseInt(m[2]!, 10),
    patch: parseInt(m[3]!, 10),
    prerelease: m[4] ? m[4].split('.') : null,
    build: m[5] ?? null,
  };
}

/** Check if a string is a valid SemVer. */
export function isValidSemver(v: string): boolean {
  return parseSemver(v) !== null;
}

/**
 * Compare two parsed SemVer versions. Returns:
 *   -1 if a < b
 *    0 if a === b
 *    1 if a > b
 *
 * Build metadata is IGNORED (per SemVer 2.0.0 §10).
 */
export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  // 1. Major
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  // 2. Minor
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  // 3. Patch
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  // 4. Prerelease
  // A version WITHOUT prerelease > a version WITH prerelease.
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && !b.prerelease) return 0;

  // Both have prerelease — compare element by element.
  const aPre = a.prerelease!;
  const bPre = b.prerelease!;
  const maxLen = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < maxLen; i++) {
    const aPart = aPre[i];
    const bPart = bPre[i];

    // Shorter prerelease < longer (when all preceding parts are equal).
    if (aPart === undefined && bPart !== undefined) return -1;
    if (aPart !== undefined && bPart === undefined) return 1;

    // Both are defined — compare.
    const aNum = /^\d+$/.test(aPart!) ? parseInt(aPart!, 10) : NaN;
    const bNum = /^\d+$/.test(bPart!) ? parseInt(bPart!, 10) : NaN;

    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      // Both numeric — compare numerically (10 > 2).
      if (aNum !== bNum) return aNum > bNum ? 1 : -1;
    } else if (!Number.isNaN(aNum) && Number.isNaN(bNum)) {
      // Numeric > alphanumeric (per SemVer spec).
      return 1;
    } else if (Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      // Alphanumeric < numeric.
      return -1;
    } else {
      // Both alphanumeric — compare lexically.
      if (aPart !== bPart) return aPart! < bPart! ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Compare two SemVer strings. Returns:
 *   -1 if a < b
 *    0 if a === b
 *    1 if a > b
 * Returns null if either version is malformed.
 */
export function compareSemverStrings(a: string, b: string): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  return compareSemver(pa, pb);
}

/**
 * Check if a concrete `version` satisfies a `range`.
 * Range format: ^1.2.3, ~1.2.3, 1.2.3, >=1.2.3, >1.2.3, <=1.2.3, <1.2.3, *
 * Returns false if the range is malformed or the version does not satisfy.
 */
export function satisfiesVersionRange(version: string, range: string): boolean {
  if (typeof version !== 'string' || typeof range !== 'string') return false;
  const r = range.trim();
  if (r === '*' || r === '') return true;

  const v = parseSemver(version);
  if (!v) return false;

  // ^ compatible-with
  if (r.startsWith('^')) {
    const base = r.slice(1).trim();
    const parsed = parseSemver(base);
    if (!parsed) return false;
    if (v.major !== parsed.major) return false;
    if (compareSemver(v, parsed) < 0) return false;
    return true;
  }

  // ~ patch-only
  if (r.startsWith('~')) {
    const base = r.slice(1).trim();
    const parsed = parseSemver(base);
    if (!parsed) return false;
    if (v.major !== parsed.major || v.minor !== parsed.minor) return false;
    if (compareSemver(v, parsed) < 0) return false;
    return true;
  }

  // >= > <= <
  const m = r.match(/^(>=|>|<=|<)\s*(.+)$/);
  if (m) {
    const op = m[1]!;
    const base = m[2]!.trim();
    const parsed = parseSemver(base);
    if (!parsed) return false;
    const cmp = compareSemver(v, parsed);
    switch (op) {
      case '>=': return cmp >= 0;
      case '>': return cmp > 0;
      case '<=': return cmp <= 0;
      case '<': return cmp < 0;
      default: return false;
    }
  }

  // Exact match
  const parsed = parseSemver(r);
  if (!parsed) return false;
  return compareSemver(v, parsed) === 0;
}

/**
 * Select the highest version from a list of SemVer strings.
 * Returns null if the list is empty or all versions are malformed.
 */
export function selectHighestVersion(versions: string[]): string | null {
  let best: ParsedSemver | null = null;
  let bestStr: string | null = null;
  for (const v of versions) {
    const parsed = parseSemver(v);
    if (!parsed) continue;
    if (best === null || compareSemver(parsed, best) > 0) {
      best = parsed;
      bestStr = v;
    }
  }
  return bestStr;
}
