// =============================================================================
// Identity — Plane E platform primitive
// =============================================================================
// Minimal identity module. NOT full NextAuth — these are demo identities for
// the consumer UI and the operator console. Real auth wiring happens later;
// for now we just need a stable set of principals that exercise the Tenant
// / KnowledgeScope matrix.
// =============================================================================

import type { TenantKind } from '@/platform/tenancy/TenantContext';

export type IdentityRole = 'GUEST' | 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';

export interface Identity {
  id: string;
  label: string;
  /** null for guests (no tenant membership). */
  tenantId: string | null;
  kind: TenantKind | null;
  role: IdentityRole;
}

// -----------------------------------------------------------------------------
// Demo identities
// -----------------------------------------------------------------------------
// These ids are stable and intentionally human-readable so the consumer UI and
// tests can refer to them without a database lookup.
export const demoIdentities: Identity[] = [
  {
    id: 'id_guest',
    label: 'Guest',
    tenantId: null,
    kind: null,
    role: 'GUEST',
  },
  {
    // A Ghanaian individual user — exercises INDIVIDUAL tenancy.
    id: 'id_kwame',
    label: 'Kwame Mensah',
    tenantId: 'tenant_gh_individual_01',
    kind: 'INDIVIDUAL',
    role: 'USER',
  },
  {
    // An enterprise operator — exercises ENTERPRISE tenancy.
    id: 'id_ada_ops',
    label: 'Ada Okafor (Operator)',
    tenantId: 'tenant_enterprise_01',
    kind: 'ENTERPRISE',
    role: 'OPERATOR',
  },
  {
    // A packager/admin — exercises PROFESSIONAL_ORG tenancy and has elevated role.
    id: 'id_admin',
    label: 'System Admin',
    tenantId: 'tenant_professional_org_01',
    kind: 'PROFESSIONAL_ORG',
    role: 'ADMIN',
  },
];

// -----------------------------------------------------------------------------
// Lookup
// -----------------------------------------------------------------------------
export function getIdentity(id: string): Identity | undefined {
  return demoIdentities.find((i) => i.id === id);
}
