/**
 * Nomos — RuleIR Validator Unit Tests
 * --------------------------------------------------
 * Exercises `validateRule` and `validateRuleIR` with a series of valid and
 * invalid rule inputs. Verifies that valid rules pass and that invalid rules
 * fail with specific, identifying error messages.
 *
 * Usage:  bun run tests/ruleir-unit/run.ts
 */
import type {
  ConditionNode,
  Rule,
  RuleIR,
} from '@/kernel/primitives/types';
import { validateRule, validateRuleIR } from '@/kernel/rules/RuleIRValidator';

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
// Valid rule factory
// ---------------------------------------------------------------------------
function makeValidRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule.test.001',
    code: 'TEST-001',
    title: 'Test rule 001',
    jurisdictionId: 'jur.test',
    authorityId: 'auth.test',
    sourceId: 'src.test',
    type: 'DETERMINISTIC',
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: {
        kind: 'leaf',
        fact: 'test.flag',
        operator: 'eq',
        value: true,
      },
      exceptions: [],
      effects: [
        { kind: 'RIGHT', code: 'RIGHT_TEST_001', label: 'Right for test 001' },
      ],
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testValidRulePasses(): void {
  const rule = makeValidRule();
  const result = validateRule(rule);
  record('valid rule passes validation', result.valid, result.errors.join('; '));
}

function testValidRuleIRPasses(): void {
  const ruleIr: RuleIR = {
    id: 'ruleir.test.001',
    ruleId: 'rule.test.001',
    conditions: { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
    exceptions: [],
    effects: [{ kind: 'OBLIGATION', code: 'OBLIG', label: 'lbl' }],
  };
  const result = validateRuleIR(ruleIr);
  record('valid RuleIR passes validation', result.valid, result.errors.join('; '));
}

function testMissingIdFails(): void {
  const rule = makeValidRule({ id: '' });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('rule.id'));
  record('missing rule.id fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testMissingCodeFails(): void {
  const rule = makeValidRule({ code: '' });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('rule.code'));
  record('missing rule.code fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testMissingTitleFails(): void {
  const rule = makeValidRule({ title: '' });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('rule.title'));
  record('missing rule.title fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testMissingJurisdictionIdFails(): void {
  const rule = makeValidRule({ jurisdictionId: '' });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('rule.jurisdictionId'));
  record('missing rule.jurisdictionId fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testMissingPackageIdFails(): void {
  const rule = makeValidRule({ packageId: '' });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('rule.packageId'));
  record('missing rule.packageId fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testInvalidRuleTypeFails(): void {
  const rule = makeValidRule({ type: 'BOGUS' as Rule['type'] });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('rule.type'));
  record('invalid rule.type fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testInvalidTruthLevelFails(): void {
  const rule = makeValidRule({ truthLevel: 'T9' as Rule['truthLevel'] });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('rule.truthLevel'));
  record('invalid rule.truthLevel fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testInvalidVersionFails(): void {
  const rule = makeValidRule({
    temporal: {
      validFrom: '2020-01-01',
      validTo: null,
      version: 0,
      supersedes: null,
      supersededBy: null,
    },
  });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('temporal.version'));
  record('zero temporal.version fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testImpossibleTemporalRangeFails(): void {
  const rule = makeValidRule({
    temporal: {
      validFrom: '2025-01-01',
      validTo: '2020-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
  });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('validTo') && e.includes('validFrom'));
  record('validTo <= validFrom fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testUnknownOperatorFails(): void {
  // Construct an invalid rule by casting via unknown — we deliberately bypass
  // the type system to test that the validator REJECTS an unknown operator.
  const rawRule = {
    id: 'rule.test.bad',
    code: 'TEST-BAD',
    title: 'Bad rule with unknown operator',
    jurisdictionId: 'jur.test',
    authorityId: 'auth.test',
    sourceId: 'src.test',
    type: 'DETERMINISTIC',
    ruleIr: {
      id: 'ruleir.test.bad',
      ruleId: 'rule.test.bad',
      conditions: {
        kind: 'leaf',
        fact: 'test.flag',
        // Deliberately invalid operator — not in the allowed set.
        operator: 'matches',
        value: 'foo',
      },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_TEST_BAD', label: 'Right' }],
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
  };
  const rule = rawRule as unknown as Rule;
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('operator'));
  record('unknown leaf operator fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testEmptyEffectsFails(): void {
  const rule = makeValidRule({
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
      exceptions: [],
      effects: [],
    },
  });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('effects') && e.includes('non-empty'));
  record('empty effects array fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testEffectWithoutCodeFails(): void {
  const rule = makeValidRule({
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: '', label: 'lbl' }],
    },
  });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('effect.code is missing or not a string'));
  record('effect with empty code fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testEffectWithAmountMissingValueFails(): void {
  const rule = makeValidRule({
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
      exceptions: [],
      effects: [
        {
          kind: 'FEE',
          code: 'FEE_TEST',
          label: 'Fee',
          amount: { value: 'not a number' as unknown as number, currency: 'USD' },
        },
      ],
    },
  });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('amount.value'));
  record('effect.amount.value must be a number fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testAndWithoutChildrenFails(): void {
  const rule = makeValidRule({
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: { kind: 'and', children: [] },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_TEST_001', label: 'Right' }],
    },
  });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('children must be a non-empty array'));
  record('and node with empty children fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testNotWithoutChildFails(): void {
  const rule = makeValidRule({
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: { kind: 'not', child: undefined as unknown as ConditionNode },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_TEST_001', label: 'Right' }],
    },
  });
  const result = validateRule(rule);
  const hasError = result.errors.some((e) => e.includes('not.child is missing or not an object'));
  record('not node without child fails validation', !result.valid && hasError, result.errors.join('; '));
}

function testDeterministicValidation(): void {
  const rule = makeValidRule();
  const r1 = validateRule(rule);
  const r2 = validateRule(rule);
  const same =
    r1.valid === r2.valid &&
    r1.errors.length === r2.errors.length &&
    r1.errors.every((e, i) => e === r2.errors[i]);
  record('validator is deterministic (same input → same output)', same);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  console.log('Nomos — RuleIR Validator Unit Tests');
  console.log('======================================');
  console.log();
  testValidRulePasses();
  testValidRuleIRPasses();
  testMissingIdFails();
  testMissingCodeFails();
  testMissingTitleFails();
  testMissingJurisdictionIdFails();
  testMissingPackageIdFails();
  testInvalidRuleTypeFails();
  testInvalidTruthLevelFails();
  testInvalidVersionFails();
  testImpossibleTemporalRangeFails();
  testUnknownOperatorFails();
  testEmptyEffectsFails();
  testEffectWithoutCodeFails();
  testEffectWithAmountMissingValueFails();
  testAndWithoutChildrenFails();
  testNotWithoutChildFails();
  testDeterministicValidation();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log();
  console.log('--------------------------------------');
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main();
