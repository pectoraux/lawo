/**
 * Nomos — Customs & Trade Domain Pack  (architecture §6, §18, §19)
 * -----------------------------------------------------------------
 * A DOMAIN package that adds customs/trade actions the border crossing
 * situation can use. Domain packs MAY define: domain schemas, facts, rules,
 * procedures, workflows, actions, connectors, document parsers, agents, UI
 * components (per architecture §6). This pack contributes ACTIONS only —
 * jurisdictions, sources and rules are owned by the JURISDICTION packs
 * (jur.ghana, jur.togo, jur.ecowas, jur.afcfta).
 *
 * Manifest:
 *   packageId   = 'pkg.domain.customs-trade'
 *   version     = '1.0.0'
 *   category    = 'DOMAIN'
 *   dependencies = [
 *     { packageId: 'jur.afcfta', versionRange: '^1.0.0' },
 *     { packageId: 'jur.ecowas', versionRange: '^1.0.0' },
 *   ]
 *
 * Domain packs MUST NOT mutate kernel semantics (per I11). The actions here
 * are pure data composed over the generic Action primitive.
 */
import type {
  Action,
  ConditionNode,
  PackageManifest,
} from '@/kernel/primitives/types';

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
export const CUSTOMS_TRADE_MANIFEST: PackageManifest = {
  packageId: 'pkg.domain.customs-trade',
  name: 'Customs & Trade Domain Pack',
  version: '1.0.0',
  category: 'DOMAIN',
  dependencies: [
    { packageId: 'jur.afcfta', versionRange: '^1.0.0' },
    { packageId: 'jur.ecowas', versionRange: '^1.0.0' },
  ],
  supportedJurisdictions: [],
  domains: ['customs-trade'],
  situations: [],
  capabilities: [],
  sources: [],
  rules: [],
  procedures: [],
  actions: ['act.declare-goods', 'act.pay-duty', 'act.present-passport'],
  schemas: [],
  testFixtures: [],
  verificationMetadata: {
    signedBy: 'nomos.release-bot',
    signedAt: '2025-01-01T00:00:00.000Z',
    hash: 'sha256:pkg.domain.customs-trade:1.0.0:5555555555555555555555555555555555555555555555555555555555555555',
  },
  description:
    'Customs & trade domain actions (declare goods, pay customs duty, present passport). Used by the border crossing situation package.',
};

// ---------------------------------------------------------------------------
// Action preconditions (pure-data boolean expression trees — architecture §11)
// ---------------------------------------------------------------------------
const preconditionGoodsValueGte500: ConditionNode = {
  kind: 'leaf',
  fact: 'goodsValueUsd',
  operator: 'gte',
  value: 500,
};

const preconditionNationalityExists: ConditionNode = {
  kind: 'leaf',
  fact: 'nationality',
  operator: 'exists',
  value: true,
};

// ---------------------------------------------------------------------------
// Actions  (architecture §28 — Decision → Action → Preconditions → Execution
//           → Result → Evidence → Updated State)
// ---------------------------------------------------------------------------
export const CUSTOMS_TRADE_ACTIONS: Action[] = [
  {
    id: 'act.declare-goods',
    code: 'ACT_DECLARE_GOODS',
    label: 'Submit goods declaration to customs',
    description:
      'Submit a formal goods declaration to the customs authority of the destination state. Triggers customs assessment of duties and applicable restrictions.',
    kind: 'SUBMIT',
    preconditions: preconditionGoodsValueGte500,
    executionHint:
      'Submit declaration form (verbal for personal effects under de minimis; written for commercial goods).',
    expectedResult: 'Declaration received; assessment issued.',
  },
  {
    id: 'act.pay-duty',
    code: 'ACT_PAY_DUTY',
    label: 'Pay customs duty',
    description:
      'Pay the customs duty assessed on commercial goods. Releases the goods for entry into the destination state.',
    kind: 'PAY',
    preconditions: preconditionGoodsValueGte500,
    executionHint:
      'Pay at the customs counter; receive a receipt authorising release of the goods.',
    expectedResult: 'Duty paid; receipt issued; release authorized.',
  },
  {
    id: 'act.present-passport',
    code: 'ACT_PRESENT_PASSPORT',
    label: 'Present passport / travel document at immigration',
    description:
      'Present the traveller\'s passport or recognised travel document to the immigration officer at the destination entry checkpoint. Verifies traveller identity and ECOWAS free-movement eligibility.',
    kind: 'SUBMIT',
    preconditions: preconditionNationalityExists,
    executionHint:
      'Hand passport to the immigration officer at the entry counter; await entry stamp.',
    expectedResult: 'Traveler identity verified.',
  },
];
