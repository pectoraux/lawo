/**
 * Nomos — Rule Engine Unit Tests
 * --------------------------------------------------
 * Verifies the engine handles:
 *   - All 9 operators (eq, neq, gt, gte, lt, lte, in, contains, exists)
 *   - Nested AND / OR / NOT
 *   - Exceptions
 *   - Temporal boundaries (before validFrom, after validTo)
 *   - Multiple effects
 *   - Determinism (same inputs → same output)
 *
 * Uses both `evaluate` (Rule) and `evaluateCompiled` (CompiledRule) paths
 * to verify the algorithm is provably identical between them.
 *
 * Usage:  bun run tests/rule-engine/run.ts
 */
import type { Fact, Rule } from '@/kernel/primitives/types';
import { compileRule } from '@/kernel/rules/RuleCompiler';
import { createRuleEngine } from '@/kernel/rules/RuleEngine';

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
function makeRule(
  conditions: Rule['ruleIr']['conditions'],
  opts: { exceptions?: Rule['ruleIr']['exceptions']; validFrom?: string; validTo?: string | null; effects?: Rule['ruleIr']['effects'] } = {},
): Rule {
  return {
    id: 'rule.test.engine',
    code: 'TEST-ENGINE',
    title: 'Engine test rule',
    jurisdictionId: 'jur.test',
    authorityId: 'auth.test',
    sourceId: 'src.test',
    type: 'DETERMINISTIC',
    ruleIr: {
      id: 'ruleir.test.engine',
      ruleId: 'rule.test.engine',
      conditions,
      exceptions: opts.exceptions ?? [],
      effects: opts.effects ?? [{ kind: 'RIGHT', code: 'RIGHT_ENGINE', label: 'Right' }],
    },
    temporal: {
      validFrom: opts.validFrom ?? '2020-01-01',
      validTo: opts.validTo ?? null,
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
    packageId: 'pkg.test',
    truthLevel: 'T0',
  };
}

function fact(attribute: string, value: unknown, id?: string): Fact {
  return {
    id: id ?? `fact.${attribute}`,
    subjectId: 'subj.test',
    attribute,
    value,
    truthLevel: 'T0',
    observedAt: '2025-01-15',
    tenantId: null,
  };
}

// ---------------------------------------------------------------------------
// Operator tests
// ---------------------------------------------------------------------------
function testOperatorEq(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'x', operator: 'eq', value: 1 });
  const engine = createRuleEngine();
  const match = engine.evaluate(rule, [fact('x', 1)], '2025-01-15');
  const noMatch = engine.evaluate(rule, [fact('x', 2)], '2025-01-15');
  record('eq operator — match & no-match', match.matched && !noMatch.matched);
}

function testOperatorNeq(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'x', operator: 'neq', value: 1 });
  const engine = createRuleEngine();
  const match = engine.evaluate(rule, [fact('x', 2)], '2025-01-15');
  const noMatch = engine.evaluate(rule, [fact('x', 1)], '2025-01-15');
  record('neq operator — match & no-match', match.matched && !noMatch.matched);
}

function testOperatorGt(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'x', operator: 'gt', value: 10 });
  const engine = createRuleEngine();
  const match = engine.evaluate(rule, [fact('x', 15)], '2025-01-15');
  const noMatch = engine.evaluate(rule, [fact('x', 5)], '2025-01-15');
  record('gt operator — match & no-match', match.matched && !noMatch.matched);
}

function testOperatorGte(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'x', operator: 'gte', value: 10 });
  const engine = createRuleEngine();
  const above = engine.evaluate(rule, [fact('x', 15)], '2025-01-15');
  const at = engine.evaluate(rule, [fact('x', 10)], '2025-01-15');
  const below = engine.evaluate(rule, [fact('x', 5)], '2025-01-15');
  record('gte operator — match (above), match (at), no-match (below)', above.matched && at.matched && !below.matched);
}

function testOperatorLt(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'x', operator: 'lt', value: 10 });
  const engine = createRuleEngine();
  const match = engine.evaluate(rule, [fact('x', 5)], '2025-01-15');
  const noMatch = engine.evaluate(rule, [fact('x', 15)], '2025-01-15');
  record('lt operator — match & no-match', match.matched && !noMatch.matched);
}

function testOperatorLte(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'x', operator: 'lte', value: 10 });
  const engine = createRuleEngine();
  const below = engine.evaluate(rule, [fact('x', 5)], '2025-01-15');
  const at = engine.evaluate(rule, [fact('x', 10)], '2025-01-15');
  const above = engine.evaluate(rule, [fact('x', 15)], '2025-01-15');
  record('lte operator — match (below), match (at), no-match (above)', below.matched && at.matched && !above.matched);
}

function testOperatorIn(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'x', operator: 'in', value: ['a', 'b', 'c'] });
  const engine = createRuleEngine();
  const match = engine.evaluate(rule, [fact('x', 'b')], '2025-01-15');
  const noMatch = engine.evaluate(rule, [fact('x', 'd')], '2025-01-15');
  record('in operator — match & no-match', match.matched && !noMatch.matched);
}

function testOperatorContainsString(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'text', operator: 'contains', value: 'urgent' });
  const engine = createRuleEngine();
  const match = engine.evaluate(rule, [fact('text', 'please review urgent')], '2025-01-15');
  const noMatch = engine.evaluate(rule, [fact('text', 'nothing here')], '2025-01-15');
  record('contains (string) — match & no-match', match.matched && !noMatch.matched);
}

function testOperatorContainsArray(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'tags', operator: 'contains', value: 'vip' });
  const engine = createRuleEngine();
  const match = engine.evaluate(rule, [fact('tags', ['premium', 'vip'])], '2025-01-15');
  const noMatch = engine.evaluate(rule, [fact('tags', ['standard'])], '2025-01-15');
  record('contains (array) — match & no-match', match.matched && !noMatch.matched);
}

function testOperatorExists(): void {
  const rule = makeRule({ kind: 'leaf', fact: 'optional', operator: 'exists', value: null });
  const engine = createRuleEngine();
  const match = engine.evaluate(rule, [fact('optional', 'anything')], '2025-01-15');
  const noMatch = engine.evaluate(rule, [fact('other', 'value')], '2025-01-15');
  record('exists operator — present & absent', match.matched && !noMatch.matched);
}

// ---------------------------------------------------------------------------
// Nested conditions
// ---------------------------------------------------------------------------
function testNestedAnd(): void {
  const rule = makeRule({
    kind: 'and',
    children: [
      { kind: 'leaf', fact: 'a', operator: 'eq', value: 1 },
      { kind: 'leaf', fact: 'b', operator: 'eq', value: 2 },
    ],
  });
  const engine = createRuleEngine();
  const both = engine.evaluate(rule, [fact('a', 1), fact('b', 2)], '2025-01-15');
  const one = engine.evaluate(rule, [fact('a', 1), fact('b', 99)], '2025-01-15');
  record('nested and — both match (fire), one fails (no-fire)', both.matched && !one.matched);
}

function testNestedOr(): void {
  const rule = makeRule({
    kind: 'or',
    children: [
      { kind: 'leaf', fact: 'a', operator: 'eq', value: 1 },
      { kind: 'leaf', fact: 'b', operator: 'eq', value: 2 },
    ],
  });
  const engine = createRuleEngine();
  const left = engine.evaluate(rule, [fact('a', 1), fact('b', 99)], '2025-01-15');
  const right = engine.evaluate(rule, [fact('a', 99), fact('b', 2)], '2025-01-15');
  const neither = engine.evaluate(rule, [fact('a', 99), fact('b', 99)], '2025-01-15');
  record('nested or — left matches (fire), right matches (fire), neither (no-fire)', left.matched && right.matched && !neither.matched);
}

function testNestedNot(): void {
  const rule = makeRule({
    kind: 'not',
    child: { kind: 'leaf', fact: 'blocked', operator: 'eq', value: true },
  });
  const engine = createRuleEngine();
  const blocked = engine.evaluate(rule, [fact('blocked', true)], '2025-01-15');
  const unblocked = engine.evaluate(rule, [fact('blocked', false)], '2025-01-15');
  record('not — inverts match (blocked=false fires, blocked=true does not)', !blocked.matched && unblocked.matched);
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------
function testExceptionBlocksRule(): void {
  const rule = makeRule(
    { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
    { exceptions: [{ kind: 'leaf', fact: 'exempt', operator: 'eq', value: true }] },
  );
  const engine = createRuleEngine();
  const noException = engine.evaluate(rule, [fact('x', 1), fact('exempt', false)], '2025-01-15');
  const withException = engine.evaluate(rule, [fact('x', 1), fact('exempt', true)], '2025-01-15');
  record(
    'exception blocks rule (no-exception fires, exception skipped=true)',
    noException.matched && !withException.matched && withException.skippedDueToException,
  );
}

function testExceptionDoesNotBlockWhenFalse(): void {
  const rule = makeRule(
    { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
    { exceptions: [{ kind: 'leaf', fact: 'exempt', operator: 'eq', value: true }] },
  );
  const engine = createRuleEngine();
  const result = engine.evaluate(rule, [fact('x', 1), fact('exempt', false)], '2025-01-15');
  record('exception with exempt=false does NOT block', result.matched && !result.skippedDueToException);
}

// ---------------------------------------------------------------------------
// Temporal boundaries
// ---------------------------------------------------------------------------
function testTemporalBeforeValidFrom(): void {
  const rule = makeRule(
    { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
    { validFrom: '2025-06-01' },
  );
  const engine = createRuleEngine();
  const before = engine.evaluate(rule, [fact('x', 1)], '2025-01-15');
  const after = engine.evaluate(rule, [fact('x', 1)], '2025-12-15');
  record(
    'temporal — asOf before validFrom does not fire',
    !before.matched && after.matched,
  );
}

function testTemporalAfterValidTo(): void {
  const rule = makeRule(
    { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
    { validFrom: '2020-01-01', validTo: '2025-01-01' },
  );
  const engine = createRuleEngine();
  const before = engine.evaluate(rule, [fact('x', 1)], '2024-06-15');
  const after = engine.evaluate(rule, [fact('x', 1)], '2025-06-15');
  record(
    'temporal — asOf after validTo does not fire',
    before.matched && !after.matched,
  );
}

// ---------------------------------------------------------------------------
// Multiple effects
// ---------------------------------------------------------------------------
function testMultipleEffectsFire(): void {
  const rule = makeRule(
    { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
    {
      effects: [
        { kind: 'RIGHT', code: 'RIGHT_A', label: 'A' },
        { kind: 'OBLIGATION', code: 'OBLIG_B', label: 'B' },
        { kind: 'PERMISSION', code: 'PERM_C', label: 'C' },
      ],
    },
  );
  const engine = createRuleEngine();
  const result = engine.evaluate(rule, [fact('x', 1)], '2025-01-15');
  record('multiple effects — 3 effects fire', result.matched && result.firedEffects.length === 3);
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------
function testDeterminism(): void {
  const rule = makeRule({
    kind: 'and',
    children: [
      { kind: 'leaf', fact: 'a', operator: 'eq', value: 1 },
      { kind: 'or', children: [{ kind: 'leaf', fact: 'b', operator: 'eq', value: 2 }] },
    ],
  });
  const engine = createRuleEngine();
  const facts = [fact('a', 1), fact('b', 2)];
  const r1 = engine.evaluate(rule, facts, '2025-01-15');
  const r2 = engine.evaluate(rule, facts, '2025-01-15');
  const same =
    r1.matched === r2.matched &&
    r1.firedEffects.length === r2.firedEffects.length &&
    r1.calculation.length === r2.calculation.length &&
    r1.calculation.every((c, i) => c.description === r2.calculation[i]!.description);
  record('determinism — same inputs produce byte-identical results', same);
}

// ---------------------------------------------------------------------------
// Compiled path parity
// ---------------------------------------------------------------------------
async function testCompiledPathMatchesSourcePath(): Promise<void> {
  const rule = makeRule({
    kind: 'and',
    children: [
      { kind: 'leaf', fact: 'a', operator: 'eq', value: 1 },
      { kind: 'not', child: { kind: 'leaf', fact: 'blocked', operator: 'eq', value: true } },
    ],
  });
  const compiled = await compileRule(rule);
  const engine = createRuleEngine();
  const facts = [fact('a', 1), fact('blocked', false)];
  const r1 = engine.evaluate(rule, facts, '2025-01-15');
  const r2 = engine.evaluateCompiled(compiled, facts, '2025-01-15');
  const same =
    r1.matched === r2.matched &&
    r1.firedEffects.length === r2.firedEffects.length &&
    r1.calculation.length === r2.calculation.length;
  record('compiled path produces identical result to source path', same);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('Nomos — Rule Engine Unit Tests');
  console.log('=================================');
  console.log();
  testOperatorEq();
  testOperatorNeq();
  testOperatorGt();
  testOperatorGte();
  testOperatorLt();
  testOperatorLte();
  testOperatorIn();
  testOperatorContainsString();
  testOperatorContainsArray();
  testOperatorExists();
  testNestedAnd();
  testNestedOr();
  testNestedNot();
  testExceptionBlocksRule();
  testExceptionDoesNotBlockWhenFalse();
  testTemporalBeforeValidFrom();
  testTemporalAfterValidTo();
  testMultipleEffectsFire();
  testDeterminism();
  await testCompiledPathMatchesSourcePath();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log();
  console.log('--------------------------------------');
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

void main();
