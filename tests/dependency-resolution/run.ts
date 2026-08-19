/**
 * Nomos — Dependency Resolution Tests
 * --------------------------------------------------
 * Verifies the VersionedPackageRegistry correctly:
 *   - Resolves dependencies against the registry
 *   - Detects unsatisfied / missing dependencies
 *   - Detects cycles in the dependency graph
 *   - Resolves valid dependency graphs
 *   - Activates / deactivates versions; only one version active per package
 *
 * Usage:  bun run tests/dependency-resolution/run.ts
 */
import type {
  Authority,
  Jurisdiction,
  PackageManifest,
  Rule,
  Source,
} from '@/kernel/primitives/types';
import type { LoadedPackage } from '@/packages/loader';
import {
  createVersionedPackageRegistry,
  type VersionedPackageRegistry,
} from '@/packages/VersionedPackageRegistry';
import { InvalidPackage } from '@/kernel/errors';

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
// Factories
// ---------------------------------------------------------------------------
function makeManifest(
  packageId: string,
  version: string,
  deps: { packageId: string; versionRange: string }[] = [],
  overrides: Partial<PackageManifest> = {},
): PackageManifest {
  return {
    packageId,
    name: packageId,
    version,
    category: 'CAPABILITY',
    dependencies: deps,
    supportedJurisdictions: [],
    domains: [],
    situations: [],
    capabilities: [],
    sources: [],
    rules: [],
    procedures: [],
    actions: [],
    schemas: [],
    testFixtures: [],
    verificationMetadata: {
      signedBy: 'test-bot',
      signedAt: '2025-01-01T00:00:00.000Z',
      hash: `sha256:${packageId}:${version}:0000000000000000000000000000000000000000000000000000000000000000`,
    },
    description: `Test package ${packageId}@${version}`,
    ...overrides,
  };
}

function makePackage(
  manifest: PackageManifest,
  opts: { rules?: Rule[]; jurisdictions?: Jurisdiction[]; authorities?: Authority[]; sources?: Source[] } = {},
): LoadedPackage {
  return {
    manifest,
    jurisdictions: opts.jurisdictions ?? [],
    jurisdictionEdges: [],
    authorities: opts.authorities ?? [],
    sources: opts.sources ?? [],
    rules: opts.rules ?? [],
    situations: [],
    procedures: [],
    actions: [],
    evidence: [],
  };
}

function makeRule(
  ruleId: string,
  packageId: string,
  sourceId: string,
  authorityId: string,
  jurisdictionId: string,
): Rule {
  return {
    id: ruleId,
    code: ruleId.toUpperCase(),
    title: `Rule ${ruleId}`,
    jurisdictionId,
    authorityId,
    sourceId,
    type: 'DETERMINISTIC',
    ruleIr: {
      id: `ruleir.${ruleId}`,
      ruleId,
      conditions: { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_X', label: 'Right' }],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testRegistryStartsEmpty(): void {
  const r = createVersionedPackageRegistry();
  record('registry starts empty', r.listPackages().length === 0 && r.getActivePackages().length === 0);
}

function testRegisterValidPackage(): void {
  const r = createVersionedPackageRegistry();
  const pkg = makePackage(makeManifest('pkg.a', '1.0.0'));
  r.registerPackage(pkg);
  record('register a valid package', r.listVersions('pkg.a').length === 1);
}

function testRegisterInvalidPackageThrows(): void {
  const r = createVersionedPackageRegistry();
  const badManifest = makeManifest('pkg.bad', 'not-semver');
  const pkg = makePackage(badManifest);
  let threw = false;
  try {
    r.registerPackage(pkg);
  } catch (e) {
    threw = e instanceof InvalidPackage;
  }
  record('register invalid package throws InvalidPackage', threw);
}

function testActivateAndDeactivateVersion(): void {
  const r = createVersionedPackageRegistry();
  r.registerPackage(makePackage(makeManifest('pkg.a', '1.0.0')));
  r.activatePackage('pkg.a', '1.0.0');
  record('activate version sets active version', r.getActiveVersion('pkg.a') === '1.0.0');
  r.deactivatePackage('pkg.a', '1.0.0');
  record('deactivate version clears active version', r.getActiveVersion('pkg.a') === undefined);
}

function testMultipleVersionsCoexist(): void {
  const r = createVersionedPackageRegistry();
  r.registerPackage(makePackage(makeManifest('pkg.a', '1.0.0')));
  r.registerPackage(makePackage(makeManifest('pkg.a', '2.0.0')));
  const versions = r.listVersions('pkg.a');
  record('multiple versions of same package coexist', versions.length === 2 && versions.includes('1.0.0') && versions.includes('2.0.0'));
}

function testOnlyOneVersionActiveAtATime(): void {
  const r = createVersionedPackageRegistry();
  r.registerPackage(makePackage(makeManifest('pkg.a', '1.0.0')));
  r.registerPackage(makePackage(makeManifest('pkg.a', '2.0.0')));
  r.activatePackage('pkg.a', '1.0.0');
  r.activatePackage('pkg.a', '2.0.0');
  record('only one version active at a time', r.getActiveVersion('pkg.a') === '2.0.0');
}

function testResolveDependenciesAllSatisfied(): void {
  const r = createVersionedPackageRegistry();
  r.registerPackage(makePackage(makeManifest('pkg.base', '1.0.0')));
  r.registerPackage(makePackage(makeManifest('pkg.dep', '1.0.0', [{ packageId: 'pkg.base', versionRange: '^1.0.0' }])));
  r.activatePackage('pkg.base', '1.0.0');
  r.activatePackage('pkg.dep', '1.0.0');
  const deps = r.resolveDependencies('pkg.dep', '1.0.0');
  record(
    'resolveDependencies — satisfied when version in range',
    deps.length === 1 && deps[0]!.satisfied && deps[0]!.version === '1.0.0',
  );
}

function testResolveDependenciesMissingFails(): void {
  const r = createVersionedPackageRegistry();
  r.registerPackage(makePackage(makeManifest('pkg.dep', '1.0.0', [{ packageId: 'pkg.missing', versionRange: '^1.0.0' }])));
  const deps = r.resolveDependencies('pkg.dep', '1.0.0');
  record(
    'resolveDependencies — missing dependency marked unsatisfied',
    deps.length === 1 && !deps[0]!.satisfied,
  );
}

function testResolveDependenciesVersionOutOfRangeFails(): void {
  const r = createVersionedPackageRegistry();
  r.registerPackage(makePackage(makeManifest('pkg.base', '2.0.0')));
  r.registerPackage(makePackage(makeManifest('pkg.dep', '1.0.0', [{ packageId: 'pkg.base', versionRange: '^1.0.0' }])));
  r.activatePackage('pkg.base', '2.0.0');
  const deps = r.resolveDependencies('pkg.dep', '1.0.0');
  record(
    'resolveDependencies — version out of range marked unsatisfied',
    deps.length === 1 && !deps[0]!.satisfied,
  );
}

function testDetectNoCyclesInAcyclicGraph(): void {
  const r = createVersionedPackageRegistry();
  r.registerPackage(makePackage(makeManifest('pkg.a', '1.0.0')));
  r.registerPackage(makePackage(makeManifest('pkg.b', '1.0.0', [{ packageId: 'pkg.a', versionRange: '^1.0.0' }])));
  r.registerPackage(makePackage(makeManifest('pkg.c', '1.0.0', [{ packageId: 'pkg.b', versionRange: '^1.0.0' }])));
  r.activatePackage('pkg.a', '1.0.0');
  r.activatePackage('pkg.b', '1.0.0');
  r.activatePackage('pkg.c', '1.0.0');
  const cycles = r.detectCycles();
  record('detectCycles — returns empty for acyclic graph', cycles.length === 0);
}

function testDetectCyclesInCyclicGraph(): void {
  const r = createVersionedPackageRegistry();
  // pkg.a depends on pkg.b, pkg.b depends on pkg.a — a 2-cycle.
  r.registerPackage(makePackage(makeManifest('pkg.a', '1.0.0', [{ packageId: 'pkg.b', versionRange: '^1.0.0' }])));
  r.registerPackage(makePackage(makeManifest('pkg.b', '1.0.0', [{ packageId: 'pkg.a', versionRange: '^1.0.0' }])));
  // Activation must fail — the cycle is detected (RULE-013).
  let activateThrew = false;
  try {
    r.activatePackage('pkg.a', '1.0.0');
  } catch {
    activateThrew = true;
  }
  const cycles = r.detectCycles();
  record('detectCycles — returns a cycle for cyclic graph', cycles.length > 0 && activateThrew, `cycles=${JSON.stringify(cycles)}, activateThrew=${activateThrew}`);
}

function testGetRulesAtVersion(): void {
  const r = createVersionedPackageRegistry();
  const rule1 = makeRule('rule.test.1', 'pkg.a', 'src.test', 'auth.test', 'jur.test');
  const rule2 = makeRule('rule.test.2', 'pkg.a', 'src.test', 'auth.test', 'jur.test');
  r.registerPackage(makePackage(
    makeManifest('pkg.a', '1.0.0'),
    {
      rules: [rule1],
      authorities: [{ id: 'auth.test', name: 'Test', jurisdictionId: 'jur.test', kind: 'OTHER' }],
      sources: [{ id: 'src.test', title: 'Test', citation: 'Test', authorityId: 'auth.test' }],
      jurisdictions: [{
        id: 'jur.test',
        code: 'TEST',
        name: 'Test',
        kind: 'COUNTRY',
        parentIds: [],
        temporal: { validFrom: '2020-01-01', validTo: null, version: 1, supersedes: null, supersededBy: null },
      }],
    },
  ));
  r.registerPackage(makePackage(
    makeManifest('pkg.a', '2.0.0'),
    {
      rules: [rule2],
      authorities: [{ id: 'auth.test', name: 'Test', jurisdictionId: 'jur.test', kind: 'OTHER' }],
      sources: [{ id: 'src.test', title: 'Test', citation: 'Test', authorityId: 'auth.test' }],
      jurisdictions: [{
        id: 'jur.test',
        code: 'TEST',
        name: 'Test',
        kind: 'COUNTRY',
        parentIds: [],
        temporal: { validFrom: '2020-01-01', validTo: null, version: 1, supersedes: null, supersededBy: null },
      }],
    },
  ));
  const rulesV1 = r.getRulesAtVersion('pkg.a', '1.0.0');
  const rulesV2 = r.getRulesAtVersion('pkg.a', '2.0.0');
  record(
    'getRulesAtVersion — returns the correct rule set per version',
    rulesV1.length === 1 && rulesV1[0]!.id === 'rule.test.1' &&
    rulesV2.length === 1 && rulesV2[0]!.id === 'rule.test.2',
  );
}

function testGetPackageAtVersion(): void {
  const r = createVersionedPackageRegistry();
  r.registerPackage(makePackage(makeManifest('pkg.a', '1.0.0')));
  r.registerPackage(makePackage(makeManifest('pkg.a', '2.0.0')));
  const m1 = r.getPackageAtVersion('pkg.a', '1.0.0');
  const m2 = r.getPackageAtVersion('pkg.a', '2.0.0');
  const missing = r.getPackageAtVersion('pkg.a', '3.0.0');
  record(
    'getPackageAtVersion — returns the correct manifest per version',
    m1?.version === '1.0.0' && m2?.version === '2.0.0' && missing === undefined,
  );
}

function testReRegisterSameVersionIdempotent(): void {
  const r = createVersionedPackageRegistry();
  const pkg = makePackage(makeManifest('pkg.a', '1.0.0'));
  r.registerPackage(pkg);
  let threw = false;
  try {
    r.registerPackage(pkg); // idempotent — same content hash
  } catch (e) {
    threw = true;
    console.log(`      \u2192 unexpected throw: ${(e as Error).message}`);
  }
  record('re-registering same version (same hash) is idempotent', !threw);
}

function testActivateUnknownVersionThrows(): void {
  const r = createVersionedPackageRegistry();
  let threw = false;
  try {
    r.activatePackage('pkg.unknown', '1.0.0');
  } catch {
    threw = true;
  }
  record('activate unknown version throws', threw);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  console.log('Nomos — Dependency Resolution Tests');
  console.log('======================================');
  console.log();
  testRegistryStartsEmpty();
  testRegisterValidPackage();
  testRegisterInvalidPackageThrows();
  testActivateAndDeactivateVersion();
  testMultipleVersionsCoexist();
  testOnlyOneVersionActiveAtATime();
  testResolveDependenciesAllSatisfied();
  testResolveDependenciesMissingFails();
  testResolveDependenciesVersionOutOfRangeFails();
  testDetectNoCyclesInAcyclicGraph();
  testDetectCyclesInCyclicGraph();
  testGetRulesAtVersion();
  testGetPackageAtVersion();
  testReRegisterSameVersionIdempotent();
  testActivateUnknownVersionThrows();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log();
  console.log('--------------------------------------');
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

// Keep unused import warning away.
void (undefined as unknown as VersionedPackageRegistry);

main();
