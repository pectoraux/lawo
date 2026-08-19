/**
 * Nomos — Package Validator Unit Tests
 * --------------------------------------------------
 * Verifies the PackageValidator correctly accepts valid packages and rejects
 * invalid ones (missing dependency, invalid rule, duplicate rule IDs, bad
 * manifest fields, missing verification metadata).
 *
 * Usage:  bun run tests/package-validation/run.ts
 */
import type {
  Authority,
  Jurisdiction,
  PackageManifest,
  Rule,
  Source,
} from '@/kernel/primitives/types';
import type { LoadedPackage } from '@/packages/loader';
import { validatePackage } from '@/packages/PackageValidator';
import { satisfiesVersionRange } from '@/packages/semver';

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, detail?: string): void {
  results.push({ name, passed, detail });
  const mark = passed ? '\u2713' : '\u2717';
  console.log(`  ${mark} ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// Package factory
// ---------------------------------------------------------------------------
function makeValidPackage(overrides: Partial<LoadedPackage> = {}): LoadedPackage {
  const manifest: PackageManifest = {
    packageId: 'pkg.test',
    name: 'Test Package',
    version: '1.0.0',
    category: 'DOMAIN',
    dependencies: [],
    supportedJurisdictions: ['jur.test'],
    domains: ['test'],
    situations: [],
    capabilities: [],
    sources: ['src.test'],
    rules: ['rule.test.001'],
    procedures: [],
    actions: [],
    schemas: [],
    testFixtures: [],
    verificationMetadata: {
      signedBy: 'test-bot',
      signedAt: '2025-01-01T00:00:00.000Z',
      hash: 'sha256:pkg.test:1.0.0:0000000000000000000000000000000000000000000000000000000000000000',
    },
    description: 'A test package.',
  };
  const jurisdictions: Jurisdiction[] = [
    {
      id: 'jur.test',
      code: 'TEST',
      name: 'Test Jurisdiction',
      kind: 'COUNTRY',
      parentIds: [],
      temporal: {
        validFrom: '2020-01-01',
        validTo: null,
        version: 1,
        supersedes: null,
        supersededBy: null,
      },
    },
  ];
  const authorities: Authority[] = [
    { id: 'auth.test', name: 'Test Authority', jurisdictionId: 'jur.test', kind: 'OTHER' },
  ];
  const sources: Source[] = [
    { id: 'src.test', title: 'Test Source', citation: 'Test Citation', authorityId: 'auth.test' },
  ];
  const rules: Rule[] = [
    {
      id: 'rule.test.001',
      code: 'TEST-001',
      title: 'Test Rule',
      jurisdictionId: 'jur.test',
      authorityId: 'auth.test',
      sourceId: 'src.test',
      type: 'DETERMINISTIC',
      ruleIr: {
        id: 'ruleir.test.001',
        ruleId: 'rule.test.001',
        conditions: { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
        exceptions: [],
        effects: [{ kind: 'RIGHT', code: 'RIGHT_TEST', label: 'Right' }],
      },
      temporal: {
        validFrom: '2020-01-01',
        validTo: null,
        version: 1,
        supersedes: null,
        supersededBy: null,
      },
      packageId: 'pkg.test',
      truthLevel: 'T0',
    },
  ];
  return {
    manifest: overrides.manifest ?? manifest,
    jurisdictions: overrides.jurisdictions ?? jurisdictions,
    jurisdictionEdges: [],
    authorities: overrides.authorities ?? authorities,
    sources: overrides.sources ?? sources,
    rules: overrides.rules ?? rules,
    situations: [],
    procedures: [],
    actions: [],
    evidence: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testValidPackagePasses(): void {
  const pkg = makeValidPackage();
  const result = validatePackage(pkg);
  record('valid package passes', result.valid, result.errors.join('; '));
}

function testMissingPackageIdFails(): void {
  const pkg = makeValidPackage({
    manifest: { ...makeValidPackage().manifest, packageId: '' },
  });
  const result = validatePackage(pkg);
  record('missing packageId fails', !result.valid && result.errors.some((e) => e.includes('packageId')));
}

function testInvalidVersionFails(): void {
  const pkg = makeValidPackage({
    manifest: { ...makeValidPackage().manifest, version: 'not-semver' },
  });
  const result = validatePackage(pkg);
  record('invalid version (non-semver) fails', !result.valid && result.errors.some((e) => e.includes('semver')));
}

function testInvalidCategoryFails(): void {
  const pkg = makeValidPackage({
    manifest: { ...makeValidPackage().manifest, category: 'BOGUS' as PackageManifest['category'] },
  });
  const result = validatePackage(pkg);
  record('invalid category fails', !result.valid && result.errors.some((e) => e.includes('category')));
}

function testMissingVerificationMetadataFails(): void {
  const pkg = makeValidPackage({
    manifest: {
      ...makeValidPackage().manifest,
      verificationMetadata: {
        signedBy: '',
        signedAt: '',
        hash: '',
      },
    },
  });
  const result = validatePackage(pkg);
  record(
    'missing verificationMetadata fields fail',
    !result.valid &&
      result.errors.some((e) => e.includes('signedBy')) &&
      result.errors.some((e) => e.includes('signedAt')) &&
      result.errors.some((e) => e.includes('hash')),
  );
}

function testInvalidRuleFails(): void {
  const pkg = makeValidPackage({
    rules: [
      {
        ...makeValidPackage().rules[0]!,
        id: '', // invalid
      },
    ],
  });
  const result = validatePackage(pkg);
  record('invalid rule fails package validation', !result.valid && result.errors.some((e) => e.includes('rule.id')));
}

function testDuplicateRuleIdsFail(): void {
  const baseRule = makeValidPackage().rules[0]!;
  const pkg = makeValidPackage({
    rules: [baseRule, { ...baseRule }],
  });
  const result = validatePackage(pkg);
  record('duplicate rule IDs fail', !result.valid && result.errors.some((e) => e.includes('duplicate rule id')));
}

function testDuplicateJurisdictionCodesFail(): void {
  const base = makeValidPackage();
  const dupJur: Jurisdiction = {
    ...base.jurisdictions[0]!,
    id: 'jur.test2',
    code: 'TEST', // duplicate code
  };
  const pkg = makeValidPackage({ jurisdictions: [...base.jurisdictions, dupJur] });
  const result = validatePackage(pkg);
  record('duplicate jurisdiction codes fail', !result.valid && result.errors.some((e) => e.includes('duplicate jurisdiction code')));
}

function testUnknownJurisdictionIdInRuleFails(): void {
  const base = makeValidPackage();
  const pkg = makeValidPackage({
    rules: [{ ...base.rules[0]!, jurisdictionId: 'jur.unknown' }],
  });
  const result = validatePackage(pkg);
  record('rule with unknown jurisdictionId fails', !result.valid && result.errors.some((e) => e.includes('unknown jurisdictionId')));
}

function testUnknownAuthorityIdInRuleFails(): void {
  const base = makeValidPackage();
  const pkg = makeValidPackage({
    rules: [{ ...base.rules[0]!, authorityId: 'auth.unknown' }],
  });
  const result = validatePackage(pkg);
  record('rule with unknown authorityId fails', !result.valid && result.errors.some((e) => e.includes('unknown authorityId')));
}

function testUnknownSourceIdInRuleFails(): void {
  const base = makeValidPackage();
  const pkg = makeValidPackage({
    rules: [{ ...base.rules[0]!, sourceId: 'src.unknown' }],
  });
  const result = validatePackage(pkg);
  record('rule with unknown sourceId fails', !result.valid && result.errors.some((e) => e.includes('unknown sourceId')));
}

function testSatisfiesVersionRange(): void {
  const cases: Array<[string, string, boolean]> = [
    ['1.0.0', '^1.0.0', true],
    ['1.5.0', '^1.0.0', true],
    ['2.0.0', '^1.0.0', false],
    ['1.2.3', '~1.2.0', true],
    ['1.3.0', '~1.2.0', false],
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '1.2.3', false],
    ['1.5.0', '>=1.0.0', true],
    ['0.9.0', '>=1.0.0', false],
    ['1.5.0', '*', true],
    ['2.0.0', '<2.0.0', false],
    ['1.9.0', '<2.0.0', true],
  ];
  let allOk = true;
  for (const [version, range, expected] of cases) {
    const actual = satisfiesVersionRange(version, range);
    if (actual !== expected) {
      allOk = false;
      console.log(`      \u2192 satisfiesVersionRange('${version}', '${range}') = ${actual} (expected ${expected})`);
    }
  }
  record('satisfiesVersionRange — all semver cases', allOk);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  console.log('Nomos — Package Validator Unit Tests');
  console.log('======================================');
  console.log();
  testValidPackagePasses();
  testMissingPackageIdFails();
  testInvalidVersionFails();
  testInvalidCategoryFails();
  testMissingVerificationMetadataFails();
  testInvalidRuleFails();
  testDuplicateRuleIdsFail();
  testDuplicateJurisdictionCodesFail();
  testUnknownJurisdictionIdInRuleFails();
  testUnknownAuthorityIdInRuleFails();
  testUnknownSourceIdInRuleFails();
  testSatisfiesVersionRange();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log();
  console.log('--------------------------------------');
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main();
