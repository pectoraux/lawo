/**
 * Nomos — Ghana Jurisdiction Package  (architecture §5, §18, §19)
 * ----------------------------------------------------------------
 * A JURISDICTION package representing the Republic of Ghana, its Volta
 * Region, and the Aflao border municipality (where the Aflao–Aneho land
 * border crossing between Ghana and Togo sits).
 *
 * Manifest:
 *   packageId             = 'jur.ghana'
 *   version               = '1.0.0'
 *   category              = 'JURISDICTION'
 *   dependencies          = [{ packageId: 'nomos.base-kernel', versionRange: '^1.0.0' }]
 *   supportedJurisdictions = ['jur.ghana']
 *
 * Ghana independence from the United Kingdom: 1957-03-06.
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
export const GHANA_MANIFEST: PackageManifest = {
  packageId: 'jur.ghana',
  name: 'Ghana Jurisdiction',
  version: '1.0.0',
  category: 'JURISDICTION',
  dependencies: [{ packageId: 'nomos.base-kernel', versionRange: '^1.0.0' }],
  supportedJurisdictions: ['jur.ghana'],
  domains: [],
  situations: [],
  capabilities: [],
  sources: ['src.ghana.const1992', 'src.ghana.customs.act', 'src.ghana.immigration.act'],
  rules: [],
  procedures: [],
  actions: [],
  schemas: [],
  testFixtures: [],
  verificationMetadata: {
    signedBy: 'nomos.release-bot',
    signedAt: '2025-01-01T00:00:00.000Z',
    hash: 'sha256:jur.ghana:1.0.0:1111111111111111111111111111111111111111111111111111111111111111',
  },
  description:
    'Jurisdiction, authority, and source data for the Republic of Ghana — including the Volta Region (where the Aflao land border with Togo is located) and the Aflao municipality.',
};

// ---------------------------------------------------------------------------
// Jurisdictions
// ---------------------------------------------------------------------------
export const GHANA_JURISDICTIONS: Jurisdiction[] = [
  {
    id: 'jur.ghana',
    code: 'GH',
    name: 'Republic of Ghana',
    kind: 'COUNTRY',
    parentIds: [],
    temporal: {
      validFrom: '1957-03-06',
      validTo: null,
      publishedAt: '1957-03-06',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
  },
  {
    id: 'jur.ghana.region.volta',
    code: 'GH-VT',
    name: 'Volta Region',
    kind: 'REGION',
    parentIds: ['jur.ghana'],
    temporal: {
      validFrom: '1957-03-06',
      validTo: null,
      publishedAt: '1957-03-06',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
  },
  {
    id: 'jur.ghana.municipal.aflao',
    code: 'GH-AFL',
    name: 'Aflao (Ketu South Municipal)',
    kind: 'MUNICIPALITY',
    parentIds: ['jur.ghana.region.volta'],
    temporal: {
      validFrom: '1957-03-06',
      validTo: null,
      publishedAt: '1957-03-06',
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
export const GHANA_JURISDICTION_EDGES: JurisdictionEdge[] = [
  // Volta Region applies to Ghana (subnational subdivision of Ghana).
  { fromId: 'jur.ghana.region.volta', toId: 'jur.ghana', relation: 'APPLIES_TO' },
  // Aflao municipality applies to the Volta Region.
  { fromId: 'jur.ghana.municipal.aflao', toId: 'jur.ghana.region.volta', relation: 'APPLIES_TO' },
];

// ---------------------------------------------------------------------------
// Authorities  (architecture §3 — Authority primitive)
// ---------------------------------------------------------------------------
export const GHANA_AUTHORITIES: Authority[] = [
  {
    id: 'auth.ghana.parliament',
    name: 'Parliament of Ghana',
    jurisdictionId: 'jur.ghana',
    kind: 'LEGISLATURE',
  },
  {
    id: 'auth.ghana.customs',
    name: 'Ghana Revenue Authority — Customs Division',
    jurisdictionId: 'jur.ghana',
    kind: 'CUSTOMS',
  },
  {
    id: 'auth.ghana.immigration',
    name: 'Ghana Immigration Service',
    jurisdictionId: 'jur.ghana',
    kind: 'IMMIGRATION',
  },
];

// ---------------------------------------------------------------------------
// Sources  (architecture §3, §11 — authoritative legal text remains source of truth)
// ---------------------------------------------------------------------------
export const GHANA_SOURCES: Source[] = [
  {
    id: 'src.ghana.const1992',
    title: 'Constitution of the Republic of Ghana, 1992',
    citation: 'Constitution of the Republic of Ghana, 1992 (as amended)',
    url: 'https://www.refworld.org/docid/3ae6b5ec0.html',
    authorityId: 'auth.ghana.parliament',
    publishedAt: '1992-04-28',
  },
  {
    id: 'src.ghana.customs.act',
    title: 'Customs Act, 2015 (Act 891)',
    citation: 'Customs Act, 2015 (Act 891) — Parliament of Ghana',
    url: 'https://gra.gov.gh/documents/acts/customs-act-2015-act-891/',
    authorityId: 'auth.ghana.parliament',
    publishedAt: '2015-12-31',
  },
  {
    id: 'src.ghana.immigration.act',
    title: 'Immigration Act, 2000 (Act 573)',
    citation: 'Immigration Act, 2000 (Act 573) — Parliament of Ghana',
    url: 'https://www.immigration.gov.gh/documents/acts/immigration-act-2000-act-573/',
    authorityId: 'auth.ghana.parliament',
    publishedAt: '2000-10-26',
  },
];
