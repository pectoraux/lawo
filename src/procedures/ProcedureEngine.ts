/**
 * Nomos — Procedure Engine  (architecture §8, contracts/procedure.md)
 * --------------------------------------------------
 * A Procedure is a linear sequence of ProcedureSteps linked by
 * `nextStep`. The ProcedureEngine navigates that sequence deterministically.
 *
 * v1 semantics (intentionally linear):
 *   - currentStep(procedure, currentState) — lookup by code === currentState.
 *     If not found, return the first step (defensive default).
 *   - nextStep(procedure, currentState, event) — if the current step has a
 *     `nextStep` field, return that step; otherwise return the current step.
 *
 * Events are accepted by the signature but IGNORED in v1. Procedures are
 * linear with explicit nextStep chains. Branching can be added later by
 * extensions (e.g. condition-based branching, event-triggered deviation)
 * without changing the frozen ProcedureEngine contract.
 *
 * Pure: no IO, no LLM, no Date.now(). Same inputs → same result (I5, I13).
 */

import type { Procedure, ProcedureStep } from '@/kernel/primitives/types';
import type { ProcedureEngine } from '@/kernel/contracts/contracts';

class DefaultProcedureEngine implements ProcedureEngine {
  currentStep(procedure: Procedure, currentState: string): ProcedureStep | undefined {
    const found = procedure.steps.find((s) => s.code === currentState);
    if (found) return found;
    // Defensive: if no step matches, return the first step (if any).
    return procedure.steps[0];
  }

  nextStep(
    procedure: Procedure,
    currentState: string,
    _event: string,
  ): ProcedureStep | undefined {
    const current = this.currentStep(procedure, currentState);
    if (!current) return undefined;
    if (!current.nextStep) return current;

    const next = procedure.steps.find((s) => s.code === current.nextStep);
    if (next) return next;
    // If nextStep references a non-existent code, stay on the current step.
    return current;
  }
}

/**
 * Factory — produces a fresh ProcedureEngine.
 */
export function createProcedureEngine(): ProcedureEngine {
  return new DefaultProcedureEngine();
}
