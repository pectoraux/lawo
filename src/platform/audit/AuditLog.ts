// =============================================================================
// AuditLog — Plane E platform primitive
// =============================================================================
// Append-only audit trail. AuditEvent is the FROZEN kernel primitive
// (see src/kernel/primitives/types.ts).
//
// Two implementations:
//   - createDbAuditLog()       -> persists to the Prisma AuditEvent table.
//   - createInMemoryAuditLog() -> pure in-memory store (for tests / preview).
//
// DURABLE FAILURE POLICY (security hardening):
//   Audit recording is split into two modes:
//
//   - record()  — DURABLE. For security-sensitive actions (auth, waitlist
//                 approval, set-password, privileged mutations). Throws on DB
//                 failure so the caller can abort the action. A failed audit
//                 write MUST NOT be silently represented as a durable success.
//
//   - recordBestEffort() — NON-DURABLE. For informational events (page views,
//                 decision.compute info). Returns a synthesized event on
//                 failure but flags it via `durable: false` so consumers can
//                 distinguish.
//
// Tenant scoping:
//   - recent(tenantId, limit)              — already tenant-scoped
//   - forSubjectInTenant(subjectId, tenantId, limit) — NEW: AND-scopes subject+tenant
//   - forSubject(subjectId, limit)        — platform-wide (admin only); see usage in /api/audit
// =============================================================================

import type { AuditEvent } from '@/kernel/primitives/types';
import { db } from '@/lib/db';

// -----------------------------------------------------------------------------
// AuditLog interface
// -----------------------------------------------------------------------------
export interface AuditLog {
  /** DURABLE record. Throws on DB failure. Use for security-sensitive actions. */
  record(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent>;
  /** BEST-EFFORT record. Returns a non-durable synthesized event on failure. */
  recordBestEffort(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent>;
  /** Events for a specific tenant. Pass null for GLOBAL (tenantId=null) events. */
  recent(tenantId: string | null, limit?: number): Promise<AuditEvent[]>;
  /** ALL events across all tenants (admin platform-wide read only). */
  recentAll(limit?: number): Promise<AuditEvent[]>;
  /** Platform-wide subject query (admin only). */
  forSubject(subjectId: string, limit?: number): Promise<AuditEvent[]>;
  /** Tenant-scoped subject query (enforces isolation). */
  forSubjectInTenant(subjectId: string, tenantId: string, limit?: number): Promise<AuditEvent[]>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function safeParsePayload(payloadJson: unknown): Record<string, unknown> {
  if (!payloadJson) return {};
  try {
    const parsed = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function fromRow(row: {
  id: string;
  tenantId: string | null;
  actor: string;
  action: string;
  subjectId: string | null;
  timestamp: Date;
  severity: string;
  payloadJson: unknown;
}): AuditEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    actor: row.actor,
    action: row.action,
    subjectId: row.subjectId ?? undefined,
    timestamp: row.timestamp.toISOString(),
    severity: (row.severity as AuditEvent['severity']) ?? 'INFO',
    payload: safeParsePayload(row.payloadJson),
  };
}

// -----------------------------------------------------------------------------
// DbAuditLog
// -----------------------------------------------------------------------------
class DbAuditLog implements AuditLog {
  async record(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
    const payloadJson = JSON.stringify(event.payload ?? {});
    const severity = event.severity ?? 'INFO';
    try {
      const row = await db.auditEvent.create({
        data: {
          tenantId: event.tenantId ?? null,
          actor: event.actor,
          action: event.action,
          subjectId: event.subjectId ?? null,
          severity,
          payloadJson,
        },
      });
      return fromRow(row);
    } catch (err) {
      // DURABLE mode: throw. The caller (a security-sensitive operation) must
      // decide whether to abort the action or retry. We do NOT silently return
      // a synthesized event.
      throw new AuditPersistenceError(
        `Audit persistence failed for action "${event.action}"`,
        err instanceof Error ? err : undefined,
      );
    }
  }

  async recordBestEffort(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
    const payloadJson = JSON.stringify(event.payload ?? {});
    const severity = event.severity ?? 'INFO';
    try {
      const row = await db.auditEvent.create({
        data: {
          tenantId: event.tenantId ?? null,
          actor: event.actor,
          action: event.action,
          subjectId: event.subjectId ?? null,
          severity,
          payloadJson,
        },
      });
      return fromRow(row);
    } catch (err) {
      // Non-durable: warn and return a synthesized event flagged as non-durable.
      console.warn('[AuditLog] best-effort record failed (non-durable):', err);
      const fallbackId = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const synthesized: AuditEvent = {
        id: fallbackId,
        tenantId: event.tenantId ?? null,
        actor: event.actor,
        action: event.action,
        subjectId: event.subjectId,
        timestamp: new Date().toISOString(),
        severity,
        payload: { ...event.payload, _durable: false, _fallback: true },
      };
      return synthesized;
    }
  }

  async recent(tenantId: string | null, limit: number = 50): Promise<AuditEvent[]> {
    try {
      const rows = await db.auditEvent.findMany({
        where: { tenantId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return rows.map(fromRow);
    } catch (err) {
      console.warn('[AuditLog] failed to read recent audit events:', err);
      return [];
    }
  }

  async recentAll(limit: number = 50): Promise<AuditEvent[]> {
    // No tenant filter — returns events from ALL tenants. Admin only.
    try {
      const rows = await db.auditEvent.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return rows.map(fromRow);
    } catch (err) {
      console.warn('[AuditLog] failed to read all audit events:', err);
      return [];
    }
  }

  async forSubject(subjectId: string, limit: number = 50): Promise<AuditEvent[]> {
    // Platform-wide query — admin only. See /api/audit route for authorization.
    try {
      const rows = await db.auditEvent.findMany({
        where: { subjectId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return rows.map(fromRow);
    } catch (err) {
      console.warn('[AuditLog] failed to read audit events for subject:', err);
      return [];
    }
  }

  async forSubjectInTenant(subjectId: string, tenantId: string, limit: number = 50): Promise<AuditEvent[]> {
    // Tenant-scoped query. AND-scope subject + tenant to enforce isolation.
    try {
      const rows = await db.auditEvent.findMany({
        where: { subjectId, tenantId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return rows.map(fromRow);
    } catch (err) {
      console.warn('[AuditLog] failed to read audit events for subject in tenant:', err);
      return [];
    }
  }
}

// -----------------------------------------------------------------------------
// InMemoryAuditLog
// -----------------------------------------------------------------------------
class InMemoryAuditLog implements AuditLog {
  private events: AuditEvent[] = [];

  async record(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
    // In-memory never fails — but the interface contract is the same.
    return this.recordBestEffort(event);
  }

  async recordBestEffort(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
    const id = `mem-${this.events.length + 1}-${Date.now().toString(36)}`;
    const stored: AuditEvent = {
      id,
      tenantId: event.tenantId ?? null,
      actor: event.actor,
      action: event.action,
      subjectId: event.subjectId,
      timestamp: new Date().toISOString(),
      severity: event.severity ?? 'INFO',
      payload: event.payload ?? {},
    };
    this.events.push(stored);
    return stored;
  }

  async recent(tenantId: string | null, limit: number = 50): Promise<AuditEvent[]> {
    const filtered = this.events.filter((e) => (e.tenantId ?? null) === (tenantId ?? null));
    return filtered.slice(-limit).reverse();
  }

  async recentAll(limit: number = 50): Promise<AuditEvent[]> {
    return this.events.slice(-limit).reverse();
  }

  async forSubject(subjectId: string, limit: number = 50): Promise<AuditEvent[]> {
    const filtered = this.events.filter((e) => e.subjectId === subjectId);
    return filtered.slice(-limit).reverse();
  }

  async forSubjectInTenant(subjectId: string, tenantId: string, limit: number = 50): Promise<AuditEvent[]> {
    const filtered = this.events.filter(
      (e) => e.subjectId === subjectId && (e.tenantId ?? null) === tenantId,
    );
    return filtered.slice(-limit).reverse();
  }
}

// -----------------------------------------------------------------------------
// Custom error for durable audit failures
// -----------------------------------------------------------------------------
export class AuditPersistenceError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AuditPersistenceError';
    this.cause = cause;
  }
}

// -----------------------------------------------------------------------------
// Factory functions
// -----------------------------------------------------------------------------
export function createDbAuditLog(): AuditLog {
  return new DbAuditLog();
}

export function createInMemoryAuditLog(): AuditLog {
  return new InMemoryAuditLog();
}
