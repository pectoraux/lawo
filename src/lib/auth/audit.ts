/**
 * Audit helper — wraps the existing AuditLog with a sync-friendly signature
 * for use inside API routes. Records to the DB AuditEvent table; never throws.
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

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const auditLog = createDbAuditLog();
    await auditLog.record({
      tenantId: input.tenantId ?? null,
      actor: input.actor,
      action: input.action,
      subjectId: input.subjectId,
      severity: input.severity,
      payload: input.payload,
    });
  } catch (err) {
    // Audit failures must not break the request flow.
    console.warn('[audit] record failed:', err instanceof Error ? err.message : err);
  }
}
