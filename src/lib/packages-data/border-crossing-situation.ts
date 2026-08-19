/**
 * Nomos — Border Crossing Situation Package  (architecture §7, §8, §18, §19)
 * --------------------------------------------------------------------------
 * A SITUATION package defining the state machine for crossing a land border.
 * The situation engine is responsible for knowing where the user is in the
 * procedure (architecture §7). Separate from the RULE ENGINE (which decides
 * "what is legally allowed/required?") and the PROCEDURE ENGINE (which decides
 * "what actually happens next in the institutional process?") — architecture §8.
 *
 * Manifest:
 *   packageId   = 'pkg.situation.border-crossing'
 *   version     = '1.0.0'
 *   category    = 'SITUATION'
 *   dependencies = [
 *     { packageId: 'jur.ghana',                versionRange: '^1.0.0' },
 *     { packageId: 'jur.togo',                 versionRange: '^1.0.0' },
 *     { packageId: 'jur.ecowas',               versionRange: '^1.0.0' },
 *     { packageId: 'jur.afcfta',               versionRange: '^1.0.0' },
 *     { packageId: 'pkg.domain.customs-trade', versionRange: '^1.0.0' },
 *   ]
 *
 * Vertical behaviour lives HERE (in the package), never in the kernel (per I1,
 * I3, I4). The kernel SituationEngine is domain-agnostic.
 */
import type {
  ConditionNode,
  PackageManifest,
  Procedure,
  Situation,
} from '@/kernel/primitives/types';

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
export const BORDER_CROSSING_MANIFEST: PackageManifest = {
  packageId: 'pkg.situation.border-crossing',
  name: 'Border Crossing Situation Pack',
  version: '1.0.0',
  category: 'SITUATION',
  dependencies: [
    { packageId: 'jur.ghana', versionRange: '^1.0.0' },
    { packageId: 'jur.togo', versionRange: '^1.0.0' },
    { packageId: 'jur.ecowas', versionRange: '^1.0.0' },
    { packageId: 'jur.afcfta', versionRange: '^1.0.0' },
    { packageId: 'pkg.domain.customs-trade', versionRange: '^1.0.0' },
  ],
  supportedJurisdictions: [],
  domains: ['customs-trade'],
  situations: ['sit.border-crossing'],
  capabilities: [],
  sources: [],
  rules: [],
  procedures: [
    'proc.border-crossing.standard',
    'proc.border-crossing.exception-prohibited-goods',
  ],
  actions: [],
  schemas: [],
  testFixtures: [],
  verificationMetadata: {
    signedBy: 'nomos.release-bot',
    signedAt: '2025-01-01T00:00:00.000Z',
    hash: 'sha256:pkg.situation.border-crossing:1.0.0:6666666666666666666666666666666666666666666666666666666666666666',
  },
  description:
    'Border crossing situation state machine (APPROACH → ORIGIN_EXIT → TRANSITION → DESTINATION_ENTRY → CUSTOMS → COMPLETION) plus the standard 6-step procedure and an exception procedure for prohibited-goods detention.',
};

// ---------------------------------------------------------------------------
// Entry / exit conditions  (pure-data boolean expression trees — §11)
// ---------------------------------------------------------------------------
const entryConditionNationalityExists: ConditionNode = {
  kind: 'leaf',
  fact: 'nationality',
  operator: 'exists',
  value: true,
};

const exitConditionCleared: ConditionNode = {
  kind: 'leaf',
  fact: 'cleared',
  operator: 'eq',
  value: true,
};

// ---------------------------------------------------------------------------
// Situation  (architecture §7 — first-class state machine)
// ---------------------------------------------------------------------------
export const BORDER_CROSSING_SITUATION: Situation = {
  id: 'sit.border-crossing',
  code: 'BORDER_CROSSING',
  label: 'Border Crossing',
  description:
    'A traveller crosses a land border between two states — e.g. Ghana → Togo via the Aflao border post. Exercises ECOWAS free-movement rights and AfCFTA customs rules.',
  packageId: 'pkg.situation.border-crossing',
  entryConditions: entryConditionNationalityExists,
  states: [
    {
      id: 'APPROACH',
      label: 'Approach border post',
      description: 'Traveller approaches the origin border facility.',
    },
    {
      id: 'ORIGIN_EXIT',
      label: 'Origin immigration exit',
      description: 'Traveller exits the origin state at the origin-side immigration counter.',
    },
    {
      id: 'TRANSITION',
      label: 'Cross boundary',
      description: 'Traveller is physically between the two posts (no-man\'s-land).',
    },
    {
      id: 'DESTINATION_ENTRY',
      label: 'Destination immigration entry',
      description: 'Traveller presents at the destination-side immigration counter.',
    },
    {
      id: 'CUSTOMS',
      label: 'Customs inspection / declaration',
      description: 'Traveller presents goods for inspection or formal declaration.',
    },
    {
      id: 'COMPLETION',
      label: 'Border crossing completed',
      description: 'Traveller has cleared the border.',
      isTerminal: true,
    },
  ],
  transitions: [
    { from: 'APPROACH', to: 'ORIGIN_EXIT', event: 'arrive_at_origin_border' },
    { from: 'ORIGIN_EXIT', to: 'TRANSITION', event: 'exit_origin' },
    { from: 'TRANSITION', to: 'DESTINATION_ENTRY', event: 'cross_boundary' },
    { from: 'DESTINATION_ENTRY', to: 'CUSTOMS', event: 'proceed_to_customs' },
    {
      from: 'CUSTOMS',
      to: 'COMPLETION',
      event: 'clear_customs',
      requiredFacts: ['goodsValueUsd'],
    },
  ],
  requiredFacts: [
    'nationality',
    'destinationCountry',
    'goodsValueUsd',
    'goodsPurpose',
    'hasProhibitedGoods',
  ],
  applicableDomains: ['customs-trade'],
  actors: [
    'traveler',
    'origin_immigration_officer',
    'destination_immigration_officer',
    'customs_officer',
  ],
  procedures: ['proc.border-crossing.standard'],
  possibleActions: ['act.present-passport', 'act.declare-goods', 'act.pay-duty'],
  exitConditions: exitConditionCleared,
  exceptionPaths: ['proc.border-crossing.exception-prohibited-goods'],
};

// ---------------------------------------------------------------------------
// Standard procedure  (architecture §8)
// ---------------------------------------------------------------------------
export const BORDER_CROSSING_STANDARD_PROCEDURE: Procedure = {
  id: 'proc.border-crossing.standard',
  code: 'PROC_BORDER_CROSSING_STANDARD',
  label: 'Standard Border Crossing Procedure',
  situationId: 'sit.border-crossing',
  steps: [
    {
      id: 'step.approach',
      code: 'STEP_APPROACH',
      label: 'Approach border post',
      description: 'Arrive at the border facility; follow signage to the appropriate lane.',
      timing: '5–15 minutes',
      nextStep: 'step.origin-immigration',
    },
    {
      id: 'step.origin-immigration',
      code: 'STEP_ORIGIN_IMMIGRATION',
      label: 'Origin immigration exit',
      description: 'Present travel document at the origin-side immigration counter to obtain an exit stamp.',
      requiredDocuments: ['passport'],
      expectedOutputs: ['exit-stamp'],
      timing: '5–30 minutes',
      nextStep: 'step.transition',
    },
    {
      id: 'step.transition',
      code: 'STEP_TRANSITION',
      label: 'Cross boundary',
      description: 'Travel between the origin and destination posts.',
      timing: '2–10 minutes',
      nextStep: 'step.destination-immigration',
    },
    {
      id: 'step.destination-immigration',
      code: 'STEP_DESTINATION_IMMIGRATION',
      label: 'Destination immigration entry',
      description: 'Present travel document at the destination-side immigration counter to obtain an entry stamp.',
      requiredDocuments: ['passport'],
      expectedOutputs: ['entry-stamp'],
      timing: '5–30 minutes',
      nextStep: 'step.customs',
    },
    {
      id: 'step.customs',
      code: 'STEP_CUSTOMS',
      label: 'Customs inspection / declaration',
      description:
        'Present goods for inspection or formal declaration. Personal effects under USD 500 may be declared orally; commercial goods require a written declaration and trigger duty assessment.',
      requiredDocuments: ['goods-declaration', 'passport-only'],
      acceptedAlternatives: ['oral-declaration-for-personal-effects'],
      expectedOutputs: ['customs-clearance'],
      fees: [{ label: 'Customs duty (if applicable)', amount: 0, currency: 'USD' }],
      timing: '5–60 minutes',
      nextStep: 'step.completion',
      exceptionPath: 'proc.border-crossing.exception-prohibited-goods',
    },
    {
      id: 'step.completion',
      code: 'STEP_COMPLETION',
      label: 'Border crossing completed',
      description: 'You have cleared the border. Proceed to your destination.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Exception procedure — prohibited goods detention  (architecture §8)
// ---------------------------------------------------------------------------
export const BORDER_CROSSING_EXCEPTION_PROCEDURE: Procedure = {
  id: 'proc.border-crossing.exception-prohibited-goods',
  code: 'PROC_BORDER_CROSSING_EXCEPTION_PROHIBITED_GOODS',
  label: 'Border Crossing — Exception: Prohibited Goods Detention',
  situationId: 'sit.border-crossing',
  steps: [
    {
      id: 'step.detention',
      code: 'STEP_DETENTION',
      label: 'Goods detained',
      description:
        'Goods suspected of being prohibited or restricted are detained at the customs counter. The traveller is formally notified.',
      requiredDocuments: ['detention-notice'],
      expectedOutputs: ['detention-receipt'],
      timing: '15–60 minutes',
      nextStep: 'step.investigation',
    },
    {
      id: 'step.investigation',
      code: 'STEP_INVESTIGATION',
      label: 'Investigation',
      description:
        'Customs officer investigates the detained goods to confirm classification and applicable offence.',
      requiredDocuments: ['detention-notice', 'goods-declaration'],
      expectedOutputs: ['investigation-report'],
      timing: '1–24 hours',
      nextStep: 'step.referral',
    },
    {
      id: 'step.referral',
      code: 'STEP_REFERRAL',
      label: 'Referral to competent authority',
      description:
        'The matter is referred to the competent national authority (e.g. police, narcotics unit, or customs tribunal) for adjudication.',
      requiredDocuments: ['investigation-report', 'detention-notice'],
      expectedOutputs: ['referral-acknowledgement'],
      timing: '1–7 days',
    },
  ],
};

// ---------------------------------------------------------------------------
// Convenience export — all procedures defined by this package.
// ---------------------------------------------------------------------------
export const BORDER_CROSSING_PROCEDURES: Procedure[] = [
  BORDER_CROSSING_STANDARD_PROCEDURE,
  BORDER_CROSSING_EXCEPTION_PROCEDURE,
];
