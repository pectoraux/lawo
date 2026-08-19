/**
 * Nomos — Temporal Model  (architecture §15)
 * --------------------------------------------------
 * Every rule, source, fact, document, interpretation, and package must carry
 * temporal metadata so the platform supports `evaluate(as_of = DATE)`.
 *
 * I7:  Every rule has temporal/version metadata.
 * I13: Historical decisions remain reproducible.
 *
 * Never overwrite historical truth.
 */
import type { TemporalRange } from '@/kernel/primitives/types';

/** True if `asOf` (ISO date string) is within the temporal range [validFrom, validTo). */
export function covers(range: TemporalRange, asOf: string): boolean {
  if (!asOf) return false;
  if (asOf < range.validFrom) return false;
  if (range.validTo && asOf >= range.validTo) return false;
  return true;
}

/** Format an ISO date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Format a Date as a full ISO timestamp. */
export function isoTimestamp(d: Date): string {
  return d.toISOString();
}

/** Today's ISO date in Africa/Accra (the configured user timezone). */
export function today(): string {
  // Approximate Accra (UTC+0, no DST) — keep server-side UTC stable.
  return new Date().toISOString().slice(0, 10);
}

/** Build a simple open-ended temporal range starting at validFrom. */
export function openRange(validFrom: string, version: number, supersedes?: string | null): TemporalRange {
  return {
    validFrom,
    validTo: null,
    publishedAt: validFrom,
    ingestedAt: validFrom,
    version,
    supersedes: supersedes ?? null,
    supersededBy: null,
  };
}

/** Pick the most recent version of an artefact that is in effect as of `asOf`. */
export function pickAsOf<T extends { temporal: TemporalRange }>(items: T[], asOf: string): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    if (!covers(item.temporal, asOf)) continue;
    if (!best || item.temporal.version > best.temporal.version) best = item;
  }
  return best;
}

/** Filter a list to only those in effect as of `asOf`. */
export function inEffectAsOf<T extends { temporal: TemporalRange }>(items: T[], asOf: string): T[] {
  return items.filter((item) => covers(item.temporal, asOf));
}
