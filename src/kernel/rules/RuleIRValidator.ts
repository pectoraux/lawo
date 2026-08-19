/**
 * Nomos — RuleIR Validator  (architecture §11, Deliverable B)
 * --------------------------------------------------
 * Deterministic validation for RuleIR. Rejects malformed rules before they
 * can enter the executable registry. A malformed RuleIR package fails loudly.
 *
 * The validator is PURE: no IO, no side effects, no Date.now(). Same input
 * always produces the same ValidationResult. (I5 — deterministic.)
 *
 * Validation checks:
 *   - required identifiers (id, code, title, jurisdictionId, authorityId,
 *     sourceId, packageId)
 *   - valid rule type (one of 4)
 *   - valid truth level (T0–T5)
 *   - valid temporal interval (validFrom is a date, validTo > validFrom if set,
 *     version is a positive integer)
 *   - valid ConditionNode tree (recursive — leaf nodes have fact + operator +
 *     value; and/or have non-empty children; not has a child)
 *   - valid exception trees (each is a valid ConditionNode)
 *   - valid effects (non-empty array, each has kind + code + label)
 *   - no unknown operators (the 9 frozen operators only)
 */

import type {
  ConditionNode,
  Rule,
  RuleEffect,
  RuleIR,
  RuleType,
  TruthLevel,
} from '@/kernel/primitives/types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_RULE_TYPES: RuleType[] = ['DETERMINISTIC', 'CONDITIONAL', 'DISCRETIONARY', 'PREDICTIVE'];
const VALID_TRUTH_LEVELS: TruthLevel[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5'];
const VALID_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists'];
const VALID_EFFECT_KINDS = ['RIGHT', 'OBLIGATION', 'PERMISSION', 'RESTRICTION', 'FEE', 'OPTION', 'CONSEQUENCE'];

/** Validate a full Rule (wrapper that validates the RuleIR too). */
export function validateRule(rule: Rule): ValidationResult {
  const errors: string[] = [];

  // Required identifiers
  if (!rule.id || typeof rule.id !== 'string') errors.push('rule.id is missing or not a string');
  if (!rule.code || typeof rule.code !== 'string') errors.push('rule.code is missing or not a string');
  if (!rule.title || typeof rule.title !== 'string') errors.push('rule.title is missing or not a string');
  if (!rule.jurisdictionId || typeof rule.jurisdictionId !== 'string') errors.push('rule.jurisdictionId is missing or not a string');
  if (!rule.authorityId || typeof rule.authorityId !== 'string') errors.push('rule.authorityId is missing or not a string');
  if (!rule.sourceId || typeof rule.sourceId !== 'string') errors.push('rule.sourceId is missing or not a string');
  if (!rule.packageId || typeof rule.packageId !== 'string') errors.push('rule.packageId is missing or not a string');

  // Rule type
  if (!VALID_RULE_TYPES.includes(rule.type)) {
    errors.push(`rule.type "${rule.type}" is not one of: ${VALID_RULE_TYPES.join(', ')}`);
  }

  // Truth level
  if (!VALID_TRUTH_LEVELS.includes(rule.truthLevel)) {
    errors.push(`rule.truthLevel "${rule.truthLevel}" is not one of: ${VALID_TRUTH_LEVELS.join(', ')}`);
  }

  // Temporal
  const temporalErrors = validateTemporal(rule.temporal, rule.id);
  errors.push(...temporalErrors);

  // RuleIR
  const irResult = validateRuleIR(rule.ruleIr);
  if (!irResult.valid) {
    errors.push(...irResult.errors);
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a RuleIR object (conditions, exceptions, effects). */
export function validateRuleIR(ruleIr: RuleIR): ValidationResult {
  const errors: string[] = [];

  if (!ruleIr.id || typeof ruleIr.id !== 'string') {
    errors.push('ruleIr.id is missing or not a string');
  }
  if (!ruleIr.ruleId || typeof ruleIr.ruleId !== 'string') {
    errors.push('ruleIr.ruleId is missing or not a string');
  }

  // Conditions tree
  const condErrors = validateConditionNode(ruleIr.conditions, 'conditions');
  errors.push(...condErrors);

  // Exceptions
  if (!Array.isArray(ruleIr.exceptions)) {
    errors.push('ruleIr.exceptions is not an array');
  } else {
    for (let i = 0; i < ruleIr.exceptions.length; i++) {
      const exErrors = validateConditionNode(ruleIr.exceptions[i]!, `exception[${i}]`);
      errors.push(...exErrors);
    }
  }

  // Effects
  if (!Array.isArray(ruleIr.effects) || ruleIr.effects.length === 0) {
    errors.push('ruleIr.effects must be a non-empty array');
  } else {
    for (let i = 0; i < ruleIr.effects.length; i++) {
      const effErrors = validateEffect(ruleIr.effects[i]!, `effect[${i}]`);
      errors.push(...effErrors);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a TemporalRange. */
function validateTemporal(temporal: Rule['temporal'], ruleId: string): string[] {
  const errors: string[] = [];

  if (!temporal) {
    errors.push(`rule ${ruleId}: temporal is missing`);
    return errors;
  }

  if (!temporal.validFrom || typeof temporal.validFrom !== 'string') {
    errors.push(`rule ${ruleId}: temporal.validFrom is missing or not a string`);
  } else if (!isValidISODate(temporal.validFrom)) {
    errors.push(`rule ${ruleId}: temporal.validFrom "${temporal.validFrom}" is not a valid ISO date`);
  }

  if (temporal.validTo !== null && temporal.validTo !== undefined) {
    if (typeof temporal.validTo !== 'string') {
      errors.push(`rule ${ruleId}: temporal.validTo is not a string or null`);
    } else if (!isValidISODate(temporal.validTo)) {
      errors.push(`rule ${ruleId}: temporal.validTo "${temporal.validTo}" is not a valid ISO date`);
    } else if (temporal.validTo <= temporal.validFrom) {
      errors.push(`rule ${ruleId}: temporal.validTo (${temporal.validTo}) must be > validFrom (${temporal.validFrom})`);
    }
  }

  if (typeof temporal.version !== 'number' || temporal.version < 1 || !Number.isInteger(temporal.version)) {
    errors.push(`rule ${ruleId}: temporal.version must be a positive integer, got ${temporal.version}`);
  }

  return errors;
}

/** Recursively validate a ConditionNode tree. */
function validateConditionNode(node: ConditionNode, path: string): string[] {
  const errors: string[] = [];

  if (!node || typeof node !== 'object') {
    errors.push(`${path}: node is not an object`);
    return errors;
  }

  switch (node.kind) {
    case 'leaf': {
      if (!node.fact || typeof node.fact !== 'string') {
        errors.push(`${path}: leaf.fact is missing or not a string`);
      }
      if (!VALID_OPERATORS.includes(node.operator)) {
        errors.push(`${path}: leaf.operator "${node.operator}" is not one of: ${VALID_OPERATORS.join(', ')}`);
      }
      // `value` can be any type except undefined — exists operator ignores it
      if (node.operator !== 'exists' && node.value === undefined) {
        errors.push(`${path}: leaf.value is undefined (required for operator "${node.operator}")`);
      }
      break;
    }
    case 'and':
    case 'or': {
      if (!Array.isArray(node.children) || node.children.length === 0) {
        errors.push(`${path}: ${node.kind}.children must be a non-empty array`);
      } else {
        for (let i = 0; i < node.children.length; i++) {
          errors.push(...validateConditionNode(node.children[i]!, `${path}.${node.kind}[${i}]`));
        }
      }
      break;
    }
    case 'not': {
      if (!node.child || typeof node.child !== 'object') {
        errors.push(`${path}: not.child is missing or not an object`);
      } else {
        errors.push(...validateConditionNode(node.child, `${path}.not`));
      }
      break;
    }
    default: {
      errors.push(`${path}: unknown node kind "${(node as { kind: string }).kind}"`);
    }
  }

  return errors;
}

/** Validate a single RuleEffect. */
function validateEffect(effect: RuleEffect, path: string): string[] {
  const errors: string[] = [];

  if (!effect || typeof effect !== 'object') {
    errors.push(`${path}: effect is not an object`);
    return errors;
  }

  if (!VALID_EFFECT_KINDS.includes(effect.kind)) {
    errors.push(`${path}: effect.kind "${effect.kind}" is not one of: ${VALID_EFFECT_KINDS.join(', ')}`);
  }
  if (!effect.code || typeof effect.code !== 'string') {
    errors.push(`${path}: effect.code is missing or not a string`);
  }
  if (!effect.label || typeof effect.label !== 'string') {
    errors.push(`${path}: effect.label is missing or not a string`);
  }

  if (effect.amount !== undefined && effect.amount !== null) {
    if (typeof effect.amount !== 'object') {
      errors.push(`${path}: effect.amount is not an object`);
    } else {
      if (typeof effect.amount.value !== 'number' || !Number.isFinite(effect.amount.value)) {
        errors.push(`${path}: effect.amount.value must be a finite number`);
      }
      if (!effect.amount.currency || typeof effect.amount.currency !== 'string') {
        errors.push(`${path}: effect.amount.currency is missing or not a string`);
      }
    }
  }

  return errors;
}

/** Check if a string is a valid ISO date (YYYY-MM-DD). */
function isValidISODate(s: string): boolean {
  if (typeof s !== 'string') return false;
  // Accept full ISO timestamps or date-only strings
  const datePart = s.length >= 10 ? s.slice(0, 10) : s;
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) && !Number.isNaN(Date.parse(datePart));
}
