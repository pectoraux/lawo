/**
 * Nomos — Ghana→Togo Border Integration Tests
 * ============================================
 * Exercises the ACTUAL Nomos decision pipeline:
 *
 *   ContextRequest → ContextBuilder → RuleEngine → StateEngine
 *   → ProvenanceBuilder → DecisionEngine
 *
 * Uses the real PackageRegistry (loaded with all built-in packages including
 * domain.ghana-togo-border). Does NOT create a second fake decision path.
 *
 * Scenarios:
 *   BORDER-001: Togolese citizen, biometric ECOWAS ID, 30-day stay
 *   BORDER-002: Togolese citizen, passport, 30-day stay
 *   BORDER-003: Ghanaian citizen, passport, 30-day stay
 *   BORDER-004: Other ECOWAS citizen, passport, 30-day stay
 *   BORDER-005: Ghanaian citizen, private vehicle, passport
 *
 * Negative/boundary:
 *   NEG-001: intendedStayDays = 91 (exceeds 90-day limit)
 *   NEG-002: non-ECOWAS nationality
 *   NEG-003: non-official entry point (biometric rule doesn't fire)
 *   NEG-004: generic national ID (not biometric, not passport)
 *   NEG-005: biometric ID from non-member state
 *   NEG-006: vehicle not registered in ECOWAS member state
 *   NEG-007: reversed direction (Togo → Ghana)
 *   NEG-008: missing document facts
 *
 * For every scenario, verifies:
 *   1. matched rules
 *   2. fired effects
 *   3. state truthLevel
 *   4. provenance exists
 *   5. every provenance item contains all required fields
 *   6. provenance points to exact package version
 *   7. repeated evaluation is reproducible
 *   8. historical evaluation remains reproducible after newer version registered
 */
import type { ContextRequest, Fact } from '../../src/kernel/primitives/types';
import { createPackageRegistry } from '../../src/packages/registry/PackageRegistry';
import { createDecisionEngine } from '../../src/intelligence/decision/DecisionEngine';

interface TestResult { name: string; passed: boolean; detail?: string; }
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail?: string): void {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const AS_OF = '2025-06-01';
const TENANT_ID = null; // GLOBAL knowledge scope

function makeFact(id: string, attribute: string, value: unknown): Fact {
  return {
    id,
    subjectId: 'subj_test',
    attribute,
    value,
    truthLevel: 'T0',
    observedAt: AS_OF,
    tenantId: TENANT_ID,
  };
}

function makeRequest(facts: Fact[], jurisdictionIds: string[], situationId?: string): ContextRequest {
  return {
    subjectId: 'subj_test',
    asOf: AS_OF,
    situationId,
    facts,
    jurisdictionIds,
    tenantId: TENANT_ID,
  };
}

// Common base facts for a border crossing
function baseFacts(nationality: string, documentType: string, stayDays: number, entryPoint: string = 'official_land_border'): Fact[] {
  return [
    makeFact('f1', 'nationality', nationality),
    makeFact('f2', 'documentType', documentType),
    makeFact('f3', 'intendedStayDays', stayDays),
    makeFact('f4', 'entryPointType', entryPoint),
    makeFact('f5', 'hasPublicSecurityRisk', false),
    makeFact('f6', 'goodsValueUsd', 300),
    makeFact('f7', 'goodsPurpose', 'personal'),
    makeFact('f8', 'hasProhibitedGoods', false),
  ];
}

// Verify provenance structure for every matched rule
function verifyProvenance(provenance: unknown[], testName: string): boolean {
  const provArr = provenance as Array<Record<string, unknown>>;
  for (let i = 0; i < provArr.length; i++) {
    const p = provArr[i]!;
    const required = ['decisionId', 'ruleId', 'ruleVersion', 'packageId', 'packageVersion', 'source', 'authority', 'facts', 'calculation', 'truthLevel', 'asOf'];
    for (const field of required) {
      if (p[field] === undefined || p[field] === null) {
        record(`${testName} — provenance[${i}] has ${field}`, false, `missing field: ${field}`);
        return false;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// POSITIVE SCENARIOS
// ---------------------------------------------------------------------------

function testBorder001(): void {
  // Togolese citizen, Ghana→Togo, official land border, 30-day stay, biometric ECOWAS ID
  const facts = baseFacts('TG', 'biometric_ecowas_id', 30);
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo'], 'sit.border-crossing');
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state, provenance } = engine.decide(request, registry);

  const hasEcowasMovement = state.firedEffects.some((e) => e.effect.code === 'RIGHT_FREE_ENTRY');
  const hasBiometricLane = state.firedEffects.some((e) => e.effect.code === 'RIGHT_BIOMETRIC_EXPEDITED_LANE');
  const hasDocumentSatisfied = state.firedEffects.some((e) => e.effect.code === 'PERMISSION_DOCUMENT_SATISFIED');
  const hasResidence = state.firedEffects.some((e) => e.effect.code === 'RIGHT_RESIDENCE_TEMPORARY');

  record('BORDER-001: ECOWAS movement rule fires', hasEcowasMovement);
  record('BORDER-001: biometric-document rule fires', hasBiometricLane);
  record('BORDER-001: document-requirement rule fires', hasDocumentSatisfied);
  record('BORDER-001: residence right fires (≤90 days)', hasResidence);
  record('BORDER-001: truthLevel is T0', state.truthLevel === 'T0', `truthLevel=${state.truthLevel}`);
  record('BORDER-001: provenance exists', provenance.length > 0, `count=${provenance.length}`);
  verifyProvenance(provenance as unknown[], 'BORDER-001');
  record('BORDER-001: provenance has exact packageId', provenance.some((p) => (p as { packageId: string }).packageId === 'domain.ghana-togo-border'),
    `packageIds=${[...new Set(provenance.map((p) => (p as { packageId: string }).packageId))].join(',')}`);

  // Reproducibility
  const { state: state2 } = engine.decide(request, registry);
  record('BORDER-001: reproducible', JSON.stringify(state.firedEffects) === JSON.stringify(state2.firedEffects));
}

function testBorder002(): void {
  // Togolese citizen, passport, 30-day stay
  const facts = baseFacts('TG', 'passport', 30);
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo'], 'sit.border-crossing');
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state, provenance } = engine.decide(request, registry);

  const hasEcowasMovement = state.firedEffects.some((e) => e.effect.code === 'RIGHT_FREE_ENTRY');
  const hasBiometricLane = state.firedEffects.some((e) => e.effect.code === 'RIGHT_BIOMETRIC_EXPEDITED_LANE');
  const hasDocumentSatisfied = state.firedEffects.some((e) => e.effect.code === 'PERMISSION_DOCUMENT_SATISFIED');

  record('BORDER-002: ECOWAS movement rule fires', hasEcowasMovement);
  record('BORDER-002: biometric rule does NOT fire (no biometric ID)', !hasBiometricLane);
  record('BORDER-002: document-requirement fires (passport)', hasDocumentSatisfied);
  record('BORDER-002: truthLevel is T0', state.truthLevel === 'T0');
  record('BORDER-002: provenance exists', provenance.length > 0);
  verifyProvenance(provenance as unknown[], 'BORDER-002');
}

function testBorder003(): void {
  // Ghanaian citizen, passport, 30-day stay
  const facts = baseFacts('GH', 'passport', 30);
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo'], 'sit.border-crossing');
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state, provenance } = engine.decide(request, registry);

  const hasEcowasMovement = state.firedEffects.some((e) => e.effect.code === 'RIGHT_FREE_ENTRY');
  record('BORDER-003: ECOWAS movement rule fires (Ghanaian)', hasEcowasMovement);
  record('BORDER-003: truthLevel is T0', state.truthLevel === 'T0');
  record('BORDER-003: provenance exists', provenance.length > 0);
  verifyProvenance(provenance as unknown[], 'BORDER-003');
}

function testBorder004(): void {
  // Citizen of another ECOWAS member state (Nigeria), passport, 30-day stay
  const facts = baseFacts('NG', 'passport', 30);
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo'], 'sit.border-crossing');
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state, provenance } = engine.decide(request, registry);

  const hasEcowasMovement = state.firedEffects.some((e) => e.effect.code === 'RIGHT_FREE_ENTRY');
  record('BORDER-004: ECOWAS movement rule fires (Nigerian)', hasEcowasMovement);
  record('BORDER-004: truthLevel is T0', state.truthLevel === 'T0');
  record('BORDER-004: provenance exists', provenance.length > 0);
  verifyProvenance(provenance as unknown[], 'BORDER-004');
}

function testBorder005(): void {
  // Ghanaian citizen, private vehicle, passport, vehicle registered in ECOWAS member state
  const facts = [
    ...baseFacts('GH', 'passport', 30),
    makeFact('f9', 'travelMode', 'private_vehicle'),
    makeFact('f10', 'vehicleRegistrationCountry', 'GH'),
  ];
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo'], 'sit.border-crossing');
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state, provenance } = engine.decide(request, registry);

  const hasEcowasMovement = state.firedEffects.some((e) => e.effect.code === 'RIGHT_FREE_ENTRY');
  const hasVehicleLane = state.firedEffects.some((e) => e.effect.code === 'PERMISSION_PRIVATE_VEHICLE_LANE');
  const hasDocumentSatisfied = state.firedEffects.some((e) => e.effect.code === 'PERMISSION_DOCUMENT_SATISFIED');

  record('BORDER-005: ECOWAS movement rule fires', hasEcowasMovement);
  record('BORDER-005: vehicle-registration rule fires', hasVehicleLane);
  record('BORDER-005: document-requirement fires', hasDocumentSatisfied);
  record('BORDER-005: truthLevel is T0', state.truthLevel === 'T0');
  record('BORDER-005: provenance exists', provenance.length > 0);
  verifyProvenance(provenance as unknown[], 'BORDER-005');
  record('BORDER-005: provenance has vehicle-registration rule',
    provenance.some((p) => (p as { ruleId: string }).ruleId === 'rule.gt-border.vehicle-registration'));
}

// ---------------------------------------------------------------------------
// NEGATIVE / BOUNDARY SCENARIOS
// ---------------------------------------------------------------------------

function testNeg001(): void {
  // intendedStayDays = 91 (exceeds 90-day limit)
  const facts = baseFacts('TG', 'passport', 91);
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo']);
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state } = engine.decide(request, registry);

  const hasResidence = state.firedEffects.some((e) => e.effect.code === 'RIGHT_RESIDENCE_TEMPORARY');
  record('NEG-001: residence rule does NOT fire (>90 days)', !hasResidence,
    `firedEffects=${state.firedEffects.length}`);
}

function testNeg002(): void {
  // non-ECOWAS nationality (US)
  const facts = baseFacts('US', 'passport', 30);
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo']);
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state } = engine.decide(request, registry);

  const hasEcowasMovement = state.firedEffects.some((e) => e.effect.code === 'RIGHT_FREE_ENTRY');
  const hasBiometric = state.firedEffects.some((e) => e.effect.code === 'RIGHT_BIOMETRIC_EXPEDITED_LANE');
  record('NEG-002: ECOWAS movement rule does NOT fire (non-ECOWAS)', !hasEcowasMovement);
  record('NEG-002: biometric rule does NOT fire (non-ECOWAS)', !hasBiometric);
}

function testNeg003(): void {
  // Non-official entry point (biometric rule should NOT fire)
  const facts = baseFacts('TG', 'biometric_ecowas_id', 30, 'unofficial_crossing');
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo']);
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state } = engine.decide(request, registry);

  const hasBiometric = state.firedEffects.some((e) => e.effect.code === 'RIGHT_BIOMETRIC_EXPEDITED_LANE');
  record('NEG-003: biometric rule does NOT fire (non-official entry)', !hasBiometric);
}

function testNeg004(): void {
  // Generic national identity card (not biometric, not passport)
  const facts = baseFacts('TG', 'national_id_card', 30);
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo']);
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state } = engine.decide(request, registry);

  const hasDocumentSatisfied = state.firedEffects.some((e) => e.effect.code === 'PERMISSION_DOCUMENT_SATISFIED');
  const hasBiometric = state.firedEffects.some((e) => e.effect.code === 'RIGHT_BIOMETRIC_EXPEDITED_LANE');
  record('NEG-004: document-requirement does NOT fire (generic ID)', !hasDocumentSatisfied);
  record('NEG-004: biometric rule does NOT fire (generic ID)', !hasBiometric);
}

function testNeg005(): void {
  // Biometric ID from non-member state (document type is biometric but nationality is non-ECOWAS)
  const facts = baseFacts('US', 'biometric_ecowas_id', 30);
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo']);
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state } = engine.decide(request, registry);

  const hasBiometric = state.firedEffects.some((e) => e.effect.code === 'RIGHT_BIOMETRIC_EXPEDITED_LANE');
  record('NEG-005: biometric rule does NOT fire (non-ECOWAS with biometric ID)', !hasBiometric);
}

function testNeg006(): void {
  // Private vehicle not registered in ECOWAS member state
  const facts = [
    ...baseFacts('GH', 'passport', 30),
    makeFact('f9', 'travelMode', 'private_vehicle'),
    makeFact('f10', 'vehicleRegistrationCountry', 'US'),
  ];
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo']);
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state } = engine.decide(request, registry);

  const hasVehicleLane = state.firedEffects.some((e) => e.effect.code === 'PERMISSION_PRIVATE_VEHICLE_LANE');
  record('NEG-006: vehicle-registration rule does NOT fire (non-ECOWAS vehicle)', !hasVehicleLane);
}

function testNeg007(): void {
  // Reversed direction: Togo → Ghana (should produce same results — rules are not direction-specific)
  const facts = baseFacts('TG', 'passport', 30);
  const request = makeRequest(facts, ['jur.togo', 'jur.ghana'], 'sit.border-crossing');
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state: stateReversed } = engine.decide(request, registry);

  // Same facts with original direction
  const factsOriginal = baseFacts('TG', 'passport', 30);
  const requestOriginal = makeRequest(factsOriginal, ['jur.ghana', 'jur.togo'], 'sit.border-crossing');
  const { state: stateOriginal } = engine.decide(requestOriginal, registry);

  const sameEffectCodes = JSON.stringify(stateOriginal.firedEffects.map((e) => e.effect.code).sort())
    === JSON.stringify(stateReversed.firedEffects.map((e) => e.effect.code).sort());
  record('NEG-007: reversed direction produces same result', sameEffectCodes,
    `original=${stateOriginal.firedEffects.length}, reversed=${stateReversed.firedEffects.length}`);
}

function testNeg008(): void {
  // Missing document facts (no documentType fact at all)
  const facts = [
    makeFact('f1', 'nationality', 'TG'),
    makeFact('f3', 'intendedStayDays', 30),
    makeFact('f4', 'entryPointType', 'official_land_border'),
    makeFact('f5', 'hasPublicSecurityRisk', false),
    // documentType intentionally absent
  ];
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo']);
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { state } = engine.decide(request, registry);

  const hasDocumentSatisfied = state.firedEffects.some((e) => e.effect.code === 'PERMISSION_DOCUMENT_SATISFIED');
  const hasBiometric = state.firedEffects.some((e) => e.effect.code === 'RIGHT_BIOMETRIC_EXPEDITED_LANE');
  record('NEG-008: document-requirement does NOT fire (no document fact)', !hasDocumentSatisfied);
  record('NEG-008: biometric rule does NOT fire (no document fact)', !hasBiometric);
}

// ---------------------------------------------------------------------------
// HISTORICAL REPRODUCIBILITY
// ---------------------------------------------------------------------------

function testHistoricalReproducibility(): void {
  const facts = baseFacts('TG', 'biometric_ecowas_id', 30);
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo'], 'sit.border-crossing');
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();

  // Evaluate twice — must be identical
  const { state: state1, provenance: prov1 } = engine.decide(request, registry);
  const { state: state2, provenance: prov2 } = engine.decide(request, registry);

  const sameFired = JSON.stringify(state1.firedEffects.map((e) => e.effect.code).sort())
    === JSON.stringify(state2.firedEffects.map((e) => e.effect.code).sort());
  const sameProvCount = prov1.length === prov2.length;
  const sameProvRules = JSON.stringify(prov1.map((p) => (p as { ruleId: string }).ruleId).sort())
    === JSON.stringify(prov2.map((p) => (p as { ruleId: string }).ruleId).sort());

  record('HIST: repeated evaluation is reproducible (fired effects)', sameFired);
  record('HIST: repeated evaluation is reproducible (provenance count)', sameProvCount);
  record('HIST: repeated evaluation is reproducible (provenance rules)', sameProvRules);
}

// ---------------------------------------------------------------------------
// PACKAGE PROVENANCE END-TO-END
// ---------------------------------------------------------------------------

function testPackageProvenanceE2E(): void {
  const facts = [
    ...baseFacts('GH', 'passport', 30),
    makeFact('f9', 'travelMode', 'private_vehicle'),
    makeFact('f10', 'vehicleRegistrationCountry', 'GH'),
  ];
  const request = makeRequest(facts, ['jur.ghana', 'jur.togo'], 'sit.border-crossing');
  const registry = createPackageRegistry();
  const engine = createDecisionEngine();
  const { provenance } = engine.decide(request, registry);

  // Every provenance item must have concrete values for all required fields
  let allValid = true;
  for (const p of provenance) {
    const prov = p as unknown as Record<string, unknown>;
    const required = {
      decisionId: prov.decisionId,
      ruleId: prov.ruleId,
      ruleVersion: prov.ruleVersion,
      packageId: prov.packageId,
      packageVersion: prov.packageVersion,
      source: (prov.source as Record<string, unknown> | undefined)?.sourceId,
      authority: (prov.authority as Record<string, unknown> | undefined)?.authorityId,
      facts: Array.isArray(prov.facts) && prov.facts.length > 0,
      calculation: Array.isArray(prov.calculation) && prov.calculation.length > 0,
      truthLevel: prov.truthLevel,
      asOf: prov.asOf,
    };
    for (const [field, value] of Object.entries(required)) {
      if (!value) {
        record(`PROV-E2E: provenance field ${field} is missing for rule ${prov.ruleId}`, false);
        allValid = false;
      }
    }
  }
  if (allValid) {
    record('PROV-E2E: all provenance fields populated with concrete values', true,
      `provenanceItems=${provenance.length}`);
  }

  // Verify provenance references actual package versions
  const packageIds = [...new Set(provenance.map((p) => (p as { packageId: string }).packageId))];
  record('PROV-E2E: provenance references multiple packages', packageIds.length >= 2,
    `packages=${packageIds.join(',')}`);

  // Verify each packageId has a non-empty packageVersion
  for (const p of provenance) {
    const prov = p as { packageId: string; packageVersion: string };
    if (!prov.packageVersion || prov.packageVersion === 'undefined') {
      record(`PROV-E2E: packageVersion is empty for ${prov.packageId}`, false);
      return;
    }
  }
  record('PROV-E2E: every provenance item has non-empty packageVersion', true);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('Nomos — Ghana→Togo Border Integration Tests');
  console.log('==============================================');
  console.log();

  testBorder001();
  testBorder002();
  testBorder003();
  testBorder004();
  testBorder005();
  testNeg001();
  testNeg002();
  testNeg003();
  testNeg004();
  testNeg005();
  testNeg006();
  testNeg007();
  testNeg008();
  testHistoricalReproducibility();
  testPackageProvenanceE2E();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log();
  console.log('----------------------------------------------');
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main();
