/**
 * Audit helper — wraps the AuditLog with a sync-friendly signature
 * for use inside API routes.
 *
 * DURABLE vs BEST-EFFORT:
 *   - recordAudit()          — DURABLE. Throws on DB failure. Use for
 *                               security-sensitive operations (waitlist approve,
 *                               set-password, signin success/failure, privileged
 *                               mutations). The caller should let the error
 *                               propagate (aborting the action) or catch it
 *                               and decide explicitly.
 *   - recordAuditBestEffort() — NON-DURABLE. Swallows failures with a warning.
 *                               Use for informational events (page views,
 *                               decision.compute info).
 */
import { createDbAuditLog, AuditPersistenceError } from '@/platform/audit/AuditLog';

export interface RecordAuditInput {
  tenantId?: string | null;
  actor: string;
  action: string;
  subjectId?: string;
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  payload: Record<string, unknown>;
}

const SENSITIVE_KEY_RE = /password|token|secret|hash|credential/i;

/**
 * Sanitize an audit payload — strips sensitive keys (password, token, secret,
 * hash, credential) by replacing their values with '[REDACTED]'. Recursively
 * sanitizes nested objects. Exported so route handlers can sanitize payloads
 * before writing audit events directly via a transaction-bound Prisma client
 * (which bypasses the recordAudit() helper that uses the global db client).
 */
export function sanitizeAuditPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeAuditPayload(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * DURABLE audit record. Throws AuditPersistenceError on DB failure.
 * Use for security-sensitive operations where the audit trail MUST persist
 * or the action should not be considered complete.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const auditLog = createDbAuditLog();
  const sanitizedPayload = sanitizeAuditPayload(input.payload);
  await auditLog.record({
    tenantId: input.tenantId ?? null,
    actor: input.actor,
    action: input.action,
    subjectId: input.subjectId,
    severity: input.severity,
    payload: sanitizedPayload,
  });
}

/**
 * BEST-EFFORT audit record. Never throws — on DB failure, logs a warning and
 * returns a synthesized non-durable event. Use for informational events only.
 */
export async function recordAuditBestEffort(input: RecordAuditInput): Promise<void> {
  try {
    const auditLog = createDbAuditLog();
    const sanitizedPayload = sanitizeAuditPayload(input.payload);
    await auditLog.recordBestEffort({
      tenantId: input.tenantId ?? null,
      actor: input.actor,
      action: input.action,
      subjectId: input.subjectId,
      severity: input.severity,
      payload: sanitizedPayload,
    });
  } catch (err) {
    // recordBestEffort already handles failures internally; this catch is a
    // belt-and-suspenders for any unexpected throw.
    console.warn('[audit] best-effort record failed:', err instanceof Error ? err.message : err);
  }
}

export { AuditPersistenceError };
