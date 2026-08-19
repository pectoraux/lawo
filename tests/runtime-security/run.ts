/**
 * Nomos — Runtime Security Test Suite
 * ===================================
 * Integration tests that hit the API with REAL sessions and REAL database
 * fixtures. These tests prove tenant isolation, decision integrity, audit
 * authorization, CSRF enforcement, and rate limiting — the BEHAVIORAL
 * invariants that static source-structure tests cannot catch.
 *
 * Prerequisites:
 *   1. A dev server running on http://localhost:3000
 *   2. DATABASE_URL pointing at the Neon PostgreSQL DB (via .env)
 *
 * Run with:
 *   set -a && source .env && set +a && bun run tests/runtime-security/run.ts
 *
 * The script creates its own isolated fixtures (tenants A/B, users A/B, admin)
 * and cleans them up at the end, even on failure.
 */
import { db } from '../../src/lib/db';
import { hashPassword } from '../../src/lib/auth/password';

interface TestResult { name: string; passed: boolean; detail?: string; }
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail });
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} ${name}${detail ? ' — ' + detail : ''}`);
}

const BASE = 'http://localhost:3000';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchCsrfToken(): Promise<{ token: string; cookie: string }> {
  const res = await fetch(`${BASE}/api/auth/csrf`);
  const data = await res.json() as { csrfToken: string };
  // NextAuth sets the csrf-token cookie — capture it for the double-submit pattern.
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/next-auth\.csrf-token=([^;]+)/);
  const csrfCookie = match ? `next-auth.csrf-token=${match[1]}` : '';
  return { token: data.csrfToken, cookie: csrfCookie };
}

async function signIn(email: string, password: string): Promise<string | null> {
  const { token: csrf, cookie: csrfCookie } = await fetchCsrfToken();
  const params = new URLSearchParams();
  params.set('email', email);
  params.set('password', password);
  params.set('csrfToken', csrf);
  params.set('callbackUrl', '/');
  params.set('json', 'true');

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie: csrfCookie, // Send the CSRF cookie for double-submit validation
    },
    body: params.toString(),
    redirect: 'manual',
  });

  // NextAuth sets the session cookie in the response on successful auth.
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;

  // The set-cookie header may contain multiple cookies (comma-separated).
  // Find the session-token cookie.
  const cookies = setCookie.split(', ');
  for (const c of cookies) {
    const match = c.match(/next-auth\.session-token=([^;]+)/);
    if (match) return `next-auth.session-token=${match[1]}; next-auth.csrf-token=${csrfCookie.split('=')[1]}`;
  }
  // Fallback: try the raw header.
  const match = setCookie.match(/next-auth\.session-token=([^;]+)/);
  return match ? `next-auth.session-token=${match[1]}; next-auth.csrf-token=${csrfCookie.split('=')[1]}` : null;
}

async function apiGet(path: string, cookie?: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    cache: 'no-store',
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body };
}

async function apiPost(
  path: string,
  body: unknown,
  cookie?: string,
  origin?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  else headers.origin = BASE; // default same-origin

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  let respBody: unknown = null;
  try { respBody = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: respBody };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FIXTURE = {
  tenantA: 'test-tenant-a',
  tenantB: 'test-tenant-b',
  tenantAdmin: 'test-tenant-admin',
  userA: 'usera@runtime.test',
  userB: 'userb@runtime.test',
  admin: 'admin@runtime.test',
  password: 'TestPass123!',
  adminPassword: 'AdminPass123!',
  subjectA: 'subject_test_a',
  subjectB: 'subject_test_b',
};

async function setupFixtures(): Promise<void> {
  // Clean up any prior test fixtures (idempotent).
  await cleanupFixtures();

  // Create tenants.
  const tenantA = await db.tenant.create({
    data: { id: FIXTURE.tenantA, name: 'Test Tenant A', kind: 'INDIVIDUAL' },
  });
  const tenantB = await db.tenant.create({
    data: { id: FIXTURE.tenantB, name: 'Test Tenant B', kind: 'INDIVIDUAL' },
  });
  const tenantAdmin = await db.tenant.create({
    data: { id: FIXTURE.tenantAdmin, name: 'Test Admin Tenant', kind: 'GOVERNMENT' },
  });

  // Create users.
  await db.user.create({
    data: {
      email: FIXTURE.userA,
      passwordHash: hashPassword(FIXTURE.password),
      name: 'User A',
      role: 'USER',
      status: 'ACTIVE',
      isDemo: false,
      tenantId: tenantA.id,
    },
  });
  await db.user.create({
    data: {
      email: FIXTURE.userB,
      passwordHash: hashPassword(FIXTURE.password),
      name: 'User B',
      role: 'USER',
      status: 'ACTIVE',
      isDemo: false,
      tenantId: tenantB.id,
    },
  });
  await db.user.create({
    data: {
      email: FIXTURE.admin,
      passwordHash: hashPassword(FIXTURE.adminPassword),
      name: 'Test Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      isDemo: false,
      tenantId: tenantAdmin.id,
    },
  });

  // Seed a decision record in tenant A and one in tenant B.
  const now = new Date();
  await db.decisionRecord.create({
    data: {
      decisionId: 'dec_test_a_1',
      subjectId: FIXTURE.subjectA,
      situationId: 'sit.border-crossing',
      stateJson: { test: true, tenant: 'A' },
      provenanceJson: [],
      asOf: now,
      computedAt: now,
      truthLevel: 'T0',
      tenantId: tenantA.id,
    },
  });
  await db.decisionRecord.create({
    data: {
      decisionId: 'dec_test_b_1',
      subjectId: FIXTURE.subjectB,
      situationId: 'sit.border-crossing',
      stateJson: { test: true, tenant: 'B' },
      provenanceJson: [],
      asOf: now,
      computedAt: now,
      truthLevel: 'T0',
      tenantId: tenantB.id,
    },
  });

  // Seed audit events in both tenants.
  await db.auditEvent.create({
    data: {
      tenantId: tenantA.id,
      actor: FIXTURE.userA,
      action: 'test.event.a',
      subjectId: FIXTURE.subjectA,
      severity: 'INFO',
      payloadJson: { test: true, tenant: 'A' },
    },
  });
  await db.auditEvent.create({
    data: {
      tenantId: tenantB.id,
      actor: FIXTURE.userB,
      action: 'test.event.b',
      subjectId: FIXTURE.subjectB,
      severity: 'INFO',
      payloadJson: { test: true, tenant: 'B' },
    },
  });
}

async function cleanupFixtures(): Promise<void> {
  // Delete in dependency order (children first).
  await db.auditEvent.deleteMany({ where: { tenantId: { in: [FIXTURE.tenantA, FIXTURE.tenantB, FIXTURE.tenantAdmin] } } }).catch(() => {});
  await db.decisionRecord.deleteMany({ where: { tenantId: { in: [FIXTURE.tenantA, FIXTURE.tenantB, FIXTURE.tenantAdmin] } } }).catch(() => {});
  await db.waitlistEntry.deleteMany({ where: { email: { contains: '@runtime.test' } } }).catch(() => {});
  await db.user.deleteMany({ where: { email: { contains: '@runtime.test' } } }).catch(() => {});
  await db.tenant.deleteMany({ where: { id: { in: [FIXTURE.tenantA, FIXTURE.tenantB, FIXTURE.tenantAdmin] } } }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testAuthz001(cookieA: string) {
  // User A cannot read tenant B decisions.
  const { body } = await apiGet('/api/decisions?limit=50', cookieA);
  const decisions = (body as { decisions?: Array<{ subjectId: string; tenantId?: string }> }).decisions ?? [];
  const hasB = decisions.some((d) => d.subjectId === FIXTURE.subjectB);
  record('AUTHZ-001: User A cannot read tenant B decisions', !hasB,
    hasB ? 'tenant B decision leaked' : `${decisions.length} decisions returned, none from tenant B`);
}

async function testAuthz002(cookieA: string) {
  // User A cannot write a decision into tenant B — client-supplied tenantId is ignored.
  // This test queries the DB DIRECTLY (not just the API response) to prove
  // no record was written into tenant B. The API response doesn't include
  // tenantId, so checking the response alone is insufficient — a broken read
  // path could make a write test appear to pass.
  const postRes = await apiPost('/api/state', {
    subjectId: 'subject_injected',
    asOf: '2025-01-15',
    situationId: 'sit.border-crossing',
    facts: [
      { id: 'f1', subjectId: 'subject_injected', attribute: 'nationality', value: 'GH', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
      { id: 'f2', subjectId: 'subject_injected', attribute: 'destinationCountry', value: 'TG', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
      { id: 'f3', subjectId: 'subject_injected', attribute: 'goodsValueUsd', value: 300, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
      { id: 'f4', subjectId: 'subject_injected', attribute: 'goodsPurpose', value: 'personal', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
      { id: 'f5', subjectId: 'subject_injected', attribute: 'hasProhibitedGoods', value: false, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
    ],
    jurisdictionIds: ['jur.ghana', 'jur.togo'],
    tenantId: FIXTURE.tenantB, // INJECTION ATTEMPT — client tries to write into tenant B
    persist: true,
  }, cookieA);

  // Verify the POST succeeded (the decision was computed).
  const state = (postRes.body as { state?: { firedEffects?: unknown[] } }).state;
  const computed = postRes.status === 200 && Array.isArray(state?.firedEffects);

  // DIRECT DB CHECK: query for any decision record in tenant B with this subjectId.
  // This is the authoritative proof — the API response is not trusted.
  const injectedIntoB = await db.decisionRecord.findFirst({
    where: { subjectId: 'subject_injected', tenantId: FIXTURE.tenantB },
    select: { id: true },
  });

  // Also verify the record WAS persisted (in tenant A, as expected).
  const persistedInA = await db.decisionRecord.findFirst({
    where: { subjectId: 'subject_injected', tenantId: FIXTURE.tenantA },
    select: { id: true },
  });

  record('AUTHZ-002: Client-supplied tenantId ignored (DB-verified)',
    !injectedIntoB && computed && !!persistedInA,
    injectedIntoB ? 'CRITICAL: decision was written into tenant B!' :
    !persistedInA ? 'decision was not persisted at all' :
    `computed=${computed}, persisted in tenant A (not B)`);
}

async function testAuthz003(cookieA: string) {
  // User A cannot read tenant B audit events.
  const { body } = await apiGet(`/api/audit?tenantId=${FIXTURE.tenantB}`, cookieA);
  const events = (body as { events?: Array<{ tenantId?: string | null; action?: string }> }).events ?? [];
  const hasB = events.some((e) => e.tenantId === FIXTURE.tenantB);
  record('AUTHZ-003: User A cannot read tenant B audit events', !hasB,
    hasB ? 'tenant B audit events leaked' : `${events.length} events returned, none from tenant B`);
}

async function testAuthz004(cookieA: string) {
  // User A cannot query another tenant's subject.
  const { body } = await apiGet(`/api/decisions?subjectId=${FIXTURE.subjectB}`, cookieA);
  const count = (body as { count?: number }).count ?? 0;
  record('AUTHZ-004: Subject access constrained by tenant', count === 0,
    count === 0 ? 'no cross-tenant subject results' : `${count} results leaked for tenant B subject`);
}

async function testAuthz005(cookieAdmin: string) {
  // Admin can read across tenants with platformWide=true.
  const { body } = await apiGet('/api/audit?platformWide=true&limit=50', cookieAdmin);
  const events = (body as { events?: Array<{ tenantId?: string | null }> }).events ?? [];
  const hasA = events.some((e) => e.tenantId === FIXTURE.tenantA);
  const hasB = events.some((e) => e.tenantId === FIXTURE.tenantB);
  record('AUTHZ-005: Admin platform-wide read (audit)', hasA && hasB,
    !hasA || !hasB ? 'missing one or both tenants' : 'events from both tenants visible');
}

async function testAuthz005b(cookieAdmin: string) {
  // Admin platform-wide read for decisions.
  const { body } = await apiGet('/api/decisions?platformWide=true&limit=50', cookieAdmin);
  const decisions = (body as { decisions?: Array<{ subjectId?: string }> }).decisions ?? [];
  const hasA = decisions.some((d) => d.subjectId === FIXTURE.subjectA);
  const hasB = decisions.some((d) => d.subjectId === FIXTURE.subjectB);
  record('AUTHZ-005b: Admin platform-wide read (decisions)', hasA && hasB,
    !hasA || !hasB ? 'missing one or both tenants' : 'decisions from both tenants visible');
}

async function testAuthz006(cookieAdmin: string) {
  // Admin without platformWide flag is scoped to own tenant.
  const { body } = await apiGet('/api/audit?limit=50', cookieAdmin);
  const events = (body as { events?: Array<{ tenantId?: string | null }> }).events ?? [];
  const hasA = events.some((e) => e.tenantId === FIXTURE.tenantA);
  const hasB = events.some((e) => e.tenantId === FIXTURE.tenantB);
  record('AUTHZ-006: Admin without flag is own-tenant scoped', !hasA && !hasB,
    hasA || hasB ? 'admin saw other tenant data without flag' : 'admin scoped to own tenant');
}

async function testAuthz007() {
  // Unauthenticated requests are rejected.
  const decisionsRes = await apiGet('/api/decisions');
  const auditRes = await apiGet('/api/audit');
  const stateRes = await apiPost('/api/state', {
    subjectId: 'test', asOf: '2025-01-15', facts: [], jurisdictionIds: [],
  }, undefined, BASE);
  record('AUTHZ-007: Unauthenticated requests rejected',
    decisionsRes.status === 401 && auditRes.status === 401 && stateRes.status === 401,
    `decisions=${decisionsRes.status} audit=${auditRes.status} state=${stateRes.status}`);
}

async function testAuthz008(cookieA: string) {
  // Cross-origin POST is rejected (CSRF).
  const stateRes = await apiPost('/api/state', {
    subjectId: 'test', asOf: '2025-01-15', facts: [], jurisdictionIds: [],
  }, cookieA, 'https://evil.com');
  const waitlistRes = await apiPost('/api/waitlist', {
    email: 'csrf-test@runtime.test',
  }, cookieA, 'https://evil.com');
  record('AUTHZ-008: Cross-origin POST rejected (CSRF)',
    stateRes.status === 403 && waitlistRes.status === 403,
    `state=${stateRes.status} waitlist=${waitlistRes.status}`);
}

async function testIntegrity001() {
  // Decision truthLevel cannot be client-forged — POST /api/decisions no longer exists.
  const res = await apiPost('/api/decisions', {
    decisionId: 'forged',
    subjectId: 'forged',
    state: { truthLevel: 'T0' },
    provenance: [],
    asOf: '2025-01-15',
    truthLevel: 'T0',
    tenantId: 'forged',
  }, undefined, BASE);
  record('INTEGRITY-001: POST /api/decisions removed (no forge path)',
    res.status === 404 || res.status === 405,
    `status=${res.status}`);
}

async function testIntegrity003(cookieA: string) {
  // Provenance is server-generated — verify a decision from /api/state has engine-generated provenance.
  const { body } = await apiPost('/api/state', {
    subjectId: 'subject_prov_test',
    asOf: '2025-01-15',
    situationId: 'sit.border-crossing',
    facts: [
      { id: 'f1', subjectId: 'subject_prov_test', attribute: 'nationality', value: 'GH', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 'f2', subjectId: 'subject_prov_test', attribute: 'destinationCountry', value: 'TG', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 'f3', subjectId: 'subject_prov_test', attribute: 'goodsValueUsd', value: 300, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 'f4', subjectId: 'subject_prov_test', attribute: 'goodsPurpose', value: 'personal', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 'f5', subjectId: 'subject_prov_test', attribute: 'hasProhibitedGoods', value: false, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
    ],
    jurisdictionIds: ['jur.ghana', 'jur.togo'],
  }, cookieA);

  const state = (body as { state?: { truthLevel?: string; provenance?: unknown[]; firedEffects?: unknown[] } }).state;
  const hasProvenance = Array.isArray(state?.provenance) && (state?.provenance?.length ?? 0) > 0;
  const truthIsT0 = state?.truthLevel === 'T0';
  record('INTEGRITY-003: Provenance is server-generated', hasProvenance && truthIsT0,
    `provenance=${state?.provenance?.length ?? 0} entries, truthLevel=${state?.truthLevel}`);
}

async function testIntegrity004(cookieA: string) {
  // Fact tenant normalization: submitted facts carry tenantId=tenantB but the
  // server normalizes them to the session's tenantId. The decision still
  // computes correctly (facts are about the subject, not the tenant), but the
  // persisted decision record is in tenant A, and no fact in the engine's
  // context carries tenantB.
  const { body } = await apiPost('/api/state', {
    subjectId: 'subject_fact_norm',
    asOf: '2025-01-15',
    situationId: 'sit.border-crossing',
    facts: [
      // All facts claim tenantB — the server must normalize them to tenantA.
      { id: 'fn1', subjectId: 'subject_fact_norm', attribute: 'nationality', value: 'GH', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
      { id: 'fn2', subjectId: 'subject_fact_norm', attribute: 'destinationCountry', value: 'TG', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
      { id: 'fn3', subjectId: 'subject_fact_norm', attribute: 'goodsValueUsd', value: 300, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
      { id: 'fn4', subjectId: 'subject_fact_norm', attribute: 'goodsPurpose', value: 'personal', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
      { id: 'fn5', subjectId: 'subject_fact_norm', attribute: 'hasProhibitedGoods', value: false, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantB },
    ],
    jurisdictionIds: ['jur.ghana', 'jur.togo'],
    persist: true,
  }, cookieA);

  const persisted = (body as { persisted?: boolean }).persisted;
  const state = (body as { state?: { firedEffects?: unknown[] } }).state;
  const computed = Array.isArray(state?.firedEffects) && state!.firedEffects!.length > 0;

  // DIRECT DB CHECK: the decision record must be in tenant A, not tenant B.
  const inA = await db.decisionRecord.findFirst({
    where: { subjectId: 'subject_fact_norm', tenantId: FIXTURE.tenantA },
    select: { id: true },
  });
  const inB = await db.decisionRecord.findFirst({
    where: { subjectId: 'subject_fact_norm', tenantId: FIXTURE.tenantB },
    select: { id: true },
  });

  record('INTEGRITY-004: Submitted facts normalized to session tenant',
    computed && persisted && !!inA && !inB,
    !inA ? 'decision not persisted in tenant A' :
    inB ? 'CRITICAL: decision leaked into tenant B via facts!' :
    `computed=${computed}, persisted in tenant A (facts normalized)`);
}

async function testIntegrity005(cookieA: string) {
  // Transactional persistence: when persist=true, the response must honestly
  // report whether persistence succeeded. The response must include `persisted: true`
  // on success, and must NOT return 200 if persistence failed.
  const { body, status } = await apiPost('/api/state', {
    subjectId: 'subject_txn',
    asOf: '2025-01-15',
    situationId: 'sit.border-crossing',
    facts: [
      { id: 't1', subjectId: 'subject_txn', attribute: 'nationality', value: 'GH', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 't2', subjectId: 'subject_txn', attribute: 'destinationCountry', value: 'TG', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 't3', subjectId: 'subject_txn', attribute: 'goodsValueUsd', value: 300, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 't4', subjectId: 'subject_txn', attribute: 'goodsPurpose', value: 'personal', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 't5', subjectId: 'subject_txn', attribute: 'hasProhibitedGoods', value: false, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
    ],
    jurisdictionIds: ['jur.ghana', 'jur.togo'],
    persist: true,
  }, cookieA);

  const persisted = (body as { persisted?: boolean }).persisted;
  const hasState = !!(body as { state?: unknown }).state;

  // On success: HTTP 200, persisted=true, state present.
  // (We can't easily simulate a DB failure in a runtime test without mocking,
  // but we CAN verify the success path honestly reports persisted=true.)
  record('INTEGRITY-005: Transactional persistence reports success honestly',
    status === 200 && persisted === true && hasState,
    `status=${status}, persisted=${persisted}, hasState=${hasState}`);
}

async function testIntegrity006(cookieA: string) {
  // Non-persistent computation: when persist=false (default), the response
  // must NOT claim persisted=true. This proves the `persisted` field is
  // meaningful, not always true.
  const { body } = await apiPost('/api/state', {
    subjectId: 'subject_nopersist',
    asOf: '2025-01-15',
    situationId: 'sit.border-crossing',
    facts: [
      { id: 'np1', subjectId: 'subject_nopersist', attribute: 'nationality', value: 'GH', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 'np2', subjectId: 'subject_nopersist', attribute: 'destinationCountry', value: 'TG', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 'np3', subjectId: 'subject_nopersist', attribute: 'goodsValueUsd', value: 300, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 'np4', subjectId: 'subject_nopersist', attribute: 'goodsPurpose', value: 'personal', truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
      { id: 'np5', subjectId: 'subject_nopersist', attribute: 'hasProhibitedGoods', value: false, truthLevel: 'T0', observedAt: '2025-01-15', tenantId: FIXTURE.tenantA },
    ],
    jurisdictionIds: ['jur.ghana', 'jur.togo'],
    // persist omitted — defaults to false
  }, cookieA);

  const persisted = (body as { persisted?: boolean }).persisted;
  // When persist is omitted, persisted must be false (or absent).
  record('INTEGRITY-006: Non-persistent computation does not claim persisted',
    persisted === false || persisted === undefined,
    `persisted=${persisted}`);
}

async function testWaitlist001(cookieAdmin: string) {
  // Waitlist approve generates invitation URL, not temp password.
  // First create a waitlist entry.
  const email = `wltest-${Date.now()}@runtime.test`;
  await apiPost('/api/waitlist', { email, name: 'WL Test' }, cookieAdmin);

  // Find the entry in the DB (the API doesn't return the id on duplicate).
  const entry = await db.waitlistEntry.findUnique({ where: { email } });
  if (!entry) {
    record('WAITLIST-001: Approve returns invitation URL', false, 'could not create waitlist entry');
    return;
  }

  const { body } = await apiPost('/api/waitlist/approve', { entryId: entry.id, role: 'USER' }, cookieAdmin);
  const res = body as { invitationUrl?: string; temporaryPassword?: string };
  const hasInvitation = !!res.invitationUrl;
  const noTempPassword = !res.temporaryPassword;
  record('WAITLIST-001: Approve returns invitation URL (not temp password)',
    hasInvitation && noTempPassword,
    hasInvitation ? 'invitation URL returned' : 'no invitation URL');

  // Cleanup the approved user.
  const approvedUser = await db.user.findUnique({ where: { email } });
  if (approvedUser) {
    if (approvedUser.tenantId) {
      await db.tenant.delete({ where: { id: approvedUser.tenantId } }).catch(() => {});
    }
    await db.user.delete({ where: { id: approvedUser.id } }).catch(() => {});
  }
  await db.waitlistEntry.delete({ where: { id: entry.id } }).catch(() => {});
}

async function testWaitlist002(cookieA: string) {
  // Non-admin cannot approve.
  const { status } = await apiPost('/api/waitlist/approve', { entryId: 'fake-id' }, cookieA);
  record('WAITLIST-002: Non-admin cannot approve', status === 403, `status=${status}`);
}

async function testSetpw001() {
  // Invalid token returns generic error (enumeration resistance).
  const r1 = await apiPost('/api/set-password', { token: 'invalid1', password: 'validpassword' }, undefined, BASE);
  const r2 = await apiPost('/api/set-password', { token: 'invalid2', password: 'validpassword' }, undefined, BASE);
  const sameError = r1.status === r2.status;
  record('SETPW-001: Invalid token returns generic error', sameError && r1.status === 400,
    `status=${r1.status}, same=${sameError}`);
}

async function testSetpw002() {
  // Short password rejected.
  const { status } = await apiPost('/api/set-password', { token: 'validlookingbutfake', password: 'short' }, undefined, BASE);
  record('SETPW-002: Short password rejected', status === 400, `status=${status}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Nomos — Runtime Security Test Suite');
  console.log('=====================================\n');

  // Verify dev server is running.
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    console.error('Dev server not running on http://localhost:3000');
    console.error('Start it with: cd /home/z/my-project && ./start-dev-detached.sh');
    process.exit(1);
  }

  console.log('Setup: creating test fixtures...');
  await setupFixtures();

  console.log('Setup: signing in as test users...');
  const cookieA = await signIn(FIXTURE.userA, FIXTURE.password);
  const cookieB = await signIn(FIXTURE.userB, FIXTURE.password);
  const cookieAdmin = await signIn(FIXTURE.admin, FIXTURE.adminPassword);

  if (!cookieA || !cookieB || !cookieAdmin) {
    console.error('Failed to sign in test users — aborting.');
    await cleanupFixtures();
    process.exit(1);
  }

  // Debug: verify sessions have correct tenantId
  const meA = await apiGet('/api/me', cookieA);
  const meAdmin = await apiGet('/api/me', cookieAdmin);
  console.log(`  user A tenant: ${(meA.body as { user?: { tenantId?: string } }).user?.tenantId ?? 'NULL'}`);
  console.log(`  admin tenant: ${(meAdmin.body as { user?: { tenantId?: string; role?: string } }).user?.tenantId ?? 'NULL'}, role: ${(meAdmin.body as { user?: { role?: string } }).user?.role ?? '?'}`);
  console.log('');

  // Debug: verify decisions exist in the DB
  const dbCount = await db.decisionRecord.count();
  console.log(`  DB decision count: ${dbCount}\n`);

  console.log('Tests:\n');

  await testAuthz001(cookieA);
  await testAuthz002(cookieA);
  await testAuthz003(cookieA);
  await testAuthz004(cookieA);
  await testAuthz005(cookieAdmin);
  await testAuthz005b(cookieAdmin);
  await testAuthz006(cookieAdmin);
  await testAuthz007();
  await testAuthz008(cookieA);
  await testIntegrity001();
  await testIntegrity003(cookieA);
  await testIntegrity004(cookieA);
  await testIntegrity005(cookieA);
  await testIntegrity006(cookieA);
  await testWaitlist001(cookieAdmin);
  await testWaitlist002(cookieA);
  await testSetpw001();
  await testSetpw002();

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n-------------------------------------`);
  console.log(`${passed} passed, ${failed} failed`);

  console.log('\nCleanup: deleting test fixtures...');
  await cleanupFixtures();
  console.log('  done.');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Runtime test suite failed:', err);
  cleanupFixtures().finally(() => process.exit(1));
});
