/**
 * Audit helper — wraps the existing AuditLog with a sync-friendly signature
 * for use inside API routes. Records to the DB AuditEvent table; never throws.
 *
 * PAYLOAD SANITIZER (SEC-9): before persisting, `recordAudit` deep-clones the
 * payload and replaces any key whose name matches `/password|token|secret|hash|credential/i`
 * with the string `'[REDACTED]'`. This prevents accidental logging of secrets
 * even if a caller includes them in the payload. The sanitizer is conservative:
 * it redacts on name, not value — so a payload like `{ emailHash: '...' }` is
 * also redacted, which is the safer failure mode for an audit log.
 */
import { createDbAuditLog } from '@/platform/audit/AuditLog';

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
 * Deep-clone `value` and replace any sensitive key (see SENSITIVE_KEY_RE) with
 * `'[REDACTED]'`. Returns a structural copy so the caller's payload is never
 * mutated. Handles plain objects and arrays; primitives are returned as-is.
 */
function sanitizePayload<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizePayload(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? '[REDACTED]' : sanitizePayload(v);
  }
  return out as unknown as T;
}

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const auditLog = createDbAuditLog();
    await auditLog.record({
      tenantId: input.tenantId ?? null,
      actor: input.actor,
      action: input.action,
      subjectId: input.subjectId,
      severity: input.severity,
      payload: sanitizePayload(input.payload),
    });
  } catch (err) {
    // Audit failures must not break the request flow.
    console.warn('[audit] record failed:', err instanceof Error ? err.message : err);
  }
}

