/**
 * Nomos — Rule Compiler Unit Tests
 * --------------------------------------------------
 * Verifies that:
 *   - A valid rule compiles successfully.
 *   - An invalid rule throws `CompilationError`.
 *   - The compiled rule's hash is deterministic (same input → same hash).
 *   - The hash changes if the rule content changes.
 *   - The hash is a SHA-256 hex string.
 *   - The compiled rule preserves identity fields and the source RuleIR id.
 *   - Normalisation flattens nested and/or trees without changing semantics.
 *
 * Usage:  bun run tests/rule-compiler/run.ts
 */
import type {
  ConditionNode,
  Rule,
} from '@/kernel/primitives/types';
import type { CompiledRule } from '@/kernel/rules/CompiledRule';
import { compileRule, compileRules } from '@/kernel/rules/RuleCompiler';
import { CompilationError } from '@/kernel/errors';
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
        kind: 'and',
        children: [
          { kind: 'leaf', fact: 'test.flag', operator: 'eq', value: true },
          {
            kind: 'or',
            children: [
              { kind: 'leaf', fact: 'test.color', operator: 'eq', value: 'red' },
              { kind: 'leaf', fact: 'test.color', operator: 'eq', value: 'red' }, // duplicate
            ],
          },
        ],
      },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_TEST_001', label: 'Right for test 001' }],
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

async function testValidRuleCompiles(): Promise<void> {
  const rule = makeValidRule();
  const compiled = await compileRule(rule);
  const ok =
    compiled.id === rule.id &&
    compiled.code === rule.code &&
    compiled.title === rule.title &&
    compiled.packageId === rule.packageId &&
    compiled.ruleVersion === 1 &&
    compiled.sourceRuleIrId === rule.ruleIr.id &&
    compiled.hash.length === 64 && /^[a-f0-9]+$/.test(compiled.hash) &&
    compiled.compiledAt.length > 0;
  record('valid rule compiles to CompiledRule', ok);
}

async function testInvalidRuleThrows(): Promise<void> {
  const rule = makeValidRule({ id: '' });
  try {
    await compileRule(rule);
    record('invalid rule throws CompilationError', false, 'did not throw');
  } catch (e) {
    const ok = e instanceof CompilationError;
    record('invalid rule throws CompilationError', ok, ok ? undefined : `wrong error type: ${(e as Error).name}`);
  }
}

async function testHashIsDeterministic(): Promise<void> {
  const rule = makeValidRule();
  const c1 = await compileRule(rule);
  const c2 = await compileRule(rule);
  record('hash is deterministic (same input → same hash)', c1.hash === c2.hash, `hash1=${c1.hash.slice(0, 24)}... hash2=${c2.hash.slice(0, 24)}...`);
}

async function testHashChangesWhenContentChanges(): Promise<void> {
  const rule1 = makeValidRule();
  const rule2 = makeValidRule({
    ruleIr: {
      ...rule1.ruleIr,
      effects: [{ kind: 'OBLIGATION', code: 'OBLIG_DIFFERENT', label: 'Different effect' }],
    },
  });
  const c1 = await compileRule(rule1);
  const c2 = await compileRule(rule2);
  record('hash changes when effect content changes', c1.hash !== c2.hash, `hash1=${c1.hash.slice(0, 24)}... hash2=${c2.hash.slice(0, 24)}...`);
}

async function testHashIsSha256Hex(): Promise<void> {
  const rule = makeValidRule();
  const c = await compileRule(rule);
  // Strip the `sha256:` prefix and verify 64 hex chars.
  const hex = c.hash.replace(/^sha256:/, '');
  const ok = /^[0-9a-f]{64}$/.test(hex);
  record('hash is a SHA-256 hex string (64 chars)', ok, `hash=${c.hash}`);
}

async function testCompiledAtVariesButHashStable(): Promise<void> {
  const rule = makeValidRule();
  const c1 = await compileRule(rule);
  // Tiny delay so the timestamp differs (sub-ms may collide).
  await new Promise((resolve) => setTimeout(resolve, 5));
  const c2 = await compileRule(rule);
  const ok = c1.compiledAt !== c2.compiledAt && c1.hash === c2.hash;
  record('compiledAt varies but hash stable (compiledAt NOT in hash)', ok);
}

async function testNormalizeFlattensNestedAndOr(): Promise<void> {
  // rule with: and(leaf1, and(leaf2, leaf3)) → should flatten to and(leaf1, leaf2, leaf3)
  const rule = makeValidRule({
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: {
        kind: 'and',
        children: [
          { kind: 'leaf', fact: 'test.a', operator: 'eq', value: 1 },
          {
            kind: 'and',
            children: [
              { kind: 'leaf', fact: 'test.b', operator: 'eq', value: 2 },
              { kind: 'leaf', fact: 'test.c', operator: 'eq', value: 3 },
            ],
          },
        ],
      },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_TEST_001', label: 'Right' }],
    },
  });
  const compiled = await compileRule(rule);
  const cond = compiled.compiledConditions;
  const ok =
    cond.kind === 'and' &&
    'children' in cond &&
    cond.children.length === 3;
  record('compiler flattens nested and()', ok, `children=${'children' in cond ? cond.children.length : 0}`);
}

async function testNormalizeDedupesDuplicateChildren(): Promise<void> {
  // rule with: or(leaf1, leaf1, leaf2) → should dedupe to or(leaf1, leaf2)
  const rule = makeValidRule({
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: {
        kind: 'or',
        children: [
          { kind: 'leaf', fact: 'test.x', operator: 'eq', value: 'a' },
          { kind: 'leaf', fact: 'test.x', operator: 'eq', value: 'a' }, // duplicate
          { kind: 'leaf', fact: 'test.x', operator: 'eq', value: 'b' },
        ],
      },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_TEST_001', label: 'Right' }],
    },
  });
  const compiled = await compileRule(rule);
  const cond = compiled.compiledConditions;
  const ok =
    cond.kind === 'or' &&
    'children' in cond &&
    cond.children.length === 2;
  record('compiler dedupes duplicate or() children', ok, `children=${'children' in cond ? cond.children.length : 0}`);
}

async function testNormalizationPreservesSemantics(): Promise<void> {
  // The compiled rule's evaluation must match the source rule's evaluation.
  const rule = makeValidRule({
    ruleIr: {
      id: 'ruleir.test.001',
      ruleId: 'rule.test.001',
      conditions: {
        kind: 'and',
        children: [
          { kind: 'leaf', fact: 'test.a', operator: 'eq', value: 1 },
          {
            kind: 'and',
            children: [
              { kind: 'leaf', fact: 'test.b', operator: 'eq', value: 2 },
              {
                kind: 'or',
                children: [
                  { kind: 'leaf', fact: 'test.c', operator: 'eq', value: 3 },
                  { kind: 'leaf', fact: 'test.c', operator: 'eq', value: 3 }, // duplicate
                ],
              },
            ],
          },
        ],
      },
      exceptions: [],
      effects: [{ kind: 'RIGHT', code: 'RIGHT_TEST_001', label: 'Right' }],
    },
  });
  const compiled = await compileRule(rule);
  const engine = createRuleEngine();
  const facts = [
    {
      id: 'fact.test.a',
      subjectId: 'subj.test',
      attribute: 'test.a',
      value: 1,
      truthLevel: 'T0' as const,
      observedAt: '2025-01-15',
      tenantId: null,
    },
    {
      id: 'fact.test.b',
      subjectId: 'subj.test',
      attribute: 'test.b',
      value: 2,
      truthLevel: 'T0' as const,
      observedAt: '2025-01-15',
      tenantId: null,
    },
    {
      id: 'fact.test.c',
      subjectId: 'subj.test',
      attribute: 'test.c',
      value: 3,
      truthLevel: 'T0' as const,
      observedAt: '2025-01-15',
      tenantId: null,
    },
  ];
  const resultSrc = engine.evaluate(rule, facts, '2025-01-15');
  const resultCompiled = engine.evaluateCompiled(compiled, facts, '2025-01-15');
  const ok =
    resultSrc.matched === resultCompiled.matched &&
    resultSrc.firedEffects.length === resultCompiled.firedEffects.length;
  record('normalization preserves evaluation semantics', ok, `src=${resultSrc.matched} compiled=${resultCompiled.matched}`);
}

async function testCompileRulesBatch(): Promise<void> {
  const rules: Rule[] = [
    makeValidRule({ id: 'rule.test.001' }),
    makeValidRule({
      id: 'rule.test.002',
      ruleIr: {
        id: 'ruleir.test.002',
        ruleId: 'rule.test.002',
        conditions: { kind: 'leaf', fact: 'test.b', operator: 'eq', value: 2 },
        exceptions: [],
        effects: [{ kind: 'OBLIGATION', code: 'OBLIG', label: 'Oblig' }],
      },
    }),
  ];
  const compiled = await compileRules(rules);
  record('compileRules compiles a batch', compiled.length === 2 && compiled[0]!.id === 'rule.test.001' && compiled[1]!.id === 'rule.test.002');
}

async function testCompileRulesBatchFailsAtomically(): Promise<void> {
  const rules: Rule[] = [
    makeValidRule({ id: 'rule.test.001' }),
    makeValidRule({ id: '' }), // invalid
  ];
  let threw = false;
  try {
    await compileRules(rules);
  } catch (e) {
    threw = e instanceof CompilationError;
  }
  record('compileRules rejects batch atomically on first invalid rule', threw);
}

// ---------------------------------------------------------------------------
// Hash distinctness regression tests (RULE-011)
// These prove that materially different RuleIR produces different hashes.
// The old JSON.stringify array-replacer bug would have caused some of these
// to produce the SAME hash (nested properties were stripped).
// ---------------------------------------------------------------------------

async function testHashDistinctDifferentLeafValue(): Promise<void> {
  // rule A: nationality == "GH" vs rule B: nationality == "TG"
  // These MUST produce different hashes.
  const ruleA = makeValidRule({ id: 'rule.a' });
  ruleA.ruleIr.conditions = { kind: 'leaf', fact: 'nationality', operator: 'eq', value: 'GH' };
  const ruleB = makeValidRule({ id: 'rule.b' });
  ruleB.ruleIr.conditions = { kind: 'leaf', fact: 'nationality', operator: 'eq', value: 'TG' };
  const cA = await compileRule(ruleA);
  const cB = await compileRule(ruleB);
  record('hash distinct — different leaf value (GH vs TG)', cA.hash !== cB.hash, `hashA=${cA.hash.slice(0, 12)}, hashB=${cB.hash.slice(0, 12)}`);
}

async function testHashDistinctDifferentNestedAnd(): Promise<void> {
  // AND tree with different children must produce different hashes.
  const ruleA = makeValidRule({ id: 'rule.a' });
  ruleA.ruleIr.conditions = {
    kind: 'and',
    children: [
      { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
      { kind: 'leaf', fact: 'y', operator: 'eq', value: 2 },
    ],
  };
  const ruleB = makeValidRule({ id: 'rule.b' });
  ruleB.ruleIr.conditions = {
    kind: 'and',
    children: [
      { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
      { kind: 'leaf', fact: 'y', operator: 'eq', value: 3 },
    ],
  };
  const cA = await compileRule(ruleA);
  const cB = await compileRule(ruleB);
  record('hash distinct — different nested AND children', cA.hash !== cB.hash);
}

async function testHashDistinctDifferentExceptions(): Promise<void> {
  // Different exception trees must produce different hashes.
  const ruleA = makeValidRule({ id: 'rule.a' });
  ruleA.ruleIr.exceptions = [{ kind: 'leaf', fact: 'flag', operator: 'eq', value: true }];
  const ruleB = makeValidRule({ id: 'rule.b' });
  ruleB.ruleIr.exceptions = [{ kind: 'leaf', fact: 'flag', operator: 'eq', value: false }];
  const cA = await compileRule(ruleA);
  const cB = await compileRule(ruleB);
  record('hash distinct — different exceptions', cA.hash !== cB.hash);
}

async function testHashDistinctDifferentEffectAmount(): Promise<void> {
  // Different effect amounts must produce different hashes.
  const ruleA = makeValidRule({ id: 'rule.a' });
  ruleA.ruleIr.effects = [{ kind: 'FEE', code: 'FEE_001', label: 'Fee', amount: { value: 100, currency: 'USD' } }];
  const ruleB = makeValidRule({ id: 'rule.b' });
  ruleB.ruleIr.effects = [{ kind: 'FEE', code: 'FEE_001', label: 'Fee', amount: { value: 200, currency: 'USD' } }];
  const cA = await compileRule(ruleA);
  const cB = await compileRule(ruleB);
  record('hash distinct — different effect amounts', cA.hash !== cB.hash);
}

async function testHashDistinctDifferentSource(): Promise<void> {
  // Different sourceId must produce different hashes.
  const ruleA = makeValidRule({ id: 'rule.a', sourceId: 'src.a' });
  const ruleB = makeValidRule({ id: 'rule.b', sourceId: 'src.b' });
  const cA = await compileRule(ruleA);
  const cB = await compileRule(ruleB);
  record('hash distinct — different sourceId', cA.hash !== cB.hash);
}

async function testHashSameForEquivalentNormalizedRules(): Promise<void> {
  // Two rules with the SAME identity but different un-normalized structure
  // should produce the same hash after normalization (since the hash excludes
  // compiledAt but includes everything else).
  // and(and(a, b), c) → and(a, b, c) → same hash as and(a, b, c)
  const baseRule = makeValidRule({ id: 'rule.same' });
  const ruleA: typeof baseRule = JSON.parse(JSON.stringify(baseRule));
  const ruleB: typeof baseRule = JSON.parse(JSON.stringify(baseRule));
  ruleA.ruleIr.conditions = {
    kind: 'and',
    children: [
      { kind: 'and', children: [
        { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
        { kind: 'leaf', fact: 'y', operator: 'eq', value: 2 },
      ]},
      { kind: 'leaf', fact: 'z', operator: 'eq', value: 3 },
    ],
  };
  ruleB.ruleIr.conditions = {
    kind: 'and',
    children: [
      { kind: 'leaf', fact: 'x', operator: 'eq', value: 1 },
      { kind: 'leaf', fact: 'y', operator: 'eq', value: 2 },
      { kind: 'leaf', fact: 'z', operator: 'eq', value: 3 },
    ],
  };
  const cA = await compileRule(ruleA);
  const cB = await compileRule(ruleB);
  record('hash same — equivalent normalized AND trees', cA.hash === cB.hash, `hashA=${cA.hash.slice(0, 12)}, hashB=${cB.hash.slice(0, 12)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('Nomos — Rule Compiler Unit Tests');
  console.log('==================================');
  console.log();
  await testValidRuleCompiles();
  await testInvalidRuleThrows();
  await testHashIsDeterministic();
  await testHashChangesWhenContentChanges();
  await testHashIsSha256Hex();
  await testCompiledAtVariesButHashStable();
  await testNormalizeFlattensNestedAndOr();
  await testNormalizeDedupesDuplicateChildren();
  await testNormalizationPreservesSemantics();
  await testCompileRulesBatch();
  await testCompileRulesBatchFailsAtomically();

  // Hash distinctness regression tests (RULE-011)
  await testHashDistinctDifferentLeafValue();
  await testHashDistinctDifferentNestedAnd();
  await testHashDistinctDifferentExceptions();
  await testHashDistinctDifferentEffectAmount();
  await testHashDistinctDifferentSource();
  await testHashSameForEquivalentNormalizedRules();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log();
  console.log('--------------------------------------');
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

void main();
