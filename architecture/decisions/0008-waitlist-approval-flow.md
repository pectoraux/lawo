# ADR 0008 — Waitlist Approval Flow

- **Status:** ACCEPTED
- **Date:** Auth/Deployment sprint (post-0005)
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The platform requires **controlled access**: not open registration. The platform owner must approve each new user before they can sign in. This is the platform's access model — an administrator is the gatekeeper.

The flow that supports this model has three states per prospective user:

1. **Sign-up (PENDING)** — a prospective user submits their email (and optionally a name) via the public sign-up form. A `WaitlistEntry` is created with `status=PENDING`. The prospective user cannot sign in.
2. **Admin review (PENDING → APPROVED or REJECTED)** — an administrator reviews the waitlist in the admin UI. The admin selects a role (`USER`, `OPERATOR`, `PACKAGER`, `ADMIN`) and either approves or rejects the entry. On approval, a `User` row is created with `status=WAITLISTED` (per ADR 0009 — the user is approved but has not yet set a password). On rejection, the entry is marked `REJECTED`; no `User` is created.
3. **Set-password (WAITLISTED → ACTIVE)** — the approved user follows the invitation-token + set-password flow (per ADR 0009) to set their own password and become `ACTIVE`. Only at this point can they sign in.

This model keeps the admin in the loop for every new user, supports role assignment at approval time, and creates an auditable record of every approval/rejection (per I6, per `contracts/audit.md`).

The flow is **separate from the rule engine** (per I5): waitlist approval is not a legal decision, does not consult `RuleIR`, does not produce `Provenance`. But it interacts with the tenant subsystem (per I9): each approved user receives a personal `INDIVIDUAL` tenant.

## Decision

Adopt the **WaitlistEntry model + admin approval flow**.

### `WaitlistEntry` model

- `id: string` — stable id
- `email: string` — unique; the prospective user's email
- `name?: string` — optional display name
- `status: WaitlistStatus ∈ { PENDING, APPROVED, REJECTED }` — starts `PENDING`
- `requestedRole?: UserRole` — optional request from the user (admin may override)
- `approvedRole?: UserRole` — the role the admin assigned at approval
- `userId?: string` — set when `APPROVED`; references the created `User.id`
- `createdAt: string` — when the entry was created
- `decidedAt?: string` — when the admin approved/rejected
- `decidedBy?: string` — the admin `User.id` that approved/rejected

### Flow

1. **Sign-up (`POST /api/auth/signup`)** — public endpoint. Creates a `WaitlistEntry` with `status=PENDING`. Rate-limited (per ADR 0011). Returns 201 without disclosing whether the email is already on the waitlist (to prevent enumeration).
2. **Admin review (`GET /api/waitlist`)** — admin-only. Returns the `PENDING` entries.
3. **Approve (`POST /api/waitlist/approve`)** — admin-only. Body: `{ entryId, role }`. Creates a `User` with `status=WAITLISTED`, `passwordHash=null`, `invitationToken=<32-byte hex>`, `invitationExpiresAt=now+7d` (per ADR 0009). Creates a personal `INDIVIDUAL` tenant for the user. Marks the `WaitlistEntry` as `APPROVED` with `approvedRole` and `userId`. Emits an `AUDIT` event (`WAITLIST_APPROVED`). Returns the invitation token (the admin then communicates it to the user out-of-band; per ADR 0009 the admin never sees the password).
4. **Reject (`POST /api/waitlist/reject`)** — admin-only. Body: `{ entryId }`. Marks the `WaitlistEntry` as `REJECTED`. No `User` is created. Emits an `AUDIT` event (`WAITLIST_REJECTED`).
5. **Set-password (`POST /api/auth/set-password`)** — public endpoint (the user is not yet authenticated). Body: `{ token, password }`. Validates the token, hashes the password, sets `User.passwordHash`, sets `User.status=ACTIVE`, clears `User.invitationToken` and `invitationExpiresAt`. Emits an `AUDIT` event (`SET_PASSWORD`). Rate-limited (per ADR 0011). CSRF-protected (per ADR 0011).

### Role assignment

The admin selects the role at approval time. The role flows into the `User.role` field and into the JWT (per ADR 0007). Roles:

- `USER` — default; can use the platform's user-facing APIs.
- `OPERATOR` — operational access (e.g., package review).
- `PACKAGER` — can publish packages (subject to `contracts/package.md` quality gate).
- `ADMIN` — full administrative access (waitlist management, user management, audit access).

Role changes after approval are an explicit admin action (`POST /api/users/:id/role`), recorded as an audit event.

### Personal tenant

Every approved user gets a personal `INDIVIDUAL` tenant (per `contracts/tenant.md`). The `User.tenantId` field references this tenant. The user's facts, entities, decisions, and audit events are scoped to this tenant (per I9).

## Alternatives considered

- **Open registration (no admin review).** Rejected: the platform is not open to the public; the operator controls access. Open registration would also conflict with the role-assignment requirement — there is no way to assign a role to a self-registered user without an admin step.
- **Email verification (no admin review).** Rejected: email verification proves the user controls the email but does not give the operator control over who can access the platform. It also requires email integration (SMTP or a provider), which is out of scope for the auth sprint.
- **Invite-only (admin pre-creates accounts).** Rejected: requires the admin to know the prospective user's email in advance. The waitlist model lets the prospective user express interest; the admin approves. This is a better UX for both sides.
- **Self-service role selection.** Rejected: roles are privileged; users cannot self-assign `ADMIN` or `PACKAGER`. Role assignment is the admin's responsibility.
- **Auto-approval based on email domain.** Rejected: an email domain is not a sufficient trust signal for the platform's threat model.

## Consequences

- The admin is the gatekeeper. Every new user is a deliberate decision. This is intentional: the platform is not a consumer app with mass sign-up.
- Audit events are recorded for every step: sign-up, approve, reject, set-password, role-change. This gives a complete trail of who joined when and who approved them (per I6, per `contracts/audit.md`).
- The `WaitlistEntry` and `User` models are separate. The `WaitlistEntry` is the prospective-user record (PENDING/APPROVED/REJECTED); the `User` is the actual authenticated-account record (`status=WAITLISTED/ACTIVE/DISABLED`). This separation lets us keep the waitlist history even after a user is created or disabled.
- A personal `INDIVIDUAL` tenant is created per approved user. This means every user's data is isolated by default — there is no shared "default" tenant where data could leak (per I9).
- The admin must communicate the invitation token to the user out-of-band (per ADR 0009). The token expires in 7 days; if it expires, the admin can re-issue by re-approving (which generates a new token).
- Rate limiting is mandatory on the sign-up and set-password endpoints (per ADR 0011) to prevent waitlist spam and token brute-force.

## Invariants affected

- **I9** — tenant data: each approved user gets a personal `INDIVIDUAL` tenant; the user's `tenantId` flows into the JWT and is enforced on every authenticated API call. This is the primary interaction with I9.
- **I6** — every material action (approve, reject, set-password, role-change) is recorded as an `AuditEvent`. This satisfies the "every material decision has provenance" requirement at the platform-foundation level (the rule-engine notion of provenance, I6, applies to *legal* decisions; the audit notion applies to *administrative* actions).
- **I12** — capability boundaries: the admin's role (`ADMIN`) is what grants the capability to approve/reject. A `USER` cannot invoke `/api/waitlist/approve` — the endpoint checks the JWT's `role` claim. This is the same capability-enforcement principle that applies to extensions.
- **I5** — waitlist approval is **not** a legal decision. It does not consult `RuleIR`, does not produce `Provenance`, does not flow through the `DecisionEngine`. This is by design: the kernel's authoritative machinery is unaffected.
- **I18** — this ADR is an auth-sprint decision; the kernel architecture is unchanged.

## Migration implications

- The `WaitlistEntry` and `User` models are added as new tables in the Prisma schema (per ADR 0006). No kernel table is modified.
- A new `INDIVIDUAL` tenant is created per approved user. The `Tenant` table already supports `kind=INDIVIDUAL` (per `contracts/tenant.md`); no schema change is needed for that.
- Existing fixtures (`fixtures/border-crossing-golden-01.json`) are unaffected — they exercise the kernel, not the auth flow.
- The `WaitlistStatus` enum (`PENDING`, `APPROVED`, `REJECTED`) is a Postgres native enum (per ADR 0006). Adding a new status (e.g., `EXPIRED`) requires an ACO (per I16).
- Future revisions to the flow (e.g., adding email notification when approved, or self-service role selection) supersede this ADR rather than overwrite it (section 36).

## References

- `constitution.md` — section 24 (multi-tenancy), section 25 (security).
- `contracts/tenant.md` — the personal `INDIVIDUAL` tenant created per user.
- `contracts/audit.md` — `AuditEvent` records for sign-up/approve/reject/set-password.
- `decisions/0006-postgresql-migration.md` — the Postgres schema that backs `WaitlistEntry`.
- `decisions/0007-nextauth-credentials.md` — the auth provider that gates on `status=ACTIVE`.
- `decisions/0009-invitation-tokens.md` — the invitation-token flow that turns `APPROVED` into `ACTIVE`.
- `decisions/0011-rate-limiting-and-csrf.md` — rate limiting on the sign-up and set-password endpoints.
- `src/kernel/primitives/types.ts` — `AuditEvent` shape used to record waitlist events.
