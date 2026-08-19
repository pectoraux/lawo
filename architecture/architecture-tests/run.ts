/**
 * Nomos — Architecture Test Suite (§34)
 * =====================================
 *
 * Automated invariant checks that run in CI on every meaningful change.
 * These are NOT unit tests — they are architectural boundary tests that
 * verify the FROZEN invariants (I1–I18) are not violated by source code.
 *
 * Usage:
 *   bun run architecture/architecture-tests/run.ts
 *
 * Exit code: 0 if all checks pass, 1 if any check fails.
 *
 * Self-contained: only Node.js built-in modules (fs, path, url) — no external
 * deps. Performs static analysis by reading source files; does NOT execute
 * the source code.
 *
 * See: architecture/invariants.md (I1–I18), architecture/constitution.md
 * sections 3, 10, 34, and the worklog "ARCH-TESTS" entry for the operational
 * summary of every check implemented here.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');
const KERNEL_DIR = join(SRC, 'kernel');
const INTELLIGENCE_DIR = join(SRC, 'intelligence');
const PACKAGES_DATA_DIR = join(SRC, 'lib', 'packages-data');
const APP_API_DIR = join(SRC, 'app', 'api');

// ---------------------------------------------------------------------------
// Vertical terms / forbidden tokens (architecture §3, invariants I1, I3, I16)
// ---------------------------------------------------------------------------
// Forbidden tokens in import PATH SEGMENTS (case-insensitive substring match).
const VERTICAL_PATH_TERMS: readonly string[] = [
  'insurance',
  'border',
  'customs',
  'zoning',
  'healthcare',
  'adu',
  'afcfta-shipment',
  'traffic-stop',
];

// Forbidden TYPE NAMES (case-sensitive) that must NEVER appear in kernel code.
const VERTICAL_TYPE_NAMES: readonly string[] = [
  'InsuranceClaim',
  'ADU',
  'HospitalAssistance',
  'TrafficStop',
  'AfCFTAShipment',
];

// Forbidden predicate branches (case-insensitive) — kernel must never branch
// on a vertical predicate. The match captures the predicate keyword only.
const VERTICAL_PREDICATES: readonly string[] = [
  'insurance',
  'border',
  'zoning',
  'healthcare',
  'customs',
  'immigration',
];

// Forbidden feature-specific string literals in kernel logic (lowercase,
// single-quoted). 'CUSTOMS' (AuthorityKind enum) is uppercase and excluded
// because (a) it does not match, and (b) type-definition lines are excluded.
const VERTICAL_STRING_LITERALS: readonly string[] = [
  "'insurance'",
  "'border'",
  "'customs'",
  '"insurance"',
  '"border"',
  '"customs"',
];

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------
interface CheckResult {
  /** Identifier shown in the table (e.g., "I1", "AUTHZ", "SEC"). */
  id: string;
  /** Short check name shown after the id (e.g., "kernel-imports-no-verticals"). */
  name: string;
  /** True when the check passed; false when it failed. */
  passed: boolean;
  /** Human-readable details shown only on failure. May contain newlines. */
  details?: string;
}

// ---------------------------------------------------------------------------
// File-walk helpers
// ---------------------------------------------------------------------------
function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(cur, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function readFileText(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

// ---------------------------------------------------------------------------
// Comment / string stripping for content scans
// ---------------------------------------------------------------------------
/**
 * Strip JSDoc and inline comments and string literals from a TS source string,
 * returning one cleaned line per source line. Lines that were pure comment
 * lines (start with `//` or `*` after trimming whitespace) are returned as
 * empty strings — so callers can still iterate by line index if needed.
 *
 * Strategy:
 *   - Walk the source character-by-character.
 *   - Track whether we're inside a single-quoted, double-quoted, or
 *     backtick string, or a line comment, or a block comment.
 *   - When inside a string or comment, the emitted character is replaced
 *     with a space (preserving newlines so line numbers stay stable).
 *
 * Limitation: this is a simplified parser. It does not understand nested
 * template literals with ${} interpolations perfectly, nor regex literals.
 * For the purposes of architecture-boundary scanning (looking for vertical
 * type names, vertical predicates, and vertical string literals) it is
 * sufficient and conservative — false positives are reduced because string
 * literals and comments are blanked, false negatives are bounded by the
 * finite set of forbidden tokens (which are unusual enough that they
 * wouldn't appear inside a regex or template interpolation).
 */
function stripCommentsAndStrings(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';

    // Line comment // ... \n
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    // Block comment /* ... */
    if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < n) {
        if (src[i] === '*' && i + 1 < n && src[i + 1] === '/') {
          out += '  ';
          i += 2;
          break;
        }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    // Single-quoted string
    if (ch === "'") {
      out += ' ';
      i++;
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          out += '  ';
          i += 2;
          continue;
        }
        if (src[i] === "'") {
          out += ' ';
          i++;
          break;
        }
        if (src[i] === '\n') {
          out += '\n';
          i++;
          break; // unterminated string — bail
        }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    // Double-quoted string
    if (ch === '"') {
      out += ' ';
      i++;
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          out += '  ';
          i += 2;
          continue;
        }
        if (src[i] === '"') {
          out += ' ';
          i++;
          break;
        }
        if (src[i] === '\n') {
          out += '\n';
          i++;
          break;
        }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    // Backtick template literal (simplified — does not handle ${} interpolations perfectly)
    if (ch === '`') {
      out += ' ';
      i++;
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          out += '  ';
          i += 2;
          continue;
        }
        if (src[i] === '`') {
          out += ' ';
          i++;
          break;
        }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Strip comment lines (lines that start with `//` or `*` after trimming
 * leading whitespace) — used for predicate/string scans where we want to
 * keep string literals in the picture but exclude JSDoc.
 */
function stripCommentLines(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
        return '';
      }
      return line;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Import parsing
// ---------------------------------------------------------------------------
interface ImportStmt {
  /** Full import string (e.g., "@/lib/packages-data/ghana-jurisdiction"). */
  path: string;
  /** True if this is a `import type { ... } from ...` (type-only import). */
  isTypeOnly: boolean;
}

const IMPORT_RE = /\bimport\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*from\s+['"]([^'"]+)['"]/g;

function parseImports(src: string): ImportStmt[] {
  const out: ImportStmt[] = [];
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const isTypeOnly = /^\s*type\s/.test(m[1] ?? '');
    out.push({ path: m[2], isTypeOnly });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Brace/bracket matching — returns the index of the matching closer
// (open char at startIdx; returns -1 if unbalanced).
// Handles strings, comments, and both `{}` and `[]` brackets. When `open` is
// `[`, we count only `[`/`]`; when `open` is `{`, only `{`/`}`.
// ---------------------------------------------------------------------------
function findMatching(src: string, startIdx: number, open: string, close: string): number {
  if (src[startIdx] !== open) return -1;
  let depth = 0;
  let i = startIdx;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';

    // Skip line comments
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // Skip block comments
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n) {
        if (src[i] === '*' && i + 1 < n && src[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }
    // Skip single-quoted string
    if (ch === "'") {
      i++;
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          i += 2;
          continue;
        }
        if (src[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // Skip double-quoted string
    if (ch === '"') {
      i++;
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          i += 2;
          continue;
        }
        if (src[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // Skip backtick template literal (simplified)
    if (ch === '`') {
      i++;
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          i += 2;
          continue;
        }
        if (src[i] === '`') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Split an array literal body into top-level object-literal strings.
 * `arrBody` is the full array literal including the surrounding `[` and `]`.
 */
function splitTopLevelObjects(arrBody: string): string[] {
  const objects: string[] = [];
  if (!arrBody.startsWith('[') || !arrBody.endsWith(']')) return objects;
  const inner = arrBody.slice(1, -1);
  let i = 0;
  const n = inner.length;
  while (i < n) {
    const ch = inner[i];
    if (ch === '{') {
      const endRel = findMatching(inner, i, '{', '}');
      if (endRel === -1) break;
      objects.push(inner.slice(i, endRel + 1));
      i = endRel + 1;
    } else {
      i++;
    }
  }
  return objects;
}

// ===========================================================================
// CHECK: I1 / I2 / I3 — kernel-imports-no-verticals
// ===========================================================================
function checkKernelImportsNoVerticals(): CheckResult {
  const files = walkTsFiles(KERNEL_DIR);
  const violations: string[] = [];

  for (const file of files) {
    const src = readFileText(file);
    const relPath = relative(ROOT, file);

    // --- Import-path scan ---
    const imports = parseImports(src);
    for (const imp of imports) {
      const lower = imp.path.toLowerCase();
      // Reject imports that reference vertical package data or the experience layer.
      if (
        lower.includes('lib/packages-data') ||
        lower.includes('@/app/') ||
        lower.includes('src/app/')
      ) {
        violations.push(
          `${relPath}: imports '${imp.path}' (vertical/experience layer)`,
        );
        continue;
      }
      // Reject imports whose path references a vertical term — either as an
      // exact segment (`/insurance/`) or as a prefix of a segment
      // (`/border-crossing-`). Both readings of the spec ("path segment" and
      // "path substring") are caught.
      let hitVerticalTerm: string | null = null;
      for (const term of VERTICAL_PATH_TERMS) {
        // Match `/<term>` or `/<term>-` or `/<term>_` — i.e., the term is
        // either an exact segment or the prefix of a kebab/snake segment.
        const re = new RegExp(`[/"]${term}([/"'-]|$)`, 'i');
        if (re.test(lower)) {
          hitVerticalTerm = term;
          break;
        }
      }
      if (hitVerticalTerm) {
        violations.push(
          `${relPath}: import '${imp.path}' contains vertical path term '${hitVerticalTerm}'`,
        );
      }
    }

    // --- Content scan (excludes comments and string literals) ---
    const stripped = stripCommentsAndStrings(src);
    for (const typeName of VERTICAL_TYPE_NAMES) {
      // Word-boundary match so 'ADU' doesn't trip on 'saturate' etc.
      const re = new RegExp(`\\b${typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(stripped)) {
        violations.push(`${relPath}: kernel code references forbidden vertical type '${typeName}'`);
      }
    }
    // Forbidden predicate branches: `if (insurance)` etc.
    // We scan the stripped content (no comments / no strings) for `if (kw)`.
    for (const kw of VERTICAL_PREDICATES) {
      const re = new RegExp(`\\bif\\s*\\(\\s*${kw}\\b`, 'i');
      if (re.test(stripped)) {
        violations.push(`${relPath}: kernel code has forbidden vertical predicate 'if (${kw})'`);
      }
    }
  }

  if (violations.length === 0) {
    return { id: 'I1', name: 'kernel-imports-no-verticals', passed: true };
  }
  return {
    id: 'I1',
    name: 'kernel-imports-no-verticals',
    passed: false,
    details: violations.join('\n  '),
  };
}

// ===========================================================================
// CHECK: I5 — kernel-imports-no-llm
// ===========================================================================
function checkKernelImportsNoLlm(): CheckResult {
  const files = [...walkTsFiles(KERNEL_DIR), ...walkTsFiles(INTELLIGENCE_DIR)];
  const violations: string[] = [];
  const llmIndicators = ['z-ai-web-dev-sdk', 'ZAI.create(', 'chat.completions.create'];

  for (const file of files) {
    const src = readFileText(file);
    const relPath = relative(ROOT, file);
    for (const ind of llmIndicators) {
      if (src.includes(ind)) {
        violations.push(`${relPath}: references LLM SDK call '${ind}'`);
      }
    }
  }

  if (violations.length === 0) {
    return { id: 'I5', name: 'kernel-imports-no-llm', passed: true };
  }
  return {
    id: 'I5',
    name: 'kernel-imports-no-llm',
    passed: false,
    details: violations.join('\n  '),
  };
}

// ===========================================================================
// CHECK: I6 — provenance-on-decisions
// ===========================================================================
function checkProvenanceOnDecisions(): CheckResult {
  const file = join(INTELLIGENCE_DIR, 'decision', 'DecisionEngine.ts');
  if (!existsSync(file)) {
    return {
      id: 'I6',
      name: 'provenance-on-decisions',
      passed: false,
      details: `missing file: ${relative(ROOT, file)}`,
    };
  }
  const src = readFileText(file);
  // Simple check: the file must reference `provenance` and assign into
  // state.provenance (either direct or via immer `s.state.provenance`).
  const hasProvenance = /\bprovenance\b/.test(src);
  const hasAssignment =
    /state\.provenance\s*=/.test(src) ||
    /s\.state\.provenance\s*=/.test(src) ||
    /\.provenance\s*=\s*provenance/.test(src);

  if (hasProvenance && hasAssignment) {
    return { id: 'I6', name: 'provenance-on-decisions', passed: true };
  }
  return {
    id: 'I6',
    name: 'provenance-on-decisions',
    passed: false,
    details:
      `DecisionEngine.ts does not build+attach provenance to state. ` +
      `(hasProvenance=${hasProvenance}, hasStateProvenanceAssignment=${hasAssignment})`,
  };
}

// ===========================================================================
// CHECK: I7 — temporal-metadata-on-rules
// ===========================================================================
function checkTemporalMetadataOnRules(): CheckResult {
  const files = walkTsFiles(PACKAGES_DATA_DIR);
  const violations: string[] = [];
  let ruleCount = 0;

  for (const file of files) {
    const src = readFileText(file);
    const relPath = relative(ROOT, file);

    // Find every `: Rule[] = [` declaration, then walk each top-level
    // object literal inside the array.
    const declRe = /:\s*Rule\[\]\s*=\s*\[/g;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(src)) !== null) {
      // m.index points at the ':' (the start of `: Rule[] = [`).
      // Locate the opening `[` after the '='.
      const eqIdx = src.indexOf('=', m.index);
      if (eqIdx === -1) continue;
      const openIdx = src.indexOf('[', eqIdx);
      if (openIdx === -1) continue;
      const closeIdx = findMatching(src, openIdx, '[', ']');
      if (closeIdx === -1) continue;
      const arrBody = src.slice(openIdx, closeIdx + 1);
      const objs = splitTopLevelObjects(arrBody);
      for (const obj of objs) {
        ruleCount++;
        // Find the temporal block within this rule object.
        const temporalKeyRe = /\btemporal\s*:\s*\{/g;
        let t: RegExpExecArray | null;
        let lastFound = false;
        while ((t = temporalKeyRe.exec(obj)) !== null) {
          const tOpenIdx = obj.indexOf('{', t.index + 'temporal'.length);
          if (tOpenIdx === -1) continue;
          const tCloseIdx = findMatching(obj, tOpenIdx, '{', '}');
          if (tCloseIdx === -1) continue;
          const tBody = obj.slice(tOpenIdx + 1, tCloseIdx);
          const hasValidFrom = /\bvalidFrom\b\s*:/.test(tBody);
          const hasVersion = /\bversion\b\s*:/.test(tBody);
          if (!hasValidFrom) {
            violations.push(`${relPath}: rule object missing temporal.validFrom`);
          }
          if (!hasVersion) {
            violations.push(`${relPath}: rule object missing temporal.version`);
          }
          lastFound = true;
          break; // only check the first temporal block per rule
        }
        if (!lastFound) {
          violations.push(`${relPath}: rule object missing temporal block`);
        }
      }
    }

    // Also handle single-Rule declarations: `: Rule = {`
    const singleRe = /:\s*Rule\s*=\s*\{/g;
    while ((m = singleRe.exec(src)) !== null) {
      const openIdx = src.indexOf('{', m.index);
      if (openIdx === -1) continue;
      const closeIdx = findMatching(src, openIdx, '{', '}');
      if (closeIdx === -1) continue;
      const obj = src.slice(openIdx, closeIdx + 1);
      ruleCount++;
      const temporalKeyRe = /\btemporal\s*:\s*\{/g;
      let t: RegExpExecArray | null;
      let lastFound = false;
      while ((t = temporalKeyRe.exec(obj)) !== null) {
        const tOpenIdx = obj.indexOf('{', t.index + 'temporal'.length);
        if (tOpenIdx === -1) continue;
        const tCloseIdx = findMatching(obj, tOpenIdx, '{', '}');
        if (tCloseIdx === -1) continue;
        const tBody = obj.slice(tOpenIdx + 1, tCloseIdx);
        const hasValidFrom = /\bvalidFrom\b\s*:/.test(tBody);
        const hasVersion = /\bversion\b\s*:/.test(tBody);
        if (!hasValidFrom) {
          violations.push(`${relPath}: rule object missing temporal.validFrom`);
        }
        if (!hasVersion) {
          violations.push(`${relPath}: rule object missing temporal.version`);
        }
        lastFound = true;
        break;
      }
      if (!lastFound) {
        violations.push(`${relPath}: rule object missing temporal block`);
      }
    }
  }

  if (violations.length === 0) {
    return {
      id: 'I7',
      name: 'temporal-metadata-on-rules',
      passed: true,
      details: `${ruleCount} rule(s) checked`,
    };
  }
  return {
    id: 'I7',
    name: 'temporal-metadata-on-rules',
    passed: false,
    details: `${violations.length} violation(s) across ${ruleCount} rule(s):\n  ${violations.join('\n  ')}`,
  };
}

// ===========================================================================
// CHECK: I10 — package-dependency-rules
// ===========================================================================
function checkPackageDependencyRules(): CheckResult {
  const files = walkTsFiles(PACKAGES_DATA_DIR);
  const manifests: { packageId: string; deps: string[]; file: string }[] = [];

  for (const file of files) {
    const src = readFileText(file);
    // Find every `: PackageManifest = {` declaration.
    const declRe = /:\s*PackageManifest\s*=\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(src)) !== null) {
      const openIdx = src.indexOf('{', m.index);
      if (openIdx === -1) continue;
      const closeIdx = findMatching(src, openIdx, '{', '}');
      if (closeIdx === -1) continue;
      const body = src.slice(openIdx, closeIdx + 1);

      // The manifest's own packageId: first occurrence of `packageId: '...'`
      // that is NOT inside the dependencies array. We exploit the fact that
      // `packageId` appears at the top of the manifest before `dependencies`.
      const idMatch = body.match(/packageId\s*:\s*['"]([^'"]+)['"]/);
      if (!idMatch) continue;
      const ownId = idMatch[1];

      // Find the dependencies array.
      const deps: string[] = [];
      const depsKeyRe = /\bdependencies\s*:\s*\[/g;
      let d: RegExpExecArray | null;
      while ((d = depsKeyRe.exec(body)) !== null) {
        const dOpenIdx = body.indexOf('[', d.index);
        if (dOpenIdx === -1) continue;
        const dCloseIdx = findMatching(body, dOpenIdx, '[', ']');
        if (dCloseIdx === -1) continue;
        const dBody = body.slice(dOpenIdx + 1, dCloseIdx);
        const depIdRe = /packageId\s*:\s*['"]([^'"]+)['"]/g;
        let dm: RegExpExecArray | null;
        while ((dm = depIdRe.exec(dBody)) !== null) {
          deps.push(dm[1]);
        }
      }
      manifests.push({ packageId: ownId, deps, file });
    }
  }

  if (manifests.length === 0) {
    return {
      id: 'I10',
      name: 'package-dependency-rules',
      passed: false,
      details: 'no PackageManifest declarations found in src/lib/packages-data/',
    };
  }

  const knownIds = new Set(manifests.map((m) => m.packageId));
  const violations: string[] = [];
  for (const m of manifests) {
    for (const depId of m.deps) {
      if (!knownIds.has(depId)) {
        violations.push(
          `${relative(ROOT, m.file)}: package '${m.packageId}' depends on unknown package '${depId}'`,
        );
      }
    }
  }

  if (violations.length === 0) {
    return {
      id: 'I10',
      name: 'package-dependency-rules',
      passed: true,
      details: `${manifests.length} manifest(s), all dependencies resolve`,
    };
  }
  return {
    id: 'I10',
    name: 'package-dependency-rules',
    passed: false,
    details: violations.join('\n  '),
  };
}

// ===========================================================================
// CHECK: I11 — packages-do-not-mutate-kernel
// ===========================================================================
function checkPackagesDoNotMutateKernel(): CheckResult {
  const files = walkTsFiles(PACKAGES_DATA_DIR);
  const violations: string[] = [];

  for (const file of files) {
    const src = readFileText(file);
    const relPath = relative(ROOT, file);
    const imports = parseImports(src);
    for (const imp of imports) {
      // Any import path referencing the kernel.
      if (
        imp.path.includes('@/kernel') ||
        imp.path.includes('src/kernel') ||
        /^@\/kernel(\/|$)/.test(imp.path)
      ) {
        if (!imp.isTypeOnly) {
          violations.push(
            `${relPath}: non-type import from kernel: import { ... } from '${imp.path}'`,
          );
        }
      }
    }
  }

  if (violations.length === 0) {
    return {
      id: 'I11',
      name: 'packages-do-not-mutate-kernel',
      passed: true,
      details: 'all kernel imports in packages-data are type-only',
    };
  }
  return {
    id: 'I11',
    name: 'packages-do-not-mutate-kernel',
    passed: false,
    details: violations.join('\n  '),
  };
}

// ===========================================================================
// CHECK: I16 — no-feature-specific-hacks-in-kernel
// ===========================================================================
function checkNoFeatureSpecificHacksInKernel(): CheckResult {
  const files = walkTsFiles(KERNEL_DIR);
  const violations: string[] = [];

  for (const file of files) {
    const src = readFileText(file);
    const relPath = relative(ROOT, file);

    // Strip comment lines (lines starting with `//` or `*`).
    const noCommentLines = stripCommentLines(src);
    // Strip strings/comments entirely for predicate + literal scans.
    const stripped = stripCommentsAndStrings(src);

    // Forbidden predicates: if (insurance|border|zoning|healthcare|customs|immigration) (case-insensitive)
    for (const kw of VERTICAL_PREDICATES) {
      const re = new RegExp(`\\bif\\s*\\(\\s*${kw}\\b`, 'i');
      if (re.test(stripped)) {
        violations.push(`${relPath}: forbidden feature-specific predicate 'if (${kw})'`);
      }
    }

    // Forbidden feature-specific string literals: 'insurance', 'border', 'customs'
    // Search in the comment-stripped source (strings intact) so we catch the
    // literals themselves. Exclude lines that are part of a type definition
    // (lines like `| 'X'` or `export type X = '...'`).
    const lines = noCommentLines.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      // Skip type-definition lines (union member `| 'X'` or `export type X = ...`).
      if (/^\|/.test(trimmed) || /^export\s+type\s/.test(trimmed) || /^type\s/.test(trimmed)) {
        continue;
      }
      for (const lit of VERTICAL_STRING_LITERALS) {
        if (line.includes(lit)) {
          violations.push(`${relPath}:${i + 1}: forbidden feature-specific string literal ${lit}`);
        }
      }
    }
  }

  if (violations.length === 0) {
    return { id: 'I16', name: 'no-feature-specific-hacks-in-kernel', passed: true };
  }
  return {
    id: 'I16',
    name: 'no-feature-specific-hacks-in-kernel',
    passed: false,
    details: violations.join('\n  '),
  };
}

// ===========================================================================
// CHECK: AUTHZ — privileged-routes-check-authz
// ===========================================================================
const PRIVILEGED_ROUTES: ReadonlySet<string> = new Set([
  '/api/waitlist/approve',
  '/api/waitlist/reject',
  '/api/waitlist/pending',
  '/api/admin/users',
]);

interface RouteHandlerInfo {
  /** Route path (e.g., "/api/waitlist/approve"). */
  routePath: string;
  /** Absolute path to the route.ts file. */
  file: string;
  /** HTTP methods exported (POST, PUT, DELETE, GET, ...). */
  methods: string[];
}

function findRouteHandlers(file: string): RouteHandlerInfo | null {
  const src = readFileText(file);
  const methods = new Set<string>();
  // Direct: `export async function POST`, `export function POST`
  const directRe = /\bexport\s+(?:async\s+)?function\s+(POST|PUT|DELETE|GET|PATCH)\b/g;
  let m: RegExpExecArray | null;
  while ((m = directRe.exec(src)) !== null) {
    methods.add(m[1]);
  }
  // Aliased: `export { handler as GET, handler as POST }` (NextAuth pattern)
  const aliasRe = /\bexport\s*\{[^}]*\bas\s+(POST|PUT|DELETE|GET|PATCH)\b[^}]*\}/g;
  while ((m = aliasRe.exec(src)) !== null) {
    methods.add(m[1]);
  }
  if (methods.size === 0) return null;

  // Derive route path: <root>/src/app/api/<...>/route.ts → /api/<...>
  const rel = relative(join(SRC, 'app', 'api'), file).split(sep).join('/');
  // Strip trailing /route.ts
  const routeRel = rel.replace(/\/route\.ts$/, '').replace(/^route\.ts$/, '');
  const routePath = '/api/' + routeRel;
  return { routePath, file, methods: Array.from(methods) };
}

function checkPrivilegedRoutesAuthz(): CheckResult {
  const routeFiles = walkTsFiles(APP_API_DIR).filter((f) => f.endsWith('route.ts'));
  const violations: string[] = [];

  for (const file of routeFiles) {
    const info = findRouteHandlers(file);
    if (!info) continue;
    const src = readFileText(file);
    const relPath = relative(ROOT, file);

    // Exempt /api/auth/* — NextAuth handles its own auth.
    if (info.routePath === '/api/auth' || info.routePath.startsWith('/api/auth/')) {
      continue;
    }

    const isPrivileged = PRIVILEGED_ROUTES.has(info.routePath);

    // For privileged routes (any HTTP method): MUST call requireAdmin().
    if (isPrivileged) {
      if (!/\brequireAdmin\s*\(/.test(src)) {
        violations.push(
          `${relPath}: privileged route '${info.routePath}' must call requireAdmin()`,
        );
      }
      continue;
    }

    // For non-privileged POST/PUT/DELETE handlers: must call requireAdmin,
    // requireUser, getSession, OR checkOrigin (CSRF-protected public route).
    // Exempt specific public routes per the spec.
    const isExemptPublicPost =
      (info.routePath === '/api/waitlist' && info.methods.includes('POST')) ||
      (info.routePath === '/api/set-password' && info.methods.includes('POST'));

    for (const method of info.methods) {
      if (method === 'GET') continue; // AUTHZ check is for mutating methods only
      if (isExemptPublicPost && method === 'POST') continue;
      const hasAuthz =
        /\brequireAdmin\s*\(/.test(src) ||
        /\brequireUser\s*\(/.test(src) ||
        /\bgetSession\s*\(/.test(src) ||
        /\bcheckOrigin\s*\(/.test(src) ||
        /\bguardMutation\s*\(/.test(src) ||
        /\bguardAdminMutation\s*\(/.test(src) ||
        /\bguardAuthenticated\s*\(/.test(src);
      if (!hasAuthz) {
        violations.push(
          `${relPath}: ${method} handler on '${info.routePath}' has no authz call (requireAdmin/requireUser/getSession/checkOrigin)`,
        );
      }
    }
  }

  if (violations.length === 0) {
    return { id: 'AUTHZ', name: 'privileged-routes-check-authz', passed: true };
  }
  return {
    id: 'AUTHZ',
    name: 'privileged-routes-check-authz',
    passed: false,
    details: violations.join('\n  '),
  };
}

// ===========================================================================
// CHECK: SEC — no-secrets-in-client-code
// ===========================================================================
const SECRET_ENV_VARS: readonly string[] = [
  'process.env.DATABASE_URL',
  'process.env.DIRECT_URL',
  'process.env.NEXTAUTH_SECRET',
  'process.env.POSTGRES_PASSWORD',
  'process.env.POSTGRES_USER',
  'process.env.POSTGRES_HOST',
];

function checkNoSecretsInClientCode(): CheckResult {
  const files = walkTsFiles(SRC).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const violations: string[] = [];

  for (const file of files) {
    const src = readFileText(file);
    // A client file is one whose first non-whitespace line is 'use client'.
    const firstLine = src.split('\n', 5).find((l) => l.trim().length > 0) ?? '';
    if (!firstLine.trim().startsWith("'use client'") && !firstLine.trim().startsWith('"use client"')) {
      continue;
    }
    const relPath = relative(ROOT, file);
    for (const v of SECRET_ENV_VARS) {
      if (src.includes(v)) {
        violations.push(`${relPath}: references secret env var '${v}'`);
      }
    }
  }

  if (violations.length === 0) {
    return { id: 'SEC', name: 'no-secrets-in-client-code', passed: true };
  }
  return {
    id: 'SEC',
    name: 'no-secrets-in-client-code',
    passed: false,
    details: violations.join('\n  '),
  };
}

// ===========================================================================
// CHECK: SEC — audit-payload-sanitizer
// ===========================================================================
function checkAuditPayloadSanitizer(): CheckResult {
  const file = join(SRC, 'lib', 'auth', 'audit.ts');
  if (!existsSync(file)) {
    return {
      id: 'SEC',
      name: 'audit-payload-sanitizer',
      passed: false,
      details: `missing file: ${relative(ROOT, file)}`,
    };
  }
  const src = readFileText(file);

  // Must contain a regex / string match for sensitive keys.
  const hasPasswordMatch = /password/i.test(src);
  const hasTokenMatch = /token/i.test(src);
  const hasSecretMatch = /secret/i.test(src);
  const hasHashMatch = /hash/i.test(src);
  const hasCredentialMatch = /credential/i.test(src);
  // Must replace with [REDACTED].
  const hasRedacted = /\[REDACTED\]/.test(src);

  const missing: string[] = [];
  if (!hasPasswordMatch) missing.push("password");
  if (!hasTokenMatch) missing.push("token");
  if (!hasSecretMatch) missing.push("secret");
  if (!hasHashMatch) missing.push("hash");
  if (!hasCredentialMatch) missing.push("credential");
  if (!hasRedacted) missing.push("[REDACTED] replacement");

  if (missing.length === 0) {
    return { id: 'SEC', name: 'audit-payload-sanitizer', passed: true };
  }
  return {
    id: 'SEC',
    name: 'audit-payload-sanitizer',
    passed: false,
    details: `audit.ts missing sanitizer element(s): ${missing.join(', ')}`,
  };
}

// ===========================================================================
// CHECK: SEC — no-remote-seeding
// ===========================================================================
function checkNoRemoteSeeding(): CheckResult {
  const seedDemoDir = join(APP_API_DIR, 'seed-demo');
  if (existsSync(seedDemoDir)) {
    return {
      id: 'SEC',
      name: 'no-remote-seeding',
      passed: false,
      details: `seed-demo endpoint exists at ${relative(ROOT, seedDemoDir)} — remove before deploy`,
    };
  }
  return { id: 'SEC', name: 'no-remote-seeding', passed: true };
}

// ===========================================================================
// CHECK: SEC — csrf-on-mutations
// ===========================================================================
function checkCsrfOnMutations(): CheckResult {
  const routeFiles = walkTsFiles(APP_API_DIR).filter((f) => f.endsWith('route.ts'));
  const violations: string[] = [];

  for (const file of routeFiles) {
    const info = findRouteHandlers(file);
    if (!info) continue;
    // Only POST handlers trigger CSRF check (PUT/DELETE also mutate but the
    // spec specifically lists POST; we follow the spec literally).
    if (!info.methods.includes('POST')) continue;

    // Exempt /api/auth/* (NextAuth handles CSRF internally).
    if (info.routePath === '/api/auth' || info.routePath.startsWith('/api/auth/')) {
      continue;
    }
    // /api/me is GET-only — no POST handler to check.
    if (info.routePath === '/api/me') continue;

    const src = readFileText(file);
    const hasCheckOrigin =
      /\bcheckOrigin\s*\(/.test(src) ||
      /\bguardMutation\s*\(/.test(src) ||
      /\bguardAdminMutation\s*\(/.test(src);
    if (!hasCheckOrigin) {
      violations.push(
        `${relative(ROOT, file)}: POST handler on '${info.routePath}' does not call checkOrigin()`,
      );
    }
  }

  if (violations.length === 0) {
    return { id: 'SEC', name: 'csrf-on-mutations', passed: true };
  }
  return {
    id: 'SEC',
    name: 'csrf-on-mutations',
    passed: false,
    details: violations.join('\n  '),
  };
}

// ===========================================================================
// Main runner
// ===========================================================================
function formatLine(id: string, name: string, passed: boolean): string {
  const mark = passed ? '\u2713' : '\u2717';
  // Right-align the ✓ / ✗ by padding the name+dots field to a fixed column.
  // id field: 5 chars (padEnd). Name + dots field: 36 chars (name + dots).
  const idField = id.padEnd(5);
  const NAME_FIELD_WIDTH = 36;
  const dotsCount = Math.max(2, NAME_FIELD_WIDTH - name.length - 1);
  const dots = '.'.repeat(dotsCount);
  return `${idField} ${name} ${dots} ${mark}`;
}

function main(): void {
  const startedAt = Date.now();

  const checks: CheckResult[] = [
    // I1 / I2 / I3 — same implementation, three invariant numbers.
    (() => {
      const r = checkKernelImportsNoVerticals();
      return { ...r, id: 'I1' };
    })(),
    (() => {
      const r = checkKernelImportsNoVerticals();
      return { ...r, id: 'I2' };
    })(),
    (() => {
      const r = checkKernelImportsNoVerticals();
      return { ...r, id: 'I3' };
    })(),
    checkKernelImportsNoLlm(),
    checkProvenanceOnDecisions(),
    checkTemporalMetadataOnRules(),
    checkPackageDependencyRules(),
    checkPackagesDoNotMutateKernel(),
    checkNoFeatureSpecificHacksInKernel(),
    checkPrivilegedRoutesAuthz(),
    checkNoSecretsInClientCode(),
    checkAuditPayloadSanitizer(),
    checkNoRemoteSeeding(),
    checkCsrfOnMutations(),
  ];

  const headerLines = [
    'Nomos — Architecture Test Suite (\u00A734)',
    '=====================================',
    '',
  ];

  const bodyLines: string[] = [];
  let passed = 0;
  let failed = 0;
  for (const c of checks) {
    bodyLines.push(formatLine(c.id, c.name, c.passed));
    if (c.passed) {
      passed++;
    } else {
      failed++;
      const details = c.details ?? '(no details)';
      // Print each line of details indented under the table line.
      const detailLines = details.split('\n');
      bodyLines.push(`      \u2192 ${c.id}: ${detailLines[0]}`);
      for (let i = 1; i < detailLines.length; i++) {
        bodyLines.push(`        ${detailLines[i]}`);
      }
    }
  }

  const summaryLines = [
    '',
    '-------------------------------------',
    `${passed} passed, ${failed} failed`,
  ];

  const elapsedMs = Date.now() - startedAt;

  // Print everything to stdout.
  const all = [...headerLines, ...bodyLines, ...summaryLines];
  // Annotate elapsed time + exit code below the summary.
  all.push(`(${elapsedMs} ms)`);
  console.log(all.join('\n'));

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
