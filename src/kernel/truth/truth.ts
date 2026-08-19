/**
 * Nomos — Truth / Confidence Model  (architecture §13)
 * --------------------------------------------------
 * T0  authoritative              — enacted text, official source
 * T1  deterministically derived  — produced by rule engine from T0 facts
 * T2  established interpretation  — settled case law / long-standing guidance
 * T3  expert interpretation       — non-binding expert opinion
 * T4  community observation       — observational / community-reported
 * T5  prediction                  — forecasted / modelled
 *
 * I8: Community observations (T4) can never masquerade as authority (T0/T1).
 * I6: Every material decision carries provenance including its truthLevel.
 */
import type { TruthLevel } from '@/kernel/primitives/types';

export const TRUTH_LEVELS: TruthLevel[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5'];

export const TRUTH_RANK: Record<TruthLevel, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4,
  T5: 5,
};

export const TRUTH_LABEL: Record<TruthLevel, string> = {
  T0: 'Authoritative',
  T1: 'Deterministically Derived',
  T2: 'Established Interpretation',
  T3: 'Expert Interpretation',
  T4: 'Community Observation',
  T5: 'Prediction',
};

export const TRUTH_DESCRIPTION: Record<TruthLevel, string> = {
  T0: 'Enacted text, official source — the highest epistemic authority.',
  T1: 'Produced by the deterministic rule engine from T0 facts.',
  T2: 'Settled case law or long-standing official guidance.',
  T3: 'Non-binding expert opinion; persuasive only.',
  T4: 'Community / observational report — never authoritative (I8).',
  T5: 'Forecasted or modelled prediction — not a fact.',
};

/**
 * UI color tokens (Tailwind class fragments) — chosen to avoid indigo/blue.
 * Greens for authoritative (T0/T1), ambers for interpretive (T2/T3),
 * neutrals for observation/prediction (T4/T5).
 */
export const TRUTH_BADGE: Record<TruthLevel, { bg: string; text: string; border: string; dot: string }> = {
  T0: { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  T1: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/25', dot: 'bg-emerald-500' },
  T2: { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  T3: { bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-500/25', dot: 'bg-amber-500' },
  T4: { bg: 'bg-zinc-500/15', text: 'text-zinc-700 dark:text-zinc-300', border: 'border-zinc-500/30', dot: 'bg-zinc-500' },
  T5: { bg: 'bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-500/30', dot: 'bg-rose-500' },
};

/**
 * Combine truth levels: the WEAKER (higher number) wins, per I8.
 * A decision grounded partly in T4 cannot claim T0 overall.
 */
export function combineTruthLevels(levels: TruthLevel[]): TruthLevel {
  if (levels.length === 0) return 'T5';
  let weakest: TruthLevel = 'T0';
  for (const l of levels) {
    if (TRUTH_RANK[l] > TRUTH_RANK[weakest]) weakest = l;
  }
  return weakest;
}

export function isAuthoritative(level: TruthLevel): boolean {
  return level === 'T0' || level === 'T1';
}

export function isObservational(level: TruthLevel): boolean {
  return level === 'T4' || level === 'T5';
}
