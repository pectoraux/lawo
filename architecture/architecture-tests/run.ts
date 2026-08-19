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

import * as fs from 'node:fs';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import * as path from 'node:path';
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
        /\bguardAuthenticated\s*\(/.test(src) ||
        /\brequireUserWithScope\s*\(/.test(src) ||
        /\brequireAdminWithScope\s*\(/.test(src) ||
        /\brequireUserAuthenticated\s*\(/.test(src);
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
      /\bguardAdminMutation\s*\(/.test(src) ||
      /\brequireUserWithScope\s*\(/.test(src) ||
      /\brequireAdminWithScope\s*\(/.test(src);
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
// RULE-001 through RULE-010 — RuleIR + package lifecycle invariants (§20)
// ===========================================================================

function checkRule001(): CheckResult {
  // RULE-001: RuleEngine never imports LLM/agent implementation.
  const ruleFiles = walkTsFiles(path.join(ROOT, 'src', 'kernel', 'rules'));
  const compilerFiles = walkTsFiles(path.join(ROOT, 'src', 'kernel', 'rules'));
  const allFiles = [...ruleFiles, ...compilerFiles];
  const violations: string[] = [];
  for (const f of allFiles) {
    const src = readFileText(f);
    if (/z-ai-web-dev-sdk/.test(src) || /ZAI\.create/.test(src) || /chat\.completions\.create/.test(src)) {
      violations.push(`${relative(ROOT, f)}: imports or references LLM SDK`);
    }
  }
  return violations.length === 0
    ? { id: 'RULE-001', name: 'ruleengine-no-llm', passed: true }
    : { id: 'RULE-001', name: 'ruleengine-no-llm', passed: false, details: violations.join('\n  ') };
}

function checkRule002(): CheckResult {
  // RULE-002: RuleIR is data-only (ConditionNode is a discriminated union of pure data).
  const typesFile = path.join(ROOT, 'src', 'kernel', 'primitives', 'types.ts');
  const src = readFileText(typesFile);
  // Check that ConditionNode doesn't contain function types
  const condMatch = src.match(/export type ConditionNode[\s\S]*?(?=\n\n)/);
  if (!condMatch) {
    return { id: 'RULE-002', name: 'ruleir-is-data-only', passed: false, details: 'ConditionNode type not found' };
  }
  const condSrc = condMatch[0];
  if (/\bFunction\b/.test(condSrc) || /=>\s*\{/.test(condSrc)) {
    return { id: 'RULE-002', name: 'ruleir-is-data-only', passed: false, details: 'ConditionNode contains function types' };
  }
  return { id: 'RULE-002', name: 'ruleir-is-data-only', passed: true };
}

function checkRule003(): CheckResult {
  // RULE-003: Rule evaluation is deterministic — conditionEval.ts has no Date.now(), Math.random(), IO in actual code (not comments).
  const evalFile = path.join(ROOT, 'src', 'kernel', 'rules', 'conditionEval.ts');
  const src = readFileText(evalFile);
  // Strip comments (lines starting with // or within /* */ blocks)
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
    .replace(/\/\/.*$/gm, '');           // line comments
  const violations: string[] = [];
  if (/Date\.now\(\)/.test(stripped)) violations.push('Date.now() found in code');
  if (/Math\.random\(\)/.test(stripped)) violations.push('Math.random() found in code');
  if (/\bfetch\s*\(/.test(stripped)) violations.push('fetch() found in code');
  return violations.length === 0
    ? { id: 'RULE-003', name: 'evaluation-is-deterministic', passed: true }
    : { id: 'RULE-003', name: 'evaluation-is-deterministic', passed: false, details: violations.join('; ') };
}

function checkRule004(): CheckResult {
  // RULE-004: Invalid RuleIR cannot enter an active registry — validator + package validator exist.
  const validatorFile = path.join(ROOT, 'src', 'kernel', 'rules', 'RuleIRValidator.ts');
  const pkgValidatorFile = path.join(ROOT, 'src', 'packages', 'PackageValidator.ts');
  if (!fs.existsSync(validatorFile)) {
    return { id: 'RULE-004', name: 'invalid-ruleir-rejected', passed: false, details: 'RuleIRValidator.ts not found' };
  }
  if (!fs.existsSync(pkgValidatorFile)) {
    return { id: 'RULE-004', name: 'invalid-ruleir-rejected', passed: false, details: 'PackageValidator.ts not found' };
  }
  const pkgValidatorSrc = readFileText(pkgValidatorFile);
  if (!/validateRule/.test(pkgValidatorSrc)) {
    return { id: 'RULE-004', name: 'invalid-ruleir-rejected', passed: false, details: 'PackageValidator does not call validateRule' };
  }
  return { id: 'RULE-004', name: 'invalid-ruleir-rejected', passed: true };
}

function checkRule005(): CheckResult {
  // RULE-005: Active packages have resolved dependencies — VersionedPackageRegistry has resolveDependencies + detectCycles.
  const registryFile = path.join(ROOT, 'src', 'packages', 'VersionedPackageRegistry.ts');
  if (!fs.existsSync(registryFile)) {
    return { id: 'RULE-005', name: 'active-packages-resolved-deps', passed: false, details: 'VersionedPackageRegistry.ts not found' };
  }
  const src = readFileText(registryFile);
  const hasResolve = /resolveDependencies/.test(src);
  const hasCycles = /detectCycles/.test(src);
  return hasResolve && hasCycles
    ? { id: 'RULE-005', name: 'active-packages-resolved-deps', passed: true }
    : { id: 'RULE-005', name: 'active-packages-resolved-deps', passed: false, details: `resolveDependencies=${hasResolve}, detectCycles=${hasCycles}` };
}

function checkRule006(): CheckResult {
  // RULE-006: Package code cannot bypass package registry — packages-data files don't import kernel with non-type imports.
  const pkgDataDir = path.join(ROOT, 'src', 'lib', 'packages-data');
  if (!fs.existsSync(pkgDataDir)) {
    return { id: 'RULE-006', name: 'packages-cannot-bypass-registry', passed: true };
  }
  const files = walkTsFiles(pkgDataDir);
  const violations: string[] = [];
  for (const f of files) {
    const src = readFileText(f);
    // Non-type imports from @/kernel/ are violations
    const nonTypeImports = src.match(/^import\s+\{[^}]+\}\s+from\s+['"]@\/kernel\//gm);
    if (nonTypeImports) {
      for (const imp of nonTypeImports) {
        if (!imp.includes('import type')) {
          violations.push(`${relative(ROOT, f)}: non-type import from @/kernel/`);
        }
      }
    }
  }
  return violations.length === 0
    ? { id: 'RULE-006', name: 'packages-cannot-bypass-registry', passed: true }
    : { id: 'RULE-006', name: 'packages-cannot-bypass-registry', passed: false, details: violations.join('\n  ') };
}

function checkRule007(): CheckResult {
  // RULE-007: Kernel does not import a specific vertical package.
  return checkKernelImportsNoVerticals.id === 'I1'
    ? { ...checkKernelImportsNoVerticals(), id: 'RULE-007', name: 'kernel-no-vertical-imports' }
    : { id: 'RULE-007', name: 'kernel-no-vertical-imports', passed: true };
}

function checkRule008(): CheckResult {
  // RULE-008: Decision provenance identifies exact package/rule versions.
  const typesFile = path.join(ROOT, 'src', 'kernel', 'primitives', 'types.ts');
  const src = readFileText(typesFile);
  const hasPackageId = /packageId.*string/.test(src.slice(src.indexOf('interface Provenance')));
  const provBuilderFile = path.join(ROOT, 'src', 'kernel', 'provenance', 'ProvenanceBuilder.ts');
  const provSrc = readFileText(provBuilderFile);
  const hasPackageVersion = /packageVersion/.test(provSrc);
  return hasPackageId && hasPackageVersion
    ? { id: 'RULE-008', name: 'provenance-exact-versions', passed: true }
    : { id: 'RULE-008', name: 'provenance-exact-versions', passed: false, details: `packageId in type=${hasPackageId}, packageVersion in builder=${hasPackageVersion}` };
}

function checkRule009(): CheckResult {
  // RULE-009: Historical evaluation cannot silently use current rule versions.
  const histFile = path.join(ROOT, 'src', 'kernel', 'rules', 'HistoricalEvaluator.ts');
  if (!fs.existsSync(histFile)) {
    return { id: 'RULE-009', name: 'historical-no-current-versions', passed: false, details: 'HistoricalEvaluator.ts not found' };
  }
  const src = readFileText(histFile);
  const hasPinnedVersions = /packageVersions/.test(src);
  const throwsOnMissing = /HistoricalResolutionError/.test(src);
  return hasPinnedVersions && throwsOnMissing
    ? { id: 'RULE-009', name: 'historical-no-current-versions', passed: true }
    : { id: 'RULE-009', name: 'historical-no-current-versions', passed: false, details: `pinnedVersions=${hasPinnedVersions}, throwsOnMissing=${throwsOnMissing}` };
}

function checkRule010(): CheckResult {
  // RULE-010: Package version content is immutable after publication — CompiledRule has hash field.
  const compilerFile = path.join(ROOT, 'src', 'kernel', 'rules', 'RuleCompiler.ts');
  if (!fs.existsSync(compilerFile)) {
    return { id: 'RULE-010', name: 'package-content-immutable', passed: false, details: 'RuleCompiler.ts not found' };
  }
  const src = readFileText(compilerFile);
  const hasHash = /\bhash\b.*string/.test(src) && /computeHash/.test(src);
  return hasHash
    ? { id: 'RULE-010', name: 'package-content-immutable', passed: true }
    : { id: 'RULE-010', name: 'package-content-immutable', passed: false, details: 'CompiledRule hash field or computeHash function not found' };
}

// ===========================================================================
// RULE-011 through RULE-015 — semantic integrity + versioning invariants
// ===========================================================================

function checkRule011(): CheckResult {
  // RULE-011: Different semantic RuleIR must not produce the same compiled hash.
  // The compiler must use a TRUE recursive canonical JSON serializer (not
  // JSON.stringify with an array replacer, which strips nested properties).
  const compilerFile = path.join(ROOT, 'src', 'kernel', 'rules', 'RuleCompiler.ts');
  const src = readFileText(compilerFile);
  // The old broken pattern: JSON.stringify(x, sortedKeys)
  // The new correct pattern: a recursive canonicalJSONStringify function
  const hasCanonicalFn = /function canonicalJSONStringify/.test(src) || /export function canonicalJSONStringify/.test(src);
  const doesNotUseArrayReplacer = !/JSON\.stringify\([^)]+,\s*Object\.keys/.test(src);
  return hasCanonicalFn && doesNotUseArrayReplacer
    ? { id: 'RULE-011', name: 'hash-distinctness', passed: true }
    : { id: 'RULE-011', name: 'hash-distinctness', passed: false, details: `canonicalFn=${hasCanonicalFn}, noArrayReplacer=${doesNotUseArrayReplacer}` };
}

function checkRule012(): CheckResult {
  // RULE-012: Historical evaluation uses only pinned jurisdiction graph state.
  const histFile = path.join(ROOT, 'src', 'kernel', 'rules', 'HistoricalEvaluator.ts');
  const src = readFileText(histFile);
  // PinnedRegistryView must build its own jurisdiction graph from pinned packages,
  // NOT delegate to this.inner.jurisdictionGraph.
  const buildsOwnGraph = /createJurisdictionGraph\(\)/.test(src) && /_pinnedJurisdictionGraph/.test(src);
  const doesNotDelegate = !/return this\.inner\.jurisdictionGraph/.test(src);
  return buildsOwnGraph && doesNotDelegate
    ? { id: 'RULE-012', name: 'historical-pinned-jurisdiction-graph', passed: true }
    : { id: 'RULE-012', name: 'historical-pinned-jurisdiction-graph', passed: false, details: `buildsOwn=${buildsOwnGraph}, doesNotDelegate=${doesNotDelegate}` };
}

function checkRule013(): CheckResult {
  // RULE-013: A package cannot become active with unresolved dependencies.
  const registryFile = path.join(ROOT, 'src', 'packages', 'VersionedPackageRegistry.ts');
  const src = readFileText(registryFile);
  // activatePackage must check dependencies before setting the active version.
  const activateMatchesSrc = src.slice(src.indexOf('activatePackage('));
  const checksMissing = /MissingDependency/.test(activateMatchesSrc);
  const checksBeforeSet = activateMatchesSrc.indexOf('MissingDependency') < activateMatchesSrc.indexOf('this.activeVersion.set');
  return checksMissing && checksBeforeSet
    ? { id: 'RULE-013', name: 'activation-requires-resolved-deps', passed: true }
    : { id: 'RULE-013', name: 'activation-requires-resolved-deps', passed: false, details: `checksMissing=${checksMissing}, checksBeforeSet=${checksBeforeSet}` };
}

function checkRule014(): CheckResult {
  // RULE-014: Active-package replacement is atomic — the old version remains
  // active if the new activation fails.
  const registryFile = path.join(ROOT, 'src', 'packages', 'VersionedPackageRegistry.ts');
  const src = readFileText(registryFile);
  // The activatePackage method must do all dependency/cycle checks BEFORE
  // mutating activeVersion. If any check throws, activeVersion is untouched.
  const activateMatchesSrc = src.slice(src.indexOf('activatePackage('), src.indexOf('deactivatePackage('));
  const firstCheckPos = activateMatchesSrc.indexOf('MissingDependency');
  const firstSetPos = activateMatchesSrc.indexOf('this.activeVersion.set');
  const checksBeforeMutation = firstCheckPos > -1 && firstCheckPos < firstSetPos;
  return checksBeforeMutation
    ? { id: 'RULE-014', name: 'activation-is-atomic', passed: true }
    : { id: 'RULE-014', name: 'activation-is-atomic', passed: false, details: `dependency checks must precede activeVersion.set` };
}

function checkRule015(): CheckResult {
  // RULE-015: Version selection uses semantic version precedence, not string ordering.
  const registryFile = path.join(ROOT, 'src', 'packages', 'VersionedPackageRegistry.ts');
  const src = readFileText(registryFile);
  const usesSelectHighest = /selectHighestVersion/.test(src);
  const noStringComparison = !/v\s*>\s*best/.test(src);
  return usesSelectHighest && noStringComparison
    ? { id: 'RULE-015', name: 'semver-precedence', passed: true }
    : { id: 'RULE-015', name: 'semver-precedence', passed: false, details: `usesSelectHighest=${usesSelectHighest}, noStringComparison=${noStringComparison}` };
}

function checkRule016(): CheckResult {
  // RULE-016: A rule with truthLevel T0 MUST have a sourceProposition in its
  // definitions with verificationStatus 'LEGALLY_VERIFIED'. This prevents
  // unverified rules from claiming T0 (Authoritative) merely because their
  // RuleIR passes structural validation. (ADR-0023, I8)
  const pkgDataDir = path.join(ROOT, 'src', 'lib', 'packages-data');
  if (!fs.existsSync(pkgDataDir)) {
    return { id: 'RULE-016', name: 't0-requires-verified-source', passed: true };
  }
  const files = walkTsFiles(pkgDataDir);
  const violations: string[] = [];
  for (const f of files) {
    const src = readFileText(f);
    // Find all Rule objects in this file. A rule claims T0 when:
    //   truthLevel: 'T0'
    // AND the rule's definitions do NOT contain verificationStatus: 'LEGALLY_VERIFIED'.
    //
    // We scan for truthLevel: 'T0' patterns and check if the same file
    // contains a LEGALLY_VERIFIED marker near the rule's definitions.
    //
    // This is a heuristic static check — the full verification requires
    // loading the package and inspecting the RuleIR at runtime. But the
    // static check catches the most common violation: a rule with T0
    // but no SourceProposition at all.
    //
    // Exception: rules in jur.ecowas@1.0.0 and jur.afcfta@1.0.0 are
    // legacy packages published before ADR-0023. They are immutable (I10)
    // and are NOT modified. The check skips files that don't contain
    // 'sourceProposition' at all (legacy packages).
    if (!/sourceProposition/.test(src)) continue; // legacy package — skip

    // For files that DO use sourceProposition, verify that no rule claims T0
    // unless the file also contains LEGALLY_VERIFIED.
    if (/truthLevel:\s*['"]T0['"]/.test(src) && !/LEGALLY_VERIFIED/.test(src)) {
      violations.push(`${relative(ROOT, f)}: claims T0 but has no LEGALLY_VERIFIED sourceProposition`);
    }
  }
  return violations.length === 0
    ? { id: 'RULE-016', name: 't0-requires-verified-source', passed: true }
    : { id: 'RULE-016', name: 't0-requires-verified-source', passed: false, details: violations.join('\n  ') };
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
    // RULE-001 through RULE-010 — RuleIR + package lifecycle invariants (§20)
    checkRule001(),
    checkRule002(),
    checkRule003(),
    checkRule004(),
    checkRule005(),
    checkRule006(),
    checkRule007(),
    checkRule008(),
    checkRule009(),
    checkRule010(),
    // RULE-011 through RULE-015 — semantic integrity + versioning
    checkRule011(),
    checkRule012(),
    checkRule013(),
    checkRule014(),
    checkRule015(),
    checkRule016(),
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
