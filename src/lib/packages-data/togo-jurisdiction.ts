/**
 * Nomos — Togo Jurisdiction Package  (architecture §5, §18, §19)
 * ----------------------------------------------------------------
 * A JURISDICTION package representing the Togolese Republic, its Plateaux
 * Region, and the Sanvéga municipality near Lomé / the Aflao-Kpéni border
 * crossing with Ghana.
 *
 * Manifest:
 *   packageId             = 'jur.togo'
 *   version               = '1.0.0'
 *   category              = 'JURISDICTION'
 *   dependencies          = [{ packageId: 'nomos.base-kernel', versionRange: '^1.0.0' }]
 *   supportedJurisdictions = ['jur.togo']
 *
 * Togo independence from France: 1960-04-27.
 */
import type {
  Authority,
  Jurisdiction,
  JurisdictionEdge,
  PackageManifest,
  Source,
} from '@/kernel/primitives/types';

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
export const TOGO_MANIFEST: PackageManifest = {
  packageId: 'jur.togo',
  name: 'Togo Jurisdiction',
  version: '1.0.0',
  category: 'JURISDICTION',
  dependencies: [{ packageId: 'nomos.base-kernel', versionRange: '^1.0.0' }],
  supportedJurisdictions: ['jur.togo'],
  domains: [],
  situations: [],
  capabilities: [],
  sources: ['src.togo.const1992', 'src.togo.customs.code', 'src.togo.immigration.law'],
  rules: [],
  procedures: [],
  actions: [],
  schemas: [],
  testFixtures: [],
  verificationMetadata: {
    signedBy: 'nomos.release-bot',
    signedAt: '2025-01-01T00:00:00.000Z',
    hash: 'sha256:jur.togo:1.0.0:2222222222222222222222222222222222222222222222222222222222222222',
  },
  description:
    'Jurisdiction, authority, and source data for the Togolese Republic — including the Plateaux Region and the Sanvéga municipality (Lomé border region near Aflao/Kpéni).',
};

// ---------------------------------------------------------------------------
// Jurisdictions
// ---------------------------------------------------------------------------
export const TOGO_JURISDICTIONS: Jurisdiction[] = [
  {
    id: 'jur.togo',
    code: 'TG',
    name: 'Togolese Republic',
    kind: 'COUNTRY',
    parentIds: [],
    temporal: {
      validFrom: '1960-04-27',
      validTo: null,
      publishedAt: '1960-04-27',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
  },
  {
    id: 'jur.togo.region.plateaux',
    code: 'TG-PL',
    name: 'Plateaux Region',
    kind: 'REGION',
    parentIds: ['jur.togo'],
    temporal: {
      validFrom: '1960-04-27',
      validTo: null,
      publishedAt: '1960-04-27',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
  },
  {
    id: 'jur.togo.municipal.sanvega',
    code: 'TG-SVG',
    name: 'Sanvéga (Lomé border commune)',
    kind: 'MUNICIPALITY',
    parentIds: ['jur.togo.region.plateaux'],
    temporal: {
      validFrom: '1960-04-27',
      validTo: null,
      publishedAt: '1960-04-27',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
  },
];

// ---------------------------------------------------------------------------
// Jurisdiction edges  (architecture §5 — 11 frozen relation types)
// ---------------------------------------------------------------------------
export const TOGO_JURISDICTION_EDGES: JurisdictionEdge[] = [
  // Plateaux Region applies to Togo (subnational subdivision of Togo).
  { fromId: 'jur.togo.region.plateaux', toId: 'jur.togo', relation: 'APPLIES_TO' },
  // Sanvéga municipality applies to the Plateaux Region.
  { fromId: 'jur.togo.municipal.sanvega', toId: 'jur.togo.region.plateaux', relation: 'APPLIES_TO' },
];

// ---------------------------------------------------------------------------
// Authorities  (architecture §3 — Authority primitive)
// ---------------------------------------------------------------------------
export const TOGO_AUTHORITIES: Authority[] = [
  {
    id: 'auth.togo.parliament',
    name: 'Assemblée Nationale du Togo (National Assembly of Togo)',
    jurisdictionId: 'jur.togo',
    kind: 'LEGISLATURE',
  },
  {
    id: 'auth.togo.customs',
    name: 'Direction Générale des Douanes (Togo Customs)',
    jurisdictionId: 'jur.togo',
    kind: 'CUSTOMS',
  },
  {
    id: 'auth.togo.immigration',
    name: 'Direction Générale de la Sûreté Nationale (Togo Immigration)',
    jurisdictionId: 'jur.togo',
    kind: 'IMMIGRATION',
  },
];

// ---------------------------------------------------------------------------
// Sources  (architecture §3, §11)
// ---------------------------------------------------------------------------
export const TOGO_SOURCES: Source[] = [
  {
    id: 'src.togo.const1992',
    title: 'Constitution of the Fourth Togolese Republic, 1992',
    citation: 'Constitution of the Fourth Republic of Togo, 1992 (as amended)',
    url: 'https://www.refworld.org/docid/3ae6b5c60.html',
    authorityId: 'auth.togo.parliament',
    publishedAt: '1992-09-27',
  },
  {
    id: 'src.togo.customs.code',
    title: 'Code des Douanes Togolais (Togo Customs Code)',
    citation: 'Code des Douanes — République Togolaise',
    url: 'https://douanes.tg/code-des-douanes',
    authorityId: 'auth.togo.parliament',
    publishedAt: '1969-08-15',
  },
  {
    id: 'src.togo.immigration.law',
    title: 'Loi sur l\'Immigration et l\'Émigration (Togo Immigration Law)',
    citation: 'Loi n° 2007-006 sur l\'Immigration et l\'Émigration — République Togolaise',
    url: 'https://immigration.tg/loi-2007-006',
    authorityId: 'auth.togo.parliament',
    publishedAt: '2007-03-13',
  },
];
