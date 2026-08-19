/**
 * Nomos — Rule Certification Verifier  (ADR-0024, RULE-016)
 * ========================================================
 * Runtime inspection of actual Rule objects to determine whether they
 * meet the legal certification boundary:
 *
 *   MACHINE_VALID: RuleIR passes structural validation. The rule is
 *     syntactically well-formed and deterministic. Minimum for execution.
 *
 *   LEGALLY_VERIFIED: The rule's legal proposition has been independently
 *     verified against an authoritative source by a qualified reviewer.
 *     A rule may claim truthLevel T0 ONLY when LEGALLY_VERIFIED.
 *
 * This module inspects the actual Rule object (not source files). It checks:
 *   - If truthLevel === T0: sourcePropositions MUST exist and be non-empty
 *   - At least one proposition MUST have verificationStatus === 'LEGALLY_VERIFIED'
 *   - Every LEGALLY_VERIFIED proposition MUST have non-empty verifiedBy, verifiedAt, evidenceLocation
 *   - The proposition's sourceId MUST match the rule's sourceId
 *   - The proposition's jurisdictionId MUST match the rule's jurisdictionId
 *
 * Rules with truthLevel !== T0 have no certification requirement (T2 rules
 * may have MACHINE_VALID propositions or none at all).
 *
 * Legacy packages (without sourcePropositions) are grandfathered:
 * the verifier returns { certified: true, violations: [] } for rules
 * that don't have sourcePropositions AND don't claim T0 with the new
 * certification model. A rule that claims T0 but has no sourcePropositions
 * at all is REJECTED — the legacy exception only applies if the package
 * was published before ADR-0024 and the rule doesn't use the
 * sourceProposition pattern.
 */

import type { Rule, SourceProposition } from '@/kernel/primitives/types';

export interface CertificationResult {
  certified: boolean;
  violations: string[];
}

/**
 * Verify whether a single Rule meets the legal certification boundary.
 *
 * A rule is certified if:
 *   - truthLevel !== T0 (no certification requirement for T2/T3/T4/T5), OR
 *   - truthLevel === T0 AND sourcePropositions exist AND at least one
 *     has verificationStatus === 'LEGALLY_VERIFIED' with non-empty
 *     verifiedBy, verifiedAt, evidenceLocation, and matching sourceId +
 *     jurisdictionId.
 */
export function verifyRuleCertification(rule: Rule): CertificationResult {
  const violations: string[] = [];

  // Only T0 rules require LEGALLY_VERIFIED certification.
  if (rule.truthLevel !== 'T0') {
    // Non-T0 rules: if they have sourcePropositions, validate their shape.
    if (rule.ruleIr.sourcePropositions) {
      const propErrors = validatePropositionShape(rule.ruleIr.sourcePropositions, rule.id);
      violations.push(...propErrors);
    }
    return { certified: violations.length === 0, violations };
  }

  // T0 rule — requires LEGALLY_VERIFIED sourceProposition.
  const props = rule.ruleIr.sourcePropositions;

  if (!props || props.length === 0) {
    violations.push(
      `Rule ${rule.id}: claims truthLevel T0 but has no sourcePropositions. ` +
        'T0 rules require at least one LEGALLY_VERIFIED proposition (ADR-0024).',
    );
    return { certified: false, violations };
  }

  // Validate proposition shapes.
  const shapeErrors = validatePropositionShape(props, rule.id);
  violations.push(...shapeErrors);

  // Check for at least one LEGALLY_VERIFIED proposition.
  const verified = props.filter((p) => p.verificationStatus === 'LEGALLY_VERIFIED');
  if (verified.length === 0) {
    violations.push(
      `Rule ${rule.id}: claims truthLevel T0 but has no LEGALLY_VERIFIED proposition. ` +
        `Found ${props.length} proposition(s), all MACHINE_VALID.`,
    );
  }

  // For each LEGALLY_VERIFIED proposition, check required fields.
  for (const p of verified) {
    if (!p.verifiedBy || p.verifiedBy.trim() === '') {
      violations.push(
        `Rule ${rule.id}: LEGALLY_VERIFIED proposition (sourceId=${p.sourceId}) has empty verifiedBy.`,
      );
    }
    if (!p.verifiedAt || p.verifiedAt.trim() === '') {
      violations.push(
        `Rule ${rule.id}: LEGALLY_VERIFIED proposition (sourceId=${p.sourceId}) has empty verifiedAt.`,
      );
    }
    if (!p.evidenceLocation || p.evidenceLocation.trim() === '') {
      violations.push(
        `Rule ${rule.id}: LEGALLY_VERIFIED proposition (sourceId=${p.sourceId}) has empty evidenceLocation.`,
      );
    }

    // The proposition's sourceId should match the rule's sourceId.
    if (p.sourceId !== rule.sourceId) {
      violations.push(
        `Rule ${rule.id}: proposition sourceId (${p.sourceId}) does not match rule sourceId (${rule.sourceId}).`,
      );
    }

    // The proposition's jurisdictionId should match the rule's jurisdictionId.
    if (p.jurisdictionId !== rule.jurisdictionId) {
      violations.push(
        `Rule ${rule.id}: proposition jurisdictionId (${p.jurisdictionId}) does not match rule jurisdictionId (${rule.jurisdictionId}).`,
      );
    }
  }

  return { certified: violations.length === 0, violations };
}

/**
 * Verify certification for all rules in a package.
 * A package is certified only if ALL its rules pass certification.
 */
export function verifyPackageCertification(rules: Rule[]): CertificationResult {
  const allViolations: string[] = [];
  for (const rule of rules) {
    const result = verifyRuleCertification(rule);
    allViolations.push(...result.violations);
  }
  return { certified: allViolations.length === 0, violations: allViolations };
}

/**
 * Validate the structural shape of SourceProposition records.
 * Does NOT check verification status — only that required fields are present.
 */
function validatePropositionShape(props: SourceProposition[], ruleId: string): string[] {
  const errors: string[] = [];
  for (let i = 0; i < props.length; i++) {
    const p = props[i]!;
    const prefix = `Rule ${ruleId}: proposition[${i}]`;
    if (!p.sourceId || typeof p.sourceId !== 'string') {
      errors.push(`${prefix} has missing or non-string sourceId`);
    }
    if (!p.legalProvision || typeof p.legalProvision !== 'string') {
      errors.push(`${prefix} has missing or non-string legalProvision`);
    }
    if (!p.proposition || typeof p.proposition !== 'string') {
      errors.push(`${prefix} has missing or non-string proposition`);
    }
    if (!p.jurisdictionId || typeof p.jurisdictionId !== 'string') {
      errors.push(`${prefix} has missing or non-string jurisdictionId`);
    }
    if (!p.effectiveFrom || typeof p.effectiveFrom !== 'string') {
      errors.push(`${prefix} has missing or non-string effectiveFrom`);
    }
    if (!p.evidenceLocation || typeof p.evidenceLocation !== 'string') {
      errors.push(`${prefix} has missing or non-string evidenceLocation`);
    }
    if (p.verificationStatus !== 'MACHINE_VALID' && p.verificationStatus !== 'LEGALLY_VERIFIED') {
      errors.push(`${prefix} has invalid verificationStatus: ${p.verificationStatus}`);
    }
    if (typeof p.version !== 'number' || p.version < 1 || !Number.isInteger(p.version)) {
      errors.push(`${prefix} has invalid version: ${p.version}`);
    }
  }
  return errors;
}
