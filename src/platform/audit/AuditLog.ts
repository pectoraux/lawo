// =============================================================================
// AuditLog — Plane E platform primitive
// =============================================================================
// Append-only audit trail. AuditEvent is the FROZEN kernel primitive
// (see src/kernel/primitives/types.ts). This module provides two implementations
// of the same AuditLog interface:
//
//   - createDbAuditLog()     -> persists to the Prisma AuditEvent table.
//   - createInMemoryAuditLog() -> pure in-memory store (for tests / preview).
//
// The DB implementation is fault-tolerant: if the database is unavailable, it
// logs a console.warn and degrades gracefully. Audit recording MUST NEVER
// throw, because it is called from inside other operations that should not be
// aborted by an audit failure.
// =============================================================================

import type { AuditEvent } from '@/kernel/primitives/types';
import { db } from '@/lib/db';

// -----------------------------------------------------------------------------
// AuditLog interface
// -----------------------------------------------------------------------------
export interface AuditLog {
  record(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent>;
  recent(tenantId: string | null, limit?: number): Promise<AuditEvent[]>;
  forSubject(subjectId: string, limit?: number): Promise<AuditEvent[]>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Parse the JSON payload string safely. Returns an empty object on failure
 * so the AuditEvent payload is always a record, never null/undefined.
 */
function safeParsePayload(payloadJson: string | null | undefined): Record<string, unknown> {
  if (!payloadJson) return {};
  try {
    const parsed = JSON.parse(payloadJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Map a Prisma AuditEvent row to the frozen AuditEvent primitive.
 */
function fromRow(row: {
  id: string;
  tenantId: string | null;
  actor: string;
  action: string;
  subjectId: string | null;
  timestamp: Date;
  severity: string;
  payloadJson: string;
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
          // timestamp defaults to now() in the schema
        },
      });
      return fromRow(row);
    } catch (err) {
      // Never throw from audit recording.
      console.warn('[AuditLog] failed to persist audit event:', err);
      // Return a synthesized event so callers still see something.
      const fallbackId = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      return {
        id: fallbackId,
        tenantId: event.tenantId ?? null,
        actor: event.actor,
        action: event.action,
        subjectId: event.subjectId,
        timestamp: new Date().toISOString(),
        severity,
        payload: event.payload ?? {},
      };
    }
  }

  async recent(tenantId: string | null, limit: number = 50): Promise<AuditEvent[]> {
    try {
      if (tenantId === null) {
        const rows = await db.auditEvent.findMany({
          where: { tenantId: null },
          orderBy: { timestamp: 'desc' },
          take: limit,
        });
        return rows.map(fromRow);
      }
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

  async forSubject(subjectId: string, limit: number = 50): Promise<AuditEvent[]> {
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
}

// -----------------------------------------------------------------------------
// InMemoryAuditLog
// -----------------------------------------------------------------------------
class InMemoryAuditLog implements AuditLog {
  private events: AuditEvent[] = [];

  async record(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
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

  async forSubject(subjectId: string, limit: number = 50): Promise<AuditEvent[]> {
    const filtered = this.events.filter((e) => e.subjectId === subjectId);
    return filtered.slice(-limit).reverse();
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
