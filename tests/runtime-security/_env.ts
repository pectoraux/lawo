/**
 * Loads .env values into process.env, OVERRIDING any stale shell values.
 *
 * Why this exists: the sandbox shell sometimes has `DATABASE_URL=file:...`
 * (a SQLite URL) set, which doesn't match the project's Postgres schema.
 * Bun loads .env but does NOT override existing shell env vars. Next.js DOES
 * override shell env with .env values, so the dev server works fine — but a
 * bare `bun run tests/...` script would inherit the SQLite URL and Prisma
 * would reject it ("URL must start with postgresql://").
 *
 * This module is a side-effect import: import it FIRST in any test entry
 * point that needs the DB. ES module imports are evaluated in source order,
 * so `import './_env'; import { db } from '...'` will load .env before
 * PrismaClient is instantiated.
 *
 * The .env parser is intentionally minimal: it handles KEY=VALUE lines,
 * skips comments (#) and blank lines, and strips surrounding quotes. It does
 * NOT handle multi-line values or escape sequences (the Nomos .env doesn't
 * use them). URLs with `&` (like DATABASE_URL) are handled correctly because
 * we split on the FIRST `=` only and take the rest verbatim — no shell
 * parsing involved.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../../.env');

try {
  const text = readFileSync(envPath, 'utf-8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let val = line.slice(eq + 1).trim();
    // Strip a single pair of surrounding quotes if present.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Override the shell env. .env is the source of truth for the project.
    process.env[key] = val;
  }
} catch (err) {
  console.error('[runtime-security/_env] Could not load .env file at', envPath);
  console.error(err);
  process.exit(1);
}
