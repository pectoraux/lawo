// =============================================================================
// TenantContext — Plane E platform primitive
// =============================================================================
// Establishes the request-scoped tenant context. Implements invariant I9:
// private tenant data cannot enter global knowledge without explicit
// authorization. The access-control helpers below encode the read/write rules
// for the GLOBAL / TENANT / USER scope hierarchy.
//
// This module is intentionally tiny and dependency-free: it only describes
// the *current* tenant context. Persistence is handled elsewhere.
// =============================================================================

export type TenantKind =
  | 'INDIVIDUAL'
  | 'HOUSEHOLD'
  | 'SMALL_BUSINESS'
  | 'ENTERPRISE'
  | 'PROFESSIONAL_ORG'
  | 'GOVERNMENT'
  | 'EMBEDDED';

export interface TenantContext {
  /** null = GLOBAL (public knowledge) */
  tenantId: string | null;
  /** null when the context is GLOBAL */
  tenantKind: TenantKind | null;
  /** 'GLOBAL' = public knowledge; 'TENANT' = scoped to a tenant; 'USER' = scoped to one user inside a tenant */
  knowledgeScope: 'GLOBAL' | 'TENANT' | 'USER';
  /** populated only for USER-scope contexts */
  userId?: string | null;
}

/**
 * A GLOBAL context can read public knowledge only and can never write.
 */
export function globalContext(): TenantContext {
  return {
    tenantId: null,
    tenantKind: null,
    knowledgeScope: 'GLOBAL',
    userId: null,
  };
}

/**
 * A TENANT context can read GLOBAL + its own TENANT data, and can write to its
 * own TENANT data. Pass a `userId` to upgrade to a USER-scoped context (which
 * additionally gains its own USER-scoped read/write).
 */
export function tenantContext(
  tenantId: string,
  kind: TenantKind,
  userId?: string | null,
): TenantContext {
  if (userId) {
    return {
      tenantId,
      tenantKind: kind,
      knowledgeScope: 'USER',
      userId,
    };
  }
  return {
    tenantId,
    tenantKind: kind,
    knowledgeScope: 'TENANT',
    userId: null,
  };
}

/** True if the context is GLOBAL (no tenant attached). */
export function isGlobal(ctx: TenantContext): boolean {
  return ctx.knowledgeScope === 'GLOBAL' && ctx.tenantId === null;
}

/**
 * Read-access predicate (I9).
 *
 * Rules:
 * - GLOBAL context can read GLOBAL only.
 * - TENANT context can read GLOBAL + its own TENANT data.
 * - USER   context can read GLOBAL + its own TENANT + its own USER data.
 */
export function assertCanRead(
  ctx: TenantContext,
  scope: 'GLOBAL' | 'TENANT' | 'USER',
  ownerTenantId: string | null,
): boolean {
  if (scope === 'GLOBAL') {
    // Public knowledge is readable by any context.
    return true;
  }

  if (scope === 'TENANT') {
    // Tenant-scoped data: only readable by the same tenant (via TENANT or USER context).
    if (ctx.knowledgeScope === 'GLOBAL') return false;
    return ctx.tenantId !== null && ctx.tenantId === ownerTenantId;
  }

  // scope === 'USER'
  // USER-scoped data is the most restrictive: only the same user (within the same tenant) can read it.
  if (ctx.knowledgeScope !== 'USER') return false;
  return (
    ctx.tenantId !== null &&
    ctx.tenantId === ownerTenantId &&
    ctx.userId != null
  );
}

/**
 * Write-access predicate (I9).
 *
 * Rules:
 * - GLOBAL can NEVER write.
 * - TENANT context can write to its own TENANT data.
 * - USER   context can write to its own USER data (not tenant-wide data — those go through a tenant-scoped context).
 */
export function assertCanWrite(
  ctx: TenantContext,
  scope: 'TENANT' | 'USER',
  ownerTenantId: string | null,
  ownerUserId?: string | null,
): boolean {
  if (ctx.knowledgeScope === 'GLOBAL') {
    return false;
  }
  if (ctx.tenantId === null) return false;

  if (scope === 'TENANT') {
    // Only TENANT-scoped contexts (not USER) may write tenant-wide data.
    return ctx.knowledgeScope === 'TENANT' && ctx.tenantId === ownerTenantId;
  }

  // scope === 'USER'
  // Must be a USER context, same tenant, same user.
  if (ctx.knowledgeScope !== 'USER') return false;
  if (ctx.tenantId !== ownerTenantId) return false;
  if (ctx.userId == null) return false;
  return ownerUserId == null || ownerUserId === ctx.userId;
}
