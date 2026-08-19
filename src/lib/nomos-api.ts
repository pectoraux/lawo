/**
 * Nomos — API client (Experience Plane → Intelligence/Knowledge/Foundation).
 *
 * All requests use RELATIVE URLs only (per project gateway rule). Every call
 * returns typed responses mirroring the kernel primitives
 * (`@/kernel/primitives/types`). Errors are thrown so the caller can wrap
 * them in try/catch and surface a toast.
 */
'use client';

import type {
  AuditEvent,
  ContextBundle,
  ContextRequest,
  Fact,
  Jurisdiction,
  JurisdictionEdge,
  Authority,
  Source,
  Procedure,
  Action,
  Provenance,
  RuleEvaluationResult,
  Rule,
  Situation,
  StateSnapshot,
  TruthLevel,
  PackageManifest,
} from '@/kernel/primitives/types';

// ============================================================================
// Response types — mirror what the route handlers emit
// ============================================================================
export interface OrientResponse {
  situations: Situation[];
  packages: PackageManifest[];
  jurisdictions: Jurisdiction[];
  jurisdictionEdges: JurisdictionEdge[];
  authorities: Authority[];
  sources: Source[];
  rules: Array<{
    id: string;
    code: string;
    title: string;
    type: string;
    truthLevel: TruthLevel;
    jurisdictionId: string;
    authorityId: string;
    sourceId: string;
    packageId: string;
    temporal: Rule['temporal'];
  }>;
  actions: Action[];
  procedures: Procedure[];
  planes: { id: string; label: string; description: string }[];
  ruleTypes: { code: string; label: string; description: string }[];
  truthLevels: { code: TruthLevel; label: string; description: string }[];
  identities: Array<{ id: string; role: string; tenantId: string | null; label: string }>;
}

export interface DemoPresetFact {
  id: string;
  attribute: string;
  value: unknown;
  truthLevel: TruthLevel;
  observedAt: string;
}

export interface DemoPreset {
  id: string;
  label: string;
  description: string;
  situationId: string;
  jurisdictionIds: string[];
  asOf: string;
  objective?: string;
  facts: DemoPresetFact[];
}

export interface PackagesResponse {
  packages: Array<{
    manifest: PackageManifest;
    counts: {
      rules: number;
      situations: number;
      procedures: number;
      actions: number;
      jurisdictions: number;
      authorities: number;
      sources: number;
    };
    rules: Array<{ id: string; code: string; title: string; type: string; truthLevel: TruthLevel; jurisdictionId: string }>;
    situations: Array<{ id: string; code: string; label: string; description: string }>;
    actions: Array<{ id: string; code: string; label: string; kind: string }>;
    jurisdictions: Array<{ id: string; code: string; name: string; kind: string }>;
  }>;
}

export interface JurisdictionsResponse {
  jurisdictions: Jurisdiction[];
  edges: JurisdictionEdge[];
  byKind: Record<string, Jurisdiction[]>;
  adjacency: Record<
    string,
    { parents: string[]; children: string[]; edges: { relation: string; otherId: string }[] }
  >;
  authorities: Authority[];
  sources: Source[];
  relationTypes: string[];
}

export interface AuditResponse {
  events: AuditEvent[];
  count: number;
  fallback?: boolean;
}

export interface EvaluateResponse {
  asOf: string;
  requestedJurisdictionIds: string[];
  resolvedJurisdictions: Jurisdiction[];
  evaluatedRuleCount: number;
  evaluations: RuleEvaluationResult[];
}

export interface StateResponse {
  state: StateSnapshot;
  provenance: Provenance[];
  audit: AuditEvent[];
}

export interface DecisionsResponse {
  decisions: Array<{
    id: string;
    decisionId: string;
    subjectId: string;
    situationId: string | null;
    asOf: string;
    computedAt: string;
    truthLevel: string;
    state: StateSnapshot;
    provenance: Provenance[];
  }>;
  count: number;
}

// ============================================================================
// Client functions
// ============================================================================
async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} on ${url}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export function getOrient(): Promise<OrientResponse> {
  return jsonFetch<OrientResponse>('/api/orient');
}

export function postState(body: ContextRequest & { persist?: boolean }): Promise<StateResponse> {
  return jsonFetch<StateResponse>('/api/state', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function postEvaluate(
  body: {
    facts: Fact[];
    jurisdictionIds: string[];
    asOf: string;
    situationId?: string;
    packageId?: string;
  },
): Promise<EvaluateResponse> {
  return jsonFetch<EvaluateResponse>('/api/evaluate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function postContext(body: ContextRequest): Promise<ContextBundle> {
  return jsonFetch<ContextBundle>('/api/context', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getPackages(): Promise<PackagesResponse> {
  return jsonFetch<PackagesResponse>('/api/packages');
}

export function getJurisdictions(): Promise<JurisdictionsResponse> {
  return jsonFetch<JurisdictionsResponse>('/api/jurisdictions');
}

export function getAudit(limit = 50): Promise<AuditResponse> {
  return jsonFetch<AuditResponse>(`/api/audit?limit=${limit}`);
}

export function getDecisions(subjectId?: string, limit = 20): Promise<DecisionsResponse> {
  const q = new URLSearchParams();
  if (subjectId) q.set('subjectId', subjectId);
  q.set('limit', String(limit));
  return jsonFetch<DecisionsResponse>(`/api/decisions?${q.toString()}`);
}

export function saveDecision(body: {
  decisionId: string;
  subjectId: string;
  situationId?: string;
  state: StateSnapshot;
  provenance: Provenance[];
  asOf: string;
  truthLevel: string;
  tenantId?: string | null;
}): Promise<{ saved: boolean; id: string }> {
  return jsonFetch('/api/decisions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getDemoPresets(): Promise<{ presets: DemoPreset[] }> {
  return jsonFetch<{ presets: DemoPreset[] }>('/api/demo-presets');
}
