/**
 * Nomos — Historical Reproducibility Tests
 * --------------------------------------------------
 * Verifies the HistoricalEvaluator:
 *   - Returns identical results for identical pinned versions.
 *   - Returns potentially different results when different versions are pinned.
 *   - Throws HistoricalResolutionError when a pinned version doesn't exist.
 *   - Populates Provenance with the exact pinned packageId + version (RULE-008).
 *
 * Usage:  bun run tests/historical-reproducibility/run.ts
 */
import type {
  Authority,
  ContextRequest,
  Evidence,
  Jurisdiction,
  JurisdictionEdge,
  PackageManifest,
  Procedure,
  Rule,
  Situation,
  Source,
  Action,
} from '@/kernel/primitives/types';
import type { LoadedPackage } from '@/packages/loader';
import {
  createVersionedPackageRegistry,
} from '@/packages/VersionedPackageRegistry';
import {
  evaluateHistorically,
  type PinnedPackageVersion,
} from '@/kernel/rules/HistoricalEvaluator';
import { HistoricalResolutionError } from '@/kernel/errors';

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
// Fixtures — build two versions of the same package with different rules
// ---------------------------------------------------------------------------

function makeRule(
  ruleId: string,
  packageId: string,
  effectLabel: string,
  threshold: number,
): Rule {
  return {
    id: ruleId,
    code: ruleId.toUpperCase(),
    title: `Rule ${ruleId}`,
    jurisdictionId: 'jur.test',
    authorityId: 'auth.test',
    sourceId: 'src.test',
    type: 'DETERMINISTIC',
    ruleIr: {
      id: `ruleir.${ruleId}`,
      ruleId,
      conditions: { kind: 'leaf', fact: 'test.value', operator: 'gt', value: threshold },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_HIST', label: effectLabel }],
    },
    temporal: {
      validFrom: '2020-01-01',
      validTo: null,
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId,
    truthLevel: 'T0',
  };
}

function makeManifest(packageId: string, version: string): PackageManifest {
  return {
    packageId,
    name: `${packageId} v${version}`,
    version,
    category: 'DOMAIN',
    dependencies: [],
    supportedJurisdictions: ['jur.test'],
    domains: ['test'],
    situations: [],
    capabilities: [],
    sources: ['src.test'],
    rules: ['rule.test.history'],
    procedures: [],
    actions: [],
    schemas: [],
    testFixtures: [],
    verificationMetadata: {
      signedBy: 'test-bot',
      signedAt: '2025-01-01T00:00:00.000Z',
      hash: `sha256:${packageId}:${version}:${'0'.repeat(64)}`,
    },
    description: `Test package ${packageId}@${version}`,
  };
}

function makeLoadedPackage(
  manifest: PackageManifest,
  rule: Rule,
): LoadedPackage {
  const jurisdictions: Jurisdiction[] = [
    {
      id: 'jur.test',
      code: 'TEST',
      name: 'Test',
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
  return {
    manifest,
    jurisdictions,
    jurisdictionEdges: [] as JurisdictionEdge[],
    authorities,
    sources,
    rules: [rule],
    situations: [] as Situation[],
    procedures: [] as Procedure[],
    actions: [] as Action[],
    evidence: [] as Evidence[],
  };
}

function makeRequest(value: number): ContextRequest {
  return {
    subjectId: 'subj.test',
    asOf: '2025-01-15',
    facts: [
      {
        id: 'fact.test.value',
        subjectId: 'subj.test',
        attribute: 'test.value',
        value,
        truthLevel: 'T0',
        observedAt: '2025-01-15',
        tenantId: null,
      },
    ],
    jurisdictionIds: ['jur.test'],
    tenantId: null,
  };
}

// Build a registry with two versions of pkg.test:
//   v1.0.0 — rule fires when value > 5  → label "Right V1"
//   v2.0.0 — rule fires when value > 50  → label "Right V2"
function buildRegistry() {
  const r = createVersionedPackageRegistry();
  const rule1 = makeRule('rule.test.history', 'pkg.test', 'Right V1', 5);
  const rule2 = makeRule('rule.test.history', 'pkg.test', 'Right V2', 50);
  r.registerPackage(makeLoadedPackage(makeManifest('pkg.test', '1.0.0'), rule1));
  r.registerPackage(makeLoadedPackage(makeManifest('pkg.test', '2.0.0'), rule2));
  return r;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testSameVersionSameResult(): void {
  const r = buildRegistry();
  const pins: PinnedPackageVersion[] = [{ packageId: 'pkg.test', version: '1.0.0' }];
  const req = makeRequest(10);
  const a = evaluateHistorically(req, r, pins);
  const b = evaluateHistorically(req, r, pins);
  const sameFired = a.state.firedEffects.length === b.state.firedEffects.length;
  const sameLabel = a.state.firedEffects[0]?.effect.label === b.state.firedEffects[0]?.effect.label;
  record(
    'same pinned version → identical result',
    sameFired && sameLabel,
    `a=${a.state.firedEffects[0]?.effect.label}, b=${b.state.firedEffects[0]?.effect.label}`,
  );
}

function testDifferentVersionDifferentResult(): void {
  const r = buildRegistry();
  const req = makeRequest(10); // value 10
  // v1 fires (10 > 5), v2 does NOT fire (10 > 50 is false)
  const v1 = evaluateHistorically(req, r, [{ packageId: 'pkg.test', version: '1.0.0' }]);
  const v2 = evaluateHistorically(req, r, [{ packageId: 'pkg.test', version: '2.0.0' }]);
  record(
    'different pinned version → potentially different result',
    v1.state.firedEffects.length === 1 && v2.state.firedEffects.length === 0,
  );
}

function testMissingVersionThrows(): void {
  const r = buildRegistry();
  let threw = false;
  try {
    evaluateHistorically(makeRequest(10), r, [{ packageId: 'pkg.test', version: '9.9.9' }]);
  } catch (e) {
    threw = e instanceof HistoricalResolutionError;
  }
  record('missing pinned version throws HistoricalResolutionError', threw);
}

function testProvenanceCarriesExactPackageVersion(): void {
  const r = buildRegistry();
  const result = evaluateHistorically(
    makeRequest(10),
    r,
    [{ packageId: 'pkg.test', version: '1.0.0' }],
  );
  const p = result.provenance[0];
  record(
    'provenance carries exact packageId + packageVersion',
    p !== undefined && p.packageId === 'pkg.test' && p.packageVersion === '1.0.0',
    `packageId=${p?.packageId}, packageVersion=${p?.packageVersion}`,
  );
}

function testHistoricalIgnoresActiveVersion(): void {
  const r = buildRegistry();
  // Even if v2 is "active", historical eval with pin=v1 must return v1 result.
  r.activatePackage('pkg.test', '2.0.0');
  const result = evaluateHistorically(
    makeRequest(10),
    r,
    [{ packageId: 'pkg.test', version: '1.0.0' }],
  );
  record(
    'historical evaluation ignores currently-active version',
    result.state.firedEffects.length === 1 &&
      result.state.firedEffects[0]!.effect.label === 'Right V1',
    `label=${result.state.firedEffects[0]?.effect.label}`,
  );
}

function testMultiplePinnedPackages(): void {
  const r = createVersionedPackageRegistry();
  // pkg.a depends on pkg.b (both at v1.0.0).
  r.registerPackage(makeLoadedPackage(
    makeManifest('pkg.a', '1.0.0'),
    makeRule('rule.test.a', 'pkg.a', 'Right A', 5),
  ));
  r.registerPackage(makeLoadedPackage(
    makeManifest('pkg.b', '1.0.0'),
    makeRule('rule.test.b', 'pkg.b', 'Right B', 5),
  ));
  const result = evaluateHistorically(
    makeRequest(10),
    r,
    [
      { packageId: 'pkg.a', version: '1.0.0' },
      { packageId: 'pkg.b', version: '1.0.0' },
    ],
  );
  // Both rules fire (value=10 > 5 for both).
  record(
    'multiple pinned packages contribute rules',
    result.state.firedEffects.length === 2,
    `firedCount=${result.state.firedEffects.length}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('Nomos — Historical Reproducibility Tests');
  console.log('==========================================');
  console.log();
  testSameVersionSameResult();
  testDifferentVersionDifferentResult();
  testMissingVersionThrows();
  testProvenanceCarriesExactPackageVersion();
  testHistoricalIgnoresActiveVersion();
  testMultiplePinnedPackages();
  await testGoldenHistoricalStability();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log();
  console.log('------------------------------------------');
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

void main();

// ---------------------------------------------------------------------------
// Golden historical fixture: v1 result stable after v2 registered + activated
// (I13 / RULE-009 regression test)
// ---------------------------------------------------------------------------

async function testGoldenHistoricalStability(): Promise<void> {
  const registry = createVersionedPackageRegistry();

  // VERSION 1: a simple test package with one jurisdiction + one rule.
  const jur1 = {
    id: 'jur.test.golden',
    code: 'TEST_GOLDEN',
    name: 'Test Golden Jurisdiction',
    kind: 'COUNTRY' as const,
    parentIds: [],
    temporal: { validFrom: '2020-01-01', validTo: null, version: 1, supersedes: null, supersededBy: null },
  };
  const rule1 = makeTestRule('rule.golden.v1', 'jur.test.golden', 'pkg.golden', 'RIGHT_GOLDEN_V1', 'Right Golden V1');
  const pkg1 = makeTestPackage('pkg.golden', '1.0.0', [rule1], [jur1], []);
  registry.registerPackage(pkg1);
  registry.activatePackage('pkg.golden', '1.0.0');

  // Evaluate with v1 pinned.
  const facts = [
    { id: 'f1', subjectId: 'subj_golden', attribute: 'value', value: 42, truthLevel: 'T0' as const, observedAt: '2025-01-15', tenantId: null },
  ];
  const request = {
    subjectId: 'subj_golden',
    asOf: '2025-06-01',
    situationId: undefined,
    facts,
    jurisdictionIds: ['jur.test.golden'],
    objective: undefined,
    tenantId: null as string | null,
  };

  const result1 = evaluateHistorically(request, registry, [
    { packageId: 'pkg.golden', version: '1.0.0' },
  ]);

  const firedCount1 = result1.state.firedEffects.length;

  // VERSION 2: same packageId, different version — new rule + new jurisdiction edge.
  const jur2 = {
    ...jur1,
    temporal: { ...jur1.temporal, version: 2 },
  };
  const rule2 = makeTestRule('rule.golden.v2', 'jur.test.golden', 'pkg.golden', 'RIGHT_GOLDEN_V2', 'Right Golden V2');
  const pkg2 = makeTestPackage('pkg.golden', '2.0.0', [rule2], [jur2], []);
  registry.registerPackage(pkg2);
  registry.activatePackage('pkg.golden', '2.0.0');

  // Evaluate with v1 STILL pinned — result must be identical to the first evaluation.
  const result2 = evaluateHistorically(request, registry, [
    { packageId: 'pkg.golden', version: '1.0.0' },
  ]);

  const firedCount2 = result2.state.firedEffects.length;

  // The v1 evaluation must produce the SAME result after v2 was registered + activated.
  // This proves historical reproducibility (I13 / RULE-009).
  const sameFiredCount = firedCount1 === firedCount2;
  const sameEffectCodes = JSON.stringify(result1.state.firedEffects.map((e: { effect: { code: string } }) => e.effect.code).sort())
    === JSON.stringify(result2.state.firedEffects.map((e: { effect: { code: string } }) => e.effect.code).sort());

  record('golden historical — v1 result stable after v2 registered + activated',
    sameFiredCount && sameEffectCodes,
    `v1 firedCount=${firedCount1}, v2-pinned-as-v1 firedCount=${firedCount2}, sameCodes=${sameEffectCodes}`);
}

// Helper: create a simple test rule that fires when value > 10.
function makeTestRule(ruleId: string, jurisdictionId: string, packageId: string, effectCode: string, effectLabel: string): import('@/kernel/primitives/types').Rule {
  return {
    id: ruleId,
    code: ruleId.toUpperCase(),
    title: `Test Rule ${ruleId}`,
    jurisdictionId,
    authorityId: 'auth.test',
    sourceId: 'src.test',
    type: 'DETERMINISTIC' as const,
    packageId,
    truthLevel: 'T0' as const,
    temporal: { validFrom: '2020-01-01', validTo: null, version: 1, supersedes: null, supersededBy: null },
    ruleIr: {
      id: `ruleir.${ruleId}`,
      ruleId,
      conditions: { kind: 'leaf', fact: 'value', operator: 'gt', value: 10 },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: effectCode, label: effectLabel }],
    },
  };
}

// Helper: create a simple test package.
function makeTestPackage(packageId: string, version: string, rules: import('@/kernel/primitives/types').Rule[], jurisdictions: import('@/kernel/primitives/types').Jurisdiction[], edges: import('@/kernel/primitives/types').JurisdictionEdge[]): import('@/packages/loader').LoadedPackage {
  return {
    manifest: {
      packageId,
      name: `Test Package ${version}`,
      version,
      category: 'JURISDICTION' as const,
      dependencies: [],
      supportedJurisdictions: jurisdictions.map((j) => j.id),
      domains: [],
      situations: [],
      capabilities: [],
      sources: ['src.test'],
      rules: rules.map((r) => r.id),
      procedures: [],
      actions: [],
      schemas: [],
      testFixtures: [],
      verificationMetadata: { signedBy: 'test', signedAt: '2020-01-01', hash: `hash-${version}` },
      description: `Test package ${version}`,
    },
    jurisdictions,
    jurisdictionEdges: edges,
    authorities: [{ id: 'auth.test', name: 'Test Authority', jurisdictionId: jurisdictions[0]?.id ?? 'jur.test', kind: 'OTHER' as const }],
    sources: [{ id: 'src.test', title: 'Test Source', citation: 'Test Citation', authorityId: 'auth.test' }],
    rules,
    situations: [],
    procedures: [],
    actions: [],
    evidence: [],
  };
}
