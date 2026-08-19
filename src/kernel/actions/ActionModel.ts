/**
 * Nomos — Action Model  (architecture §28, contracts/action.md)
 * --------------------------------------------------
 * Pure helpers over the Action primitive. The ActionModel is the entry
 * point of the EXECUTION plane (Plane D): Decision → Action → Preconditions
 * → Execution → Result → Evidence → Updated State.
 *
 * `canExecute` and `applicableActions` are PURE — they consult the supplied
 * facts only and never perform IO. They are deterministic: same action set
 * + same facts → same result, byte-for-byte (I5, I13).
 */

import type { Action, ConditionNode, Fact } from '@/kernel/primitives/types';
import { evaluateCondition } from '@/kernel/rules/conditionEval';

/**
 * Returns true iff the action is executable given the supplied facts:
 *   - true if `action.preconditions` is undefined or null
 *   - otherwise: evaluateCondition(action.preconditions, facts)
 */
export function canExecute(action: Action, facts: Fact[]): boolean {
  if (!action.preconditions) return true;
  return evaluateCondition(action.preconditions as ConditionNode, facts);
}

/**
 * Returns every action whose preconditions are satisfied by the supplied
 * facts. Stable: preserves the input ordering.
 */
export function applicableActions(actions: Action[], facts: Fact[]): Action[] {
  return actions.filter((a) => canExecute(a, facts));
}
