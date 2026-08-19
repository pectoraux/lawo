/**
 * Nomos — SemVer 2.0.0 Regression Tests (RULE-015)
 * =================================================
 * Proves that the shared SemVer implementation correctly handles:
 *   - Caret ranges with zero versions (^0.2.3, ^0.0.3, ^0.9.9, ^1.2.3)
 *   - Prerelease precedence (numeric identifiers compared numerically)
 *   - Build metadata ignored for precedence
 *   - Numeric prerelease identifiers < non-numeric identifiers
 *   - Malformed versions/ranges fail closed
 *   - Leading zeroes rejected
 *   - Exact ranges remain exact
 *   - Tilde ranges remain correct
 */
import {
  parseSemver,
  isValidSemver,
  compareSemver,
  compareSemverStrings,
  satisfiesVersionRange,
  selectHighestVersion,
} from '../../src/packages/semver';

interface TestResult { name: string; passed: boolean; detail?: string; }
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail?: string): void {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// Caret correctness for zero versions
// ---------------------------------------------------------------------------

function testCaretMajorGtZero(): void {
  // ^1.2.3 => >=1.2.3 <2.0.0
  record('^1.2.3 — satisfies 1.2.3', satisfiesVersionRange('1.2.3', '^1.2.3'));
  record('^1.2.3 — satisfies 1.3.0', satisfiesVersionRange('1.3.0', '^1.2.3'));
  record('^1.2.3 — satisfies 1.9.9', satisfiesVersionRange('1.9.9', '^1.2.3'));
  record('^1.2.3 — rejects 2.0.0', !satisfiesVersionRange('2.0.0', '^1.2.3'));
  record('^1.2.3 — rejects 1.2.2', !satisfiesVersionRange('1.2.2', '^1.2.3'));
  record('^1.2.3 — rejects 0.9.9', !satisfiesVersionRange('0.9.9', '^1.2.3'));
}

function testCaretMajorZeroMinorGtZero(): void {
  // ^0.2.3 => >=0.2.3 <0.3.0
  record('^0.2.3 — satisfies 0.2.3', satisfiesVersionRange('0.2.3', '^0.2.3'));
  record('^0.2.3 — satisfies 0.2.9', satisfiesVersionRange('0.2.9', '^0.2.3'));
  record('^0.2.3 — rejects 0.3.0', !satisfiesVersionRange('0.3.0', '^0.2.3'));
  record('^0.2.3 — rejects 0.2.2', !satisfiesVersionRange('0.2.2', '^0.2.3'));
  record('^0.2.3 — rejects 1.0.0', !satisfiesVersionRange('1.0.0', '^0.2.3'));
}

function testCaretMajorZeroMinorZero(): void {
  // ^0.0.3 => >=0.0.3 <0.0.4
  record('^0.0.3 — satisfies 0.0.3', satisfiesVersionRange('0.0.3', '^0.0.3'));
  record('^0.0.3 — rejects 0.0.4', !satisfiesVersionRange('0.0.4', '^0.0.3'));
  record('^0.0.3 — rejects 0.0.2', !satisfiesVersionRange('0.0.2', '^0.0.3'));
  record('^0.0.3 — rejects 0.1.0', !satisfiesVersionRange('0.1.0', '^0.0.3'));
  record('^0.0.3 — rejects 1.0.0', !satisfiesVersionRange('1.0.0', '^0.0.3'));
}

function testCaretZeroNineNine(): void {
  // ^0.9.9 => >=0.9.9 <0.10.0
  record('^0.9.9 — satisfies 0.9.9', satisfiesVersionRange('0.9.9', '^0.9.9'));
  record('^0.9.9 — satisfies 0.9.99', satisfiesVersionRange('0.9.99', '^0.9.9'));
  record('^0.9.9 — rejects 0.10.0', !satisfiesVersionRange('0.10.0', '^0.9.9'));
  record('^0.9.9 — rejects 0.9.8', !satisfiesVersionRange('0.9.8', '^0.9.9'));
}

// ---------------------------------------------------------------------------
// Prerelease precedence
// ---------------------------------------------------------------------------

function testPrereleaseNumericOrdering(): void {
  // 1.0.0-alpha.10 > 1.0.0-alpha.2 (numeric, not lexical)
  const a = parseSemver('1.0.0-alpha.10')!;
  const b = parseSemver('1.0.0-alpha.2')!;
  const cmp = compareSemver(a, b);
  record('alpha.10 > alpha.2 (numeric)', cmp > 0, `cmp=${cmp}`);

  // 1.0.0-alpha.1 < 1.0.0-alpha.2
  const c = parseSemver('1.0.0-alpha.1')!;
  const d = parseSemver('1.0.0-alpha.2')!;
  const cmp2 = compareSemver(c, d);
  record('alpha.1 < alpha.2', cmp2 < 0, `cmp=${cmp2}`);
}

function testPrereleaseVsRelease(): void {
  // 1.0.0 > 1.0.0-alpha
  const cmp = compareSemverStrings('1.0.0', '1.0.0-alpha');
  record('1.0.0 > 1.0.0-alpha', cmp === 1, `cmp=${cmp}`);

  // 1.0.0-alpha < 1.0.0
  const cmp2 = compareSemverStrings('1.0.0-alpha', '1.0.0');
  record('1.0.0-alpha < 1.0.0', cmp2 === -1, `cmp=${cmp2}`);
}

function testNumericPrereleaseLtAlphanumeric(): void {
  // Numeric identifiers have LOWER precedence than non-numeric
  // 1.0.0-1 < 1.0.0-alpha (per SemVer spec §11)
  const a = parseSemver('1.0.0-1')!;
  const b = parseSemver('1.0.0-alpha')!;
  const cmp = compareSemver(a, b);
  record('1.0.0-1 < 1.0.0-alpha (numeric < alphanumeric)', cmp < 0, `cmp=${cmp}`);
}

function testBuildMetadataIgnored(): void {
  // Build metadata is ignored for precedence
  const cmp = compareSemverStrings('1.0.0+build1', '1.0.0+build2');
  record('1.0.0+build1 == 1.0.0+build2 (build ignored)', cmp === 0, `cmp=${cmp}`);

  const cmp2 = compareSemverStrings('1.2.3+exp.sha.5114f85', '1.2.3');
  record('1.2.3+exp.sha == 1.2.3 (build ignored)', cmp2 === 0, `cmp=${cmp2}`);
}

// ---------------------------------------------------------------------------
// Malformed input handling
// ---------------------------------------------------------------------------

function testMalformedVersionsRejected(): void {
  record('parseSemver rejects "1.2"', parseSemver('1.2') === null);
  record('parseSemver rejects "1.2.3.4"', parseSemver('1.2.3.4') === null);
  record('parseSemver rejects "v1.2.3"', parseSemver('v1.2.3') === null);
  record('parseSemver rejects "1.2.x"', parseSemver('1.2.x') === null);
  record('parseSemver rejects ""', parseSemver('') === null);
  record('parseSemver rejects "abc"', parseSemver('abc') === null);
  record('parseSemver rejects null', parseSemver(null as unknown as string) === null);
}

function testLeadingZeroesRejected(): void {
  // SemVer spec: numeric identifiers MUST NOT include leading zeroes
  record('parseSemver rejects "01.2.3"', parseSemver('01.2.3') === null);
  record('parseSemver rejects "1.02.3"', parseSemver('1.02.3') === null);
  record('parseSemver rejects "1.2.03"', parseSemver('1.2.03') === null);
  record('parseSemver rejects "1.2.3-01"', parseSemver('1.2.3-01') === null,
    'prerelease numeric identifiers must not have leading zeroes');
}

function testMalformedRangesFailClosed(): void {
  record('satisfiesVersionRange rejects malformed version', !satisfiesVersionRange('not-a-version', '^1.0.0'));
  record('satisfiesVersionRange rejects malformed range', !satisfiesVersionRange('1.0.0', 'not-a-range'));
  record('satisfiesVersionRange rejects null version', !satisfiesVersionRange(null as unknown as string, '^1.0.0'));
  record('satisfiesVersionRange rejects null range', !satisfiesVersionRange('1.0.0', null as unknown as string));
}

// ---------------------------------------------------------------------------
// Exact and tilde ranges
// ---------------------------------------------------------------------------

function testExactRanges(): void {
  record('exact 1.2.3 — satisfies 1.2.3', satisfiesVersionRange('1.2.3', '1.2.3'));
  record('exact 1.2.3 — rejects 1.2.4', !satisfiesVersionRange('1.2.4', '1.2.3'));
  record('exact 1.2.3 — rejects 1.3.0', !satisfiesVersionRange('1.3.0', '1.2.3'));
  record('exact with prerelease — satisfies', satisfiesVersionRange('1.0.0-alpha', '1.0.0-alpha'));
  record('exact with build — satisfies (build ignored)', satisfiesVersionRange('1.0.0+build', '1.0.0'));
}

function testTildeRanges(): void {
  // ~1.2.3 => >=1.2.3 <1.3.0
  record('~1.2.3 — satisfies 1.2.3', satisfiesVersionRange('1.2.3', '~1.2.3'));
  record('~1.2.3 — satisfies 1.2.9', satisfiesVersionRange('1.2.9', '~1.2.3'));
  record('~1.2.3 — rejects 1.3.0', !satisfiesVersionRange('1.3.0', '~1.2.3'));
  record('~1.2.3 — rejects 1.2.2', !satisfiesVersionRange('1.2.2', '~1.2.3'));
}

// ---------------------------------------------------------------------------
// Select highest version
// ---------------------------------------------------------------------------

function testSelectHighestVersion(): void {
  record('selectHighestVersion([1.9.0, 1.10.0]) → 1.10.0',
    selectHighestVersion(['1.9.0', '1.10.0']) === '1.10.0');
  record('selectHighestVersion([2.0.0, 1.10.0]) → 2.0.0',
    selectHighestVersion(['2.0.0', '1.10.0']) === '2.0.0');
  record('selectHighestVersion([1.0.0-alpha, 1.0.0]) → 1.0.0',
    selectHighestVersion(['1.0.0-alpha', '1.0.0']) === '1.0.0');
  record('selectHighestVersion([1.0.0-alpha.2, 1.0.0-alpha.10]) → 1.0.0-alpha.10',
    selectHighestVersion(['1.0.0-alpha.2', '1.0.0-alpha.10']) === '1.0.0-alpha.10');
  record('selectHighestVersion([]) → null',
    selectHighestVersion([]) === null);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('Nomos — SemVer 2.0.0 Regression Tests (RULE-015)');
  console.log('=================================================');
  console.log();

  testCaretMajorGtZero();
  testCaretMajorZeroMinorGtZero();
  testCaretMajorZeroMinorZero();
  testCaretZeroNineNine();
  testPrereleaseNumericOrdering();
  testPrereleaseVsRelease();
  testNumericPrereleaseLtAlphanumeric();
  testBuildMetadataIgnored();
  testMalformedVersionsRejected();
  testLeadingZeroesRejected();
  testMalformedRangesFailClosed();
  testExactRanges();
  testTildeRanges();
  testSelectHighestVersion();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log();
  console.log('--------------------------------------');
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main();
