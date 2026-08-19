/**
 * GET /api/demo-presets
 * Returns demo fact bundles + situation/jurisdiction selections the consumer UI
 * can load with one click. Each preset is a self-contained ContextRequest.
 *
 * These are KERNEL-AGNOSTIC demo data — no vertical logic. Vertical specifics
 * live in package data (border_crossing situation pack, ECOWAS/AfCFTA packs).
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

interface DemoPreset {
  id: string;
  label: string;
  description: string;
  situationId: string;
  jurisdictionIds: string[];
  asOf: string;
  objective?: string;
  facts: {
    id: string;
    attribute: string;
    value: unknown;
    truthLevel: 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
    observedAt: string;
  }[];
}

const presets: DemoPreset[] = [
  {
    id: 'gh-to-tgo-personal',
    label: 'Ghana → Togo (Personal Effects)',
    description:
      'Ghanaian national crossing at Aflao into Togo with personal effects under USD 500. Expect ECOWAS free movement + AfCFTA de minimis exemption.',
    situationId: 'sit.border-crossing',
    jurisdictionIds: ['jur.ghana', 'jur.togo'],
    asOf: '2025-01-15',
    objective: 'Cross legally with minimal friction.',
    facts: [
      { id: 'f1', attribute: 'nationality', value: 'GH', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f2', attribute: 'destinationCountry', value: 'TG', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f3', attribute: 'goodsValueUsd', value: 300, truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f4', attribute: 'goodsPurpose', value: 'personal', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f5', attribute: 'hasProhibitedGoods', value: false, truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f6', attribute: 'intendedStayDays', value: 14, truthLevel: 'T0', observedAt: '2025-01-15' },
    ],
  },
  {
    id: 'gh-to-tgo-commercial',
    label: 'Ghana → Togo (Commercial Goods)',
    description:
      'Ghanaian trader crossing with USD 2,500 of commercial goods. Expect AfCFTA customs duty obligation + declaration requirement.',
    situationId: 'sit.border-crossing',
    jurisdictionIds: ['jur.ghana', 'jur.togo'],
    asOf: '2025-01-15',
    objective: 'Declare goods and minimize customs cost legally.',
    facts: [
      { id: 'f1', attribute: 'nationality', value: 'GH', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f2', attribute: 'destinationCountry', value: 'TG', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f3', attribute: 'goodsValueUsd', value: 2500, truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f4', attribute: 'goodsPurpose', value: 'commercial', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f5', attribute: 'hasProhibitedGoods', value: false, truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f6', attribute: 'intendedStayDays', value: 3, truthLevel: 'T0', observedAt: '2025-01-15' },
    ],
  },
  {
    id: 'gh-to-tgo-prohibited',
    label: 'Ghana → Togo (Prohibited Goods Detected)',
    description:
      'Traveler carrying prohibited goods. Expect AfCFTA restriction + border-crossing exception procedure (detention → investigation → referral).',
    situationId: 'sit.border-crossing',
    jurisdictionIds: ['jur.ghana', 'jur.togo'],
    asOf: '2025-01-15',
    objective: 'Understand rights and obligations if goods are detained.',
    facts: [
      { id: 'f1', attribute: 'nationality', value: 'GH', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f2', attribute: 'destinationCountry', value: 'TG', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f3', attribute: 'goodsValueUsd', value: 800, truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f4', attribute: 'goodsPurpose', value: 'commercial', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f5', attribute: 'hasProhibitedGoods', value: true, truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f6', attribute: 'intendedStayDays', value: 7, truthLevel: 'T0', observedAt: '2025-01-15' },
    ],
  },
  {
    id: 'non-ecowas-traveler',
    label: 'Non-ECOWAS Traveler (Outside Free Movement)',
    description:
      'Traveler from a non-ECOWAS state. Expect ECOWAS free movement rules NOT to fire — illustrates rule engine refusal to over-generalize.',
    situationId: 'sit.border-crossing',
    jurisdictionIds: ['jur.ghana', 'jur.togo'],
    asOf: '2025-01-15',
    objective: 'Identify which rules apply to a non-ECOWAS national.',
    facts: [
      { id: 'f1', attribute: 'nationality', value: 'US', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f2', attribute: 'destinationCountry', value: 'TG', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f3', attribute: 'goodsValueUsd', value: 150, truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f4', attribute: 'goodsPurpose', value: 'personal', truthLevel: 'T0', observedAt: '2025-01-15' },
      { id: 'f5', attribute: 'hasProhibitedGoods', value: false, truthLevel: 'T0', observedAt: '2025-01-15' },
    ],
  },
];

export function GET() {
  return NextResponse.json({ presets });
}
