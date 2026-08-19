/**
 * Nomos — Golden Fixture Runner  (architecture §11, §34)
 * --------------------------------------------------
 * CLI entry point for the golden fixture suite. Discovers every JSON fixture
 * in `tests/golden-fixtures/fixtures/`, compiles each rule, evaluates it
 * twice (determinism check), and compares the result to the fixture's
 * expected values.
 *
 * Exits 0 if all fixtures pass, 1 if any fail.
 *
 * Usage:  bun run tests/golden-fixtures/run.ts
 */
import { runAllGoldenFixtures } from './framework';

async function main(): Promise<void> {
  const results = await runAllGoldenFixtures();
  if (results.length === 0) {
    console.log('Nomos — Golden Fixture Suite');
    console.log('============================');
    console.log();
    console.log('No fixtures found — EXIT 1');
    process.exit(1);
  }
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log('Nomos — Golden Fixture Suite');
  console.log('============================');
  console.log();
  for (const r of results) {
    const mark = r.passed ? '\u2713' : '\u2717';
    console.log(`  ${mark} ${r.fixtureId.padEnd(28)} ${r.description}`);
    if (!r.passed) {
      for (const d of r.diffs) console.log(`      \u2192 ${d}`);
    }
  }
  console.log();
  console.log(`--------------------------------`);
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

void main();
