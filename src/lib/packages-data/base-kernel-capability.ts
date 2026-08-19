/**
 * Nomos — Base Kernel Capability Package  (architecture §18, §19)
 * ----------------------------------------------------------------
 * A CAPABILITY package that seeds shared infrastructure authorities and
 * sources that any other package may reference as a fallback. Domain-agnostic
 * (per I1, I3): contains NO vertical concepts (no BorderCrossing, no
 * AfCFTAShipment, no InsuranceClaim). Vertical behaviour lives exclusively
 * in src/lib/packages-data packages composed over generic kernel primitives.
 *
 * Manifest:
 *   packageId           = 'nomos.base-kernel'
 *   version             = '1.0.0'
 *   category            = 'CAPABILITY'
 *   dependencies        = []
 *
 * The kernel itself is FROZEN. This package does not mutate kernel semantics
 * (per I11) — it only exposes generic authorities/sources for other packages
 * to anchor provenance when no more-specific authority applies.
 */
import type {
  Authority,
  Jurisdiction,
  PackageManifest,
  Source,
} from '@/kernel/primitives/types';

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
export const BASE_KERNEL_MANIFEST: PackageManifest = {
  packageId: 'nomos.base-kernel',
  name: 'Nomos Base Kernel Capability',
  version: '1.0.0',
  category: 'CAPABILITY',
  dependencies: [],
  supportedJurisdictions: [],
  domains: [],
  situations: [],
  capabilities: ['nomos.platform.documentation', 'nomos.platform.fallbacks'],
  sources: ['src.nomos.platform-docs'],
  rules: [],
  procedures: [],
  actions: [],
  schemas: [],
  testFixtures: [],
  verificationMetadata: {
    signedBy: 'nomos.release-bot',
    signedAt: '2025-01-01T00:00:00.000Z',
    hash: 'sha256:nomos.base-kernel:1.0.0:0000000000000000000000000000000000000000000000000000000000000000',
  },
  description:
    'Generic fallback authorities and sources used as default provenance anchors by the Nomos platform. Domain-agnostic — contains no vertical concepts.',
};

// ---------------------------------------------------------------------------
// Implicit global jurisdiction
// ---------------------------------------------------------------------------
// The platform recognises an implicit "global" jurisdiction under which
// platform-level authorities operate. This is the root anchor when a rule's
// authority does not fall under any specific country / supranational regime.
export const BASE_KERNEL_JURISDICTIONS: Jurisdiction[] = [
  {
    id: 'jur.global',
    code: 'GLOBAL',
    name: 'Global / Platform-wide',
    kind: 'SUPRANATIONAL',
    parentIds: [],
    temporal: {
      validFrom: '1970-01-01',
      validTo: null,
      publishedAt: '1970-01-01',
      ingestedAt: '2025-01-01',
      version: 1,
      supersedes: null,
      supersededBy: null,
    },
  },
];

// ---------------------------------------------------------------------------
// Authorities
// ---------------------------------------------------------------------------
export const BASE_KERNEL_AUTHORITIES: Authority[] = [
  {
    id: 'auth.nomos.platform',
    name: 'Nomos Platform',
    jurisdictionId: 'jur.global',
    kind: 'OTHER',
  },
];

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
export const BASE_KERNEL_SOURCES: Source[] = [
  {
    id: 'src.nomos.platform-docs',
    title: 'Nomos Platform Documentation',
    citation: 'Nomos Platform Documentation (nomos.local)',
    url: 'https://nomos.local/docs',
    authorityId: 'auth.nomos.platform',
    publishedAt: '2025-01-01',
  },
];
