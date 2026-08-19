/**
 * Nomos — Built-in Package Loader  (architecture §18, §19)
 * -------------------------------------------------------
 * Imports every built-in package data module under src/lib/packages-data and
 * returns a flat list of LoadedPackage records. The PackageRegistry consumes
 * this list and builds the global JurisdictionGraph + lookup tables.
 *
 * Package data is exported as module-level constants (immutable after
 * publication — per I10). The loader does not mutate them; it only assembles
 * them into LoadedPackage records.
 *
 * Adding a new built-in package = add a data module under
 * src/lib/packages-data, import it here, push a LoadedPackage entry.
 * The kernel itself is never modified (per I1, I11).
 */
import type {
  Action,
  Authority,
  Evidence,
  Jurisdiction,
  JurisdictionEdge,
  PackageManifest,
  Procedure,
  Rule,
  Situation,
  Source,
} from '@/kernel/primitives/types';

import {
  BASE_KERNEL_AUTHORITIES,
  BASE_KERNEL_JURISDICTIONS,
  BASE_KERNEL_MANIFEST,
  BASE_KERNEL_SOURCES,
} from '@/lib/packages-data/base-kernel-capability';
import {
  GHANA_AUTHORITIES,
  GHANA_JURISDICTION_EDGES,
  GHANA_JURISDICTIONS,
  GHANA_MANIFEST,
  GHANA_SOURCES,
} from '@/lib/packages-data/ghana-jurisdiction';
import {
  TOGO_AUTHORITIES,
  TOGO_JURISDICTION_EDGES,
  TOGO_JURISDICTIONS,
  TOGO_MANIFEST,
  TOGO_SOURCES,
} from '@/lib/packages-data/togo-jurisdiction';
import {
  ECOWAS_AUTHORITIES,
  ECOWAS_JURISDICTION_EDGES,
  ECOWAS_JURISDICTIONS,
  ECOWAS_MANIFEST,
  ECOWAS_RULES,
  ECOWAS_SOURCES,
} from '@/lib/packages-data/ecowas-jurisdiction';
import {
  AFCFTA_AUTHORITIES,
  AFCFTA_JURISDICTION_EDGES,
  AFCFTA_JURISDICTIONS,
  AFCFTA_MANIFEST,
  AFCFTA_RULES,
  AFCFTA_SOURCES,
} from '@/lib/packages-data/afcfta-jurisdiction';
import {
  CUSTOMS_TRADE_ACTIONS,
  CUSTOMS_TRADE_MANIFEST,
} from '@/lib/packages-data/customs-trade-domain';
import {
  BORDER_CROSSING_MANIFEST,
  BORDER_CROSSING_PROCEDURES,
  BORDER_CROSSING_SITUATION,
} from '@/lib/packages-data/border-crossing-situation';

// ---------------------------------------------------------------------------
// LoadedPackage shape
// ---------------------------------------------------------------------------
export interface LoadedPackage {
  manifest: PackageManifest;
  jurisdictions: Jurisdiction[];
  jurisdictionEdges: JurisdictionEdge[];
  authorities: Authority[];
  sources: Source[];
  rules: Rule[];
  situations: Situation[];
  procedures: Procedure[];
  actions: Action[];
  evidence: Evidence[];
}

// ---------------------------------------------------------------------------
// Built-in package registry — flat list assembled at module load time.
// ---------------------------------------------------------------------------
// Order matters only for human-readable listings; the PackageRegistry does
// not rely on ordering for correctness (it indexes by id).
export function loadBuiltinPackages(): LoadedPackage[] {
  return [
    // 1. Base kernel capability (CAPABILITY) — fallback authorities/sources.
    {
      manifest: BASE_KERNEL_MANIFEST,
      jurisdictions: BASE_KERNEL_JURISDICTIONS,
      jurisdictionEdges: [],
      authorities: BASE_KERNEL_AUTHORITIES,
      sources: BASE_KERNEL_SOURCES,
      rules: [],
      situations: [],
      procedures: [],
      actions: [],
      evidence: [],
    },
    // 2. Ghana (JURISDICTION)
    {
      manifest: GHANA_MANIFEST,
      jurisdictions: GHANA_JURISDICTIONS,
      jurisdictionEdges: GHANA_JURISDICTION_EDGES,
      authorities: GHANA_AUTHORITIES,
      sources: GHANA_SOURCES,
      rules: [],
      situations: [],
      procedures: [],
      actions: [],
      evidence: [],
    },
    // 3. Togo (JURISDICTION)
    {
      manifest: TOGO_MANIFEST,
      jurisdictions: TOGO_JURISDICTIONS,
      jurisdictionEdges: TOGO_JURISDICTION_EDGES,
      authorities: TOGO_AUTHORITIES,
      sources: TOGO_SOURCES,
      rules: [],
      situations: [],
      procedures: [],
      actions: [],
      evidence: [],
    },
    // 4. ECOWAS (SUPRANATIONAL JURISDICTION + 3 DETERMINISTIC T0 rules)
    {
      manifest: ECOWAS_MANIFEST,
      jurisdictions: ECOWAS_JURISDICTIONS,
      jurisdictionEdges: ECOWAS_JURISDICTION_EDGES,
      authorities: ECOWAS_AUTHORITIES,
      sources: ECOWAS_SOURCES,
      rules: ECOWAS_RULES,
      situations: [],
      procedures: [],
      actions: [],
      evidence: [],
    },
    // 5. AfCFTA (SUPRANATIONAL JURISDICTION + 3 DETERMINISTIC T0 rules)
    {
      manifest: AFCFTA_MANIFEST,
      jurisdictions: AFCFTA_JURISDICTIONS,
      jurisdictionEdges: AFCFTA_JURISDICTION_EDGES,
      authorities: AFCFTA_AUTHORITIES,
      sources: AFCFTA_SOURCES,
      rules: AFCFTA_RULES,
      situations: [],
      procedures: [],
      actions: [],
      evidence: [],
    },
    // 6. Customs & Trade (DOMAIN — 3 actions)
    {
      manifest: CUSTOMS_TRADE_MANIFEST,
      jurisdictions: [],
      jurisdictionEdges: [],
      authorities: [],
      sources: [],
      rules: [],
      situations: [],
      procedures: [],
      actions: CUSTOMS_TRADE_ACTIONS,
      evidence: [],
    },
    // 7. Border Crossing (SITUATION + 2 procedures)
    {
      manifest: BORDER_CROSSING_MANIFEST,
      jurisdictions: [],
      jurisdictionEdges: [],
      authorities: [],
      sources: [],
      rules: [],
      situations: [BORDER_CROSSING_SITUATION],
      procedures: BORDER_CROSSING_PROCEDURES,
      actions: [],
      evidence: [],
    },
  ];
}
