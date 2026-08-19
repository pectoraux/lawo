/**
 * Nomos — Situation Engine  (architecture §7, contracts/state.md)
 * --------------------------------------------------
 * A Situation is a state machine (border_crossing, traffic_stop,
 * hospital_admission, building_permit, import_shipment, etc.). The
 * SituationEngine navigates that state machine deterministically.
 *
 *   - initial(situation)   — returns the first declared state.
 *   - transition(...)      — finds the transition matching
 *                              (from, event), checks requiredFacts +
 *                              preconditions, returns the new state (or
 *                              the unchanged current state if the guard
 *                              fails or no transition matches).
 *   - isTerminal(...)      — looks up the state and returns
 *                              state.isTerminal === true.
 *
 * Pure: no IO, no LLM, no Date.now(). Same inputs → same result (I5, I13).
 */

import type { Fact, Situation, SituationState } from '@/kernel/primitives/types';
import type { SituationEngine } from '@/kernel/contracts/contracts';
import { evaluateCondition } from '@/kernel/rules/conditionEval';

class DefaultSituationEngine implements SituationEngine {
  initial(situation: Situation): SituationState {
    // Defensive: callers should always declare at least one state. If empty,
    // return a synthesised ad-hoc state so the engine never throws.
    if (situation.states.length === 0) {
      return { id: 'initial', label: 'Initial' };
    }
    return situation.states[0]!;
  }

  transition(
    situation: Situation,
    currentState: string,
    event: string,
    facts: Fact[],
  ): SituationState {
    // Find a transition matching (from === currentState, event === event).
    // First match wins — situation authors should ensure determinism by
    // declaring at most one transition per (from, event) pair.
    const transition = situation.transitions.find(
      (t) => t.from === currentState && t.event === event,
    );
    if (!transition) return this.lookupState(situation, currentState);

    // Guard 1: requiredFacts — each named attribute must have at least one
    // fact present (regardless of value).
    if (transition.requiredFacts && transition.requiredFacts.length > 0) {
      const presentAttributes = new Set(facts.map((f) => f.attribute));
      const allPresent = transition.requiredFacts.every((attr) =>
        presentAttributes.has(attr),
      );
      if (!allPresent) {
        return this.lookupState(situation, currentState);
      }
    }

    // Guard 2: preconditions — evaluate via the deterministic evaluator.
    if (transition.preconditions) {
      if (!evaluateCondition(transition.preconditions, facts)) {
        return this.lookupState(situation, currentState);
      }
    }

    return this.lookupState(situation, transition.to);
  }

  isTerminal(situation: Situation, stateId: string): boolean {
    const state = situation.states.find((s) => s.id === stateId);
    if (!state) return false;
    return state.isTerminal === true;
  }

  /**
   * Look up a state by id. Falls back to a synthesised state with the
   * given id so a malformed situation definition never throws — the
   * engine returns a deterministic placeholder instead.
   */
  private lookupState(situation: Situation, stateId: string): SituationState {
    const found = situation.states.find((s) => s.id === stateId);
    if (found) return found;
    return { id: stateId, label: stateId };
  }
}

/**
 * Factory — produces a fresh SituationEngine.
 */
export function createSituationEngine(): SituationEngine {
  return new DefaultSituationEngine();
}
