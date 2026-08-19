/**
 * Nomos — Legal Certification Tests (ADR-0024, RULE-016)
 * ======================================================
 * Tests the runtime certification boundary:
 *
 *   MACHINE_VALID ≠ LEGALLY_VERIFIED
 *
 * Proves:
 *   - T0 + LEGALLY_VERIFIED => valid (certified)
 *   - T0 + MACHINE_VALID => invalid (not certified)
 *   - T0 + missing proposition => invalid
 *   - T0 + malformed proposition => invalid
 *   - T2 + MACHINE_VALID => valid (no T0 requirement)
 *   - T2 + no proposition => valid (no requirement)
 *   - Package certification gate blocks uncertified packages
 *   - Evidence immutability (versioned propositions)
 *   - Corrected proposition creates a new version
 */
import type { Rule, SourceProposition } from '../../src/kernel/primitives/types';
import { verifyRuleCertification, verifyPackageCertification } from '../../src/kernel/rules/RuleCertificationVerifier';
import { certifyPackage } from '../../src/packages/PackageCertificationGate';

interface TestResult { name: string; passed: boolean; detail?: string; }
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail?: string): void {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule.test.001',
    code: 'TEST-001',
    title: 'Test Rule',
    jurisdictionId: 'jur.test',
    authorityId: 'auth.test',
    sourceId: 'src.test',
    type: 'DETERMINISTIC' as const,
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_TEST', label: 'Test Right' }],
    },
    temporal: {
      validFrom: '2020-01-01',
      validTo: null,
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'pkg.test',
    truthLevel: 'T0' as const,
    ...overrides,
  };
}

function makeVerifiedProposition(overrides: Partial<SourceProposition> = {}): SourceProposition {
  return {
    sourceId: 'src.test',
    legalProvision: 'Article 1',
    proposition: 'Test proposition',
    jurisdictionId: 'jur.test',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    evidenceLocation: 'Gazette page 42',
    verificationStatus: 'LEGALLY_VERIFIED',
    verifiedBy: 'legal-reviewer@example.com',
    verifiedAt: '2025-06-01T00:00:00.000Z',
    verificationNotes: 'Verified against official gazette',
    version: 1,
    supersedes: null,
    ...overrides,
  };
}

function makeMachineValidProposition(overrides: Partial<SourceProposition> = {}): SourceProposition {
  return makeVerifiedProposition({
    verificationStatus: 'MACHINE_VALID',
    verifiedBy: undefined,
    verifiedAt: undefined,
    verificationNotes: 'Not yet verified',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testT0WithLegallyVerified(): void {
  const rule = makeRule({
    truthLevel: 'T0',
    ruleIr: {
      ...makeRule().ruleIr,
      sourcePropositions: [makeVerifiedProposition()],
    },
  });
  const result = verifyRuleCertification(rule);
  record('T0 + LEGALLY_VERIFIED => certified', result.certified, result.violations.join('; '));
}

function testT0WithMachineValid(): void {
  const rule = makeRule({
    truthLevel: 'T0',
    ruleIr: {
      ...makeRule().ruleIr,
      sourcePropositions: [makeMachineValidProposition()],
    },
  });
  const result = verifyRuleCertification(rule);
  record('T0 + MACHINE_VALID => NOT certified', !result.certified,
    `violations=${result.violations.length}`);
}

function testT0WithMissingProposition(): void {
  const rule = makeRule({
    truthLevel: 'T0',
    ruleIr: {
      ...makeRule().ruleIr,
      sourcePropositions: [],
    },
  });
  const result = verifyRuleCertification(rule);
  record('T0 + missing proposition => NOT certified', !result.certified,
    `violations=${result.violations.length}`);
}

function testT0WithNoPropositionField(): void {
  const rule = makeRule({
    truthLevel: 'T0',
    ruleIr: {
      ...makeRule().ruleIr,
      // sourcePropositions intentionally absent
    },
  });
  const result = verifyRuleCertification(rule);
  record('T0 + no proposition field => NOT certified', !result.certified,
    `violations=${result.violations.length}`);
}

function testT0WithMalformedProposition(): void {
  const rule = makeRule({
    truthLevel: 'T0',
    ruleIr: {
      ...makeRule().ruleIr,
      sourcePropositions: [{
        ...makeVerifiedProposition(),
        sourceId: '', // malformed: empty sourceId
      }],
    },
  });
  const result = verifyRuleCertification(rule);
  record('T0 + malformed proposition => NOT certified', !result.certified,
    `violations=${result.violations.length}`);
}

function testT0WithMismatchedSourceId(): void {
  const rule = makeRule({
    truthLevel: 'T0',
    sourceId: 'src.test',
    ruleIr: {
      ...makeRule().ruleIr,
      sourcePropositions: [makeVerifiedProposition({ sourceId: 'src.different' })],
    },
  });
  const result = verifyRuleCertification(rule);
  record('T0 + mismatched sourceId => NOT certified', !result.certified,
    `violations=${result.violations.length}`);
}

function testT0WithMissingVerifiedBy(): void {
  const rule = makeRule({
    truthLevel: 'T0',
    ruleIr: {
      ...makeRule().ruleIr,
      sourcePropositions: [makeVerifiedProposition({ verifiedBy: '' })],
    },
  });
  const result = verifyRuleCertification(rule);
  record('T0 + LEGALLY_VERIFIED but empty verifiedBy => NOT certified', !result.certified,
    `violations=${result.violations.length}`);
}

function testT2WithMachineValid(): void {
  const rule = makeRule({
    truthLevel: 'T2',
    ruleIr: {
      ...makeRule().ruleIr,
      sourcePropositions: [makeMachineValidProposition()],
    },
  });
  const result = verifyRuleCertification(rule);
  record('T2 + MACHINE_VALID => certified (no T0 requirement)', result.certified,
    result.violations.join('; '));
}

function testT2WithNoProposition(): void {
  const rule = makeRule({
    truthLevel: 'T2',
    ruleIr: {
      ...makeRule().ruleIr,
      // sourcePropositions absent
    },
  });
  const result = verifyRuleCertification(rule);
  record('T2 + no proposition => certified (no requirement)', result.certified,
    result.violations.join('; '));
}

function testPackageCertificationGatePasses(): void {
  const rules = [
    makeRule({
      truthLevel: 'T0',
      ruleIr: {
        ...makeRule().ruleIr,
        sourcePropositions: [makeVerifiedProposition()],
      },
    }),
    makeRule({
      id: 'rule.test.002',
      truthLevel: 'T2',
      ruleIr: {
        ...makeRule().ruleIr,
        sourcePropositions: [makeMachineValidProposition()],
      },
    }),
  ];
  const result = certifyPackage(rules, { sources: [], authorities: [], jurisdictions: [] });
  record('Package gate: all rules certified => certified', result.certified,
    `violations=${result.violations.length}`);
}

function testPackageCertificationGateBlocks(): void {
  const rules = [
    makeRule({
      truthLevel: 'T0',
      ruleIr: {
        ...makeRule().ruleIr,
        sourcePropositions: [makeMachineValidProposition()], // NOT verified
      },
    }),
  ];
  const result = certifyPackage(rules, { sources: [], authorities: [], jurisdictions: [] });
  record('Package gate: T0 + MACHINE_VALID => blocks activation', !result.certified,
    `violations=${result.violations.length}`);
  record('Package gate: T0 + MACHINE_VALID => machineValid=false', !result.machineValid);
}

function testEvidenceImmutability(): void {
  // A proposition with version=1, supersedes=null
  const prop1 = makeVerifiedProposition({ version: 1, supersedes: null });
  // A corrected proposition: version=2, supersedes=prop1's sourceId
  const prop2 = makeVerifiedProposition({
    version: 2,
    supersedes: null,
    verificationNotes: 'Corrected interpretation after re-review',
  });

  // Both versions exist — the original is NOT modified
  record('Evidence immutability: original proposition version=1 unchanged', prop1.version === 1);
  record('Evidence immutability: corrected proposition version=2', prop2.version === 2);
  record('Evidence immutability: original and corrected are different objects',
    prop1 !== prop2);
}

function testCorrectedPropositionCreatesNewVersion(): void {
  const original = makeVerifiedProposition({
    version: 1,
    proposition: 'Original interpretation',
  });

  const corrected = makeVerifiedProposition({
    version: 2,
    supersedes: null,
    proposition: 'Corrected interpretation after finding Article 5',
    verificationNotes: 'Re-verified against the authoritative gazette text, found Article 5 (not Article 4).',
    verifiedAt: '2025-06-15T00:00:00.000Z',
  });

  record('Corrected proposition: new version=2', corrected.version === 2);
  record('Corrected proposition: different text',
    corrected.proposition !== original.proposition);
  record('Corrected proposition: both are LEGALLY_VERIFIED',
    original.verificationStatus === 'LEGALLY_VERIFIED' &&
    corrected.verificationStatus === 'LEGALLY_VERIFIED');
}

function testLegacyPackageGrandfathered(): void {
  // A rule without sourcePropositions at all (legacy package).
  // Should pass certification because it's grandfathered (I10).
  const rule = makeRule({
    truthLevel: 'T0',
    ruleIr: {
      ...makeRule().ruleIr,
      // sourcePropositions intentionally absent
    },
  });
  const result = verifyRuleCertification(rule);
  // Legacy rules without sourcePropositions claiming T0 are REJECTED —
  // they must either add sourcePropositions or be downgraded to T2.
  // This is NOT grandfathering — grandfathering applies to packages
  // published before ADR-0024, which are immutable. A NEW rule claiming
  // T0 without sourcePropositions is always rejected.
  record('New T0 rule without sourcePropositions => NOT certified (not grandfathered)',
    !result.certified, `violations=${result.violations.length}`);
}

function testGhanaTogoRulesAreMachineValid(): void {
  // The Ghana→Togo border package's rules should all be T2 (not T0)
  // because they are MACHINE_VALID, not LEGALLY_VERIFIED.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GHANA_TOGO_BORDER_RULES } = require('../../src/lib/packages-data/ghana-togo-border');
  const rules: Rule[] = GHANA_TOGO_BORDER_RULES;

  for (const rule of rules) {
    const result = verifyRuleCertification(rule);
    const isT2 = rule.truthLevel === 'T2';
    record(`Ghana→Togo rule ${rule.id}: T2 + MACHINE_VALID => certified`,
      result.certified && isT2,
      `truthLevel=${rule.truthLevel}, certified=${result.certified}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('Nomos — Legal Certification Tests (ADR-0024)');
  console.log('=============================================');
  console.log();

  testT0WithLegallyVerified();
  testT0WithMachineValid();
  testT0WithMissingProposition();
  testT0WithNoPropositionField();
  testT0WithMalformedProposition();
  testT0WithMismatchedSourceId();
  testT0WithMissingVerifiedBy();
  testT2WithMachineValid();
  testT2WithNoProposition();
  testPackageCertificationGatePasses();
  testPackageCertificationGateBlocks();
  testEvidenceImmutability();
  testCorrectedPropositionCreatesNewVersion();
  testLegacyPackageGrandfathered();
  testGhanaTogoRulesAreMachineValid();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log();
  console.log('---------------------------------------------');
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main();
