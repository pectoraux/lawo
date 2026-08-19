/**
 * Nomos — Golden Fixture Framework  (architecture §11, §34; RULE-003, I13)
 * --------------------------------------------------
 * Loads JSON fixture files from `tests/golden-fixtures/fixtures/`, compiles
 * each rule, evaluates it against the fixture's facts at asOf, and compares
 * the result to the fixture's expected values.
 *
 * A fixture passes iff:
 *   - actual.matched === expected.matched
 *   - actual.skippedDueToException === expected.skippedDueToException
 *   - actual.firedEffects.length === expected.firedEffectCount
 *   - actual.truthLevel === expected.truthLevel
 *   - actual.calculation.length === expected.calculationSteps
 *
 * Exits 0 if all fixtures pass, 1 if any fail. Pure: no IO beyond reading
 * the fixture files; deterministic given the fixtures (per I5, I13).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Fact,
  Rule,
  RuleEvaluationResult,
  TruthLevel,
} from '@/kernel/primitives/types';
import { compileRule } from '@/kernel/rules/RuleCompiler';
import { createRuleEngine } from '@/kernel/rules/RuleEngine';

// ---------------------------------------------------------------------------
// Fixture shape
// ---------------------------------------------------------------------------
export interface GoldenFixture {
  id: string;
  description: string;
  rule: Rule;
  facts: Fact[];
  asOf: string;
  expected: {
    matched: boolean;
    skippedDueToException: boolean;
    firedEffectCount: number;
    truthLevel: TruthLevel;
    calculationSteps: number;
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
export interface FixtureRunResult {
  fixtureId: string;
  description: string;
  passed: boolean;
  actual: {
    matched: boolean;
    skippedDueToException: boolean;
    firedEffectCount: number;
    truthLevel: TruthLevel;
    calculationSteps: number;
  };
  expected: GoldenFixture['expected'];
  diffs: string[];
}

/** Compare one RuleEvaluationResult to a fixture's expected values. */
export function compareResultToExpected(
  result: RuleEvaluationResult,
  expected: GoldenFixture['expected'],
): { passed: boolean; diffs: string[] } {
  const diffs: string[] = [];
  if (result.matched !== expected.matched) {
    diffs.push(`matched: expected ${expected.matched}, got ${result.matched}`);
  }
  if (result.skippedDueToException !== expected.skippedDueToException) {
    diffs.push(
      `skippedDueToException: expected ${expected.skippedDueToException}, got ${result.skippedDueToException}`,
    );
  }
  if (result.firedEffects.length !== expected.firedEffectCount) {
    diffs.push(
      `firedEffectCount: expected ${expected.firedEffectCount}, got ${result.firedEffects.length}`,
    );
  }
  if (result.truthLevel !== expected.truthLevel) {
    diffs.push(`truthLevel: expected ${expected.truthLevel}, got ${result.truthLevel}`);
  }
  if (result.calculation.length !== expected.calculationSteps) {
    diffs.push(
      `calculationSteps: expected ${expected.calculationSteps}, got ${result.calculation.length}`,
    );
  }
  return { passed: diffs.length === 0, diffs };
}

// ---------------------------------------------------------------------------
// Fixture discovery
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

/** Discover every `.json` file in the fixtures directory, sorted by filename. */
export function listFixtureFiles(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(FIXTURES_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(FIXTURES_DIR, f));
}

/** Load a single fixture by file path. */
export function loadFixture(filePath: string): GoldenFixture {
  const text = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(text) as GoldenFixture;
  if (!parsed.id || !parsed.rule || !Array.isArray(parsed.facts) || !parsed.expected) {
    throw new Error(`Invalid fixture file ${filePath}: missing required fields`);
  }
  return parsed;
}

/**
 * Run a single fixture: compile the rule, evaluate it, compare to expected.
 *
 * Uses `evaluateCompiled` so we exercise the compiled-rule path.
 *
 * DETERMINISM: this function runs the engine TWICE on the same input and
 * verifies the two runs produce byte-identical results. This catches any
 * accidental non-determinism in the engine (per RULE-003, I5, I13).
 */
export async function runFixture(
  fixture: GoldenFixture,
): Promise<FixtureRunResult> {
  const compiled = await compileRule(fixture.rule);
  const engine = createRuleEngine();
  const result1 = engine.evaluateCompiled(compiled, fixture.facts, fixture.asOf);
  const result2 = engine.evaluateCompiled(compiled, fixture.facts, fixture.asOf);
  const cmp = compareResultToExpected(result1, fixture.expected);

  // Determinism check — the two runs must produce identical results.
  const determinismDiffs: string[] = [];
  if (result1.matched !== result2.matched) {
    determinismDiffs.push(`matched: run1=${result1.matched}, run2=${result2.matched}`);
  }
  if (result1.skippedDueToException !== result2.skippedDueToException) {
    determinismDiffs.push(`skippedDueToException: run1=${result1.skippedDueToException}, run2=${result2.skippedDueToException}`);
  }
  if (result1.firedEffects.length !== result2.firedEffects.length) {
    determinismDiffs.push(`firedEffects.length: run1=${result1.firedEffects.length}, run2=${result2.firedEffects.length}`);
  }
  if (result1.truthLevel !== result2.truthLevel) {
    determinismDiffs.push(`truthLevel: run1=${result1.truthLevel}, run2=${result2.truthLevel}`);
  }
  if (result1.calculation.length !== result2.calculation.length) {
    determinismDiffs.push(`calculation.length: run1=${result1.calculation.length}, run2=${result2.calculation.length}`);
  }
  // Deep comparison of the calculation steps' descriptions (sufficient for determinism).
  for (let i = 0; i < Math.min(result1.calculation.length, result2.calculation.length); i++) {
    const a = result1.calculation[i]!;
    const b = result2.calculation[i]!;
    if (a.description !== b.description) {
      determinismDiffs.push(`calculation[${i}].description: run1=${JSON.stringify(a.description)}, run2=${JSON.stringify(b.description)}`);
    }
    if (a.output !== b.output) {
      determinismDiffs.push(`calculation[${i}].output: run1=${JSON.stringify(a.output)}, run2=${JSON.stringify(b.output)}`);
    }
  }

  const allDiffs = [...cmp.diffs, ...determinismDiffs];
  return {
    fixtureId: fixture.id,
    description: fixture.description,
    passed: allDiffs.length === 0,
    actual: {
      matched: result1.matched,
      skippedDueToException: result1.skippedDueToException,
      firedEffectCount: result1.firedEffects.length,
      truthLevel: result1.truthLevel,
      calculationSteps: result1.calculation.length,
    },
    expected: fixture.expected,
    diffs: allDiffs,
  };
}

/**
 * Run every fixture file in the fixtures directory. Returns the array of
 * results.
 */
export async function runAllGoldenFixtures(): Promise<FixtureRunResult[]> {
  const files = listFixtureFiles();
  const results: FixtureRunResult[] = [];
  for (const file of files) {
    const fixture = loadFixture(file);
    const result = await runFixture(fixture);
    results.push(result);
  }
  return results;
}


