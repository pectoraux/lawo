# ADR 0009 — Invitation Tokens (Replace Admin-Generated Temporary Passwords)

- **Status:** ACCEPTED
- **Date:** Auth/Deployment sprint (post-0005) — SEC-6 hardening
- **Decider:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

The original waitlist-approval design (ADR 0008) had an open question: how does the newly-approved user obtain their initial credentials? Two obvious options were:

1. The admin generates a temporary password and communicates it to the user (in person, by phone, by email).
2. The admin sets the user's password directly and tells the user to change it after first sign-in.

Both options are insecure:

- **Admin-generated temporary passwords** can be leaked in logs (the password transits through the admin's terminal, the admin's chat client, the admin's email outbox). The admin *sees* the password — even if the admin is trustworthy, the password is now in the admin's memory and possibly in their notes.
- **Admin-set passwords** are worse: the admin knows the password indefinitely. Even if the user changes it, the admin-set password is in the database's password-hash column until the user changes it, and the admin knows the cleartext. There is no way to prove that the admin did not sign in as the user before the password was changed.

The platform's threat model is small-admin-team, low-user-count, but the SEC-6 hardening requirement (per the sprint brief) is that **admins should never generate, transmit, or handle users' passwords**. The password should be set by the user, known only to the user, and never visible to anyone else — not even at the moment of account creation.

The auth subsystem is **separate from the rule engine** (per I5): the set-password flow is not a legal decision and does not consult `RuleIR`. But the flow interacts with the audit subsystem (per I6 — provenance, broadly: every material action is recorded) and with capability enforcement (per I12 — the set-password endpoint requires a valid token, not just authentication).

## Decision

Replace admin-generated temporary passwords with an **invitation-token + set-password flow**. On approval, the user is created in `status=WAITLISTED` with `passwordHash=null` and a single-use `invitationToken`; the user then visits a set-password URL and chooses their own password.

### Approval step (admin)

When the admin approves a `WaitlistEntry` (per ADR 0008):

1. A `User` row is created with:
   - `status = 'WAITLISTED'` — the user is approved but cannot sign in yet (per ADR 0007 — `authorize()` gates on `status=ACTIVE`)
   - `passwordHash = null` — no password exists yet
   - `invitationToken = <32-byte hex>` — a cryptographically random, single-use token
   - `invitationExpiresAt = now + 7 days` — the token expires after 7 days
2. The admin receives the invitation token (or a set-password URL containing the token) and communicates it to the user out-of-band (in person, by phone, by Signal, etc.).
3. The admin **never sees** the user's password — there is no password to see. The admin only sees the token, which becomes useless once the user has set their password or once it expires.

### Set-password step (user)

1. The user visits `/?set_password=<token>` (the platform's single user-visible route, `/`, with a query parameter — see worklog Project Identity). The frontend detects the query parameter and renders the set-password form instead of the default landing.
2. The user enters their chosen password (with confirmation). The frontend POSTs to `/api/auth/set-password` with body `{ token, password }`.
3. The endpoint validates:
   - The token matches a `User.invitationToken`.
   - The token has not expired (`invitationExpiresAt > now`).
   - The `User.status` is still `WAITLISTED` (not already used, not already disabled).
4. On success:
   - `passwordHash = bcryptjs(password)` — the password is hashed with bcryptjs (10 rounds, per ADR 0007).
   - `status = 'ACTIVE'` — the user can now sign in.
   - `invitationToken = null` — the token is cleared; it cannot be reused.
   - `invitationExpiresAt = null`.
   - An `AUDIT` event is emitted: `SET_PASSWORD` (per I6, per `contracts/audit.md`).
5. On failure (token not found, expired, already used), the endpoint returns a generic error without disclosing which condition failed (to prevent token enumeration). The error is also recorded as an `AUDIT` event (`SET_PASSWORD_FAILED`).

### Security properties

- **The admin never sees the user's password.** The admin only sees a token. The user's password is known only to the user from the moment it is set.
- **The token is single-use.** After the user sets their password, the token is cleared. A replay attack with the same token fails.
- **The token expires.** After 7 days, the token is invalid. If the user has not set their password in that window, the admin can re-approve (which generates a new token) — or, in a future iteration, a "resend invitation" endpoint.
- **The set-password endpoint is rate-limited** (per ADR 0011) to prevent token brute-force. With 32 bytes of entropy (256 bits), brute-force is computationally infeasible, but rate limiting is defence-in-depth.
- **The set-password endpoint is CSRF-protected** (per ADR 0011). The Origin header must match `NEXTAUTH_URL`. Without this, a malicious site could embed a form that POSTs to `/api/auth/set-password` and trick the user into setting an attacker-chosen password.
- **The token is opaque.** It is not a JWT, it does not encode user information, it is just a random string looked up in the database. This means the database is the source of truth for token validity, which is correct — we want the ability to revoke (by clearing the token) without rotating a signing key.

## Alternatives considered

- **Email-based magic links.** Rejected: requires email integration (SMTP or a provider like Resend/SendGrid) which is out of scope for the auth sprint. Magic links are also bearer tokens — if the email is intercepted, the attacker has the session. The platform's threat model assumes the admin has a secure out-of-band channel (in person, by phone) to communicate the invitation token.
- **Admin-generated temporary passwords.** Rejected (per the Context above): the admin sees the password; the password transits through logs, chat, email. SEC-6 hardening explicitly rules this out.
- **Admin-set passwords (user changes on first sign-in).** Rejected (per the Context above): the admin knows the password indefinitely. There is no way to prove the admin did not sign in as the user before the password was changed.
- **Time-limited admin-set passwords that auto-expire.** Rejected: still requires the admin to see the password. Auto-expiry does not solve the disclosure problem.
- **OAuth-only (no password ever set).** Rejected: conflicts with the waitlist model (ADR 0008) and the Credentials-provider choice (ADR 0007). OAuth could be added later as an *additional* provider, but the platform needs password auth as the primary.
- **Pre-shared secret + user-set password on first sign-in.** Rejected: this is essentially what the invitation-token flow is, but with the secret being a password rather than a random token. A random token is stronger (higher entropy) and clearer in semantics (it is *only* an invitation, not a "password" that suggests reusability).

## Consequences

- The admin's role in onboarding is reduced to: approve + communicate the token. The admin does not handle passwords at all.
- The user controls their password from the moment they set it. The password is hashed with bcryptjs before it touches the database.
- The token expires in 7 days. If the user does not act in time, the admin must re-approve (which generates a new token). This is a minor operational inconvenience but is the correct security trade-off.
- The audit log records `SET_PASSWORD` and `SET_PASSWORD_FAILED` events, so the operator can detect brute-force attempts (per I6, per `contracts/audit.md`).
- The set-password endpoint is a public endpoint (the user is not yet authenticated) but is gated by the token. This is a capability boundary (per I12): the token *is* the capability. Without it, the endpoint refuses.
- The token is stored in the `User` table as a hex string. The token is not hashed before storage — this is acceptable because the token is single-use, expires in 7 days, and is 256 bits of entropy. Hashing the token before storage would be defence-in-depth but adds complexity for negligible benefit; the threat model does not include database-read attackers who could not also read the password hashes.
- The single user-visible route (`/`) gains a query-parameter mode (`?set_password=<token>`). The frontend detects this and renders the set-password form. This keeps the route surface minimal (per worklog Project Identity).

## Invariants affected

- **I6** — provenance: an `AuditEvent` is recorded for `SET_PASSWORD` and `SET_PASSWORD_FAILED`. The audit trail can answer "when did this user activate their account?" and "were there failed attempts?".
- **I12** — capability: the set-password endpoint requires a valid token, not just authentication. The token *is* the capability. Without it, the endpoint refuses. This is the same capability-enforcement principle that applies to extensions (a `READ` capability is required to read tenant data; an invitation token is required to set a password).
- **I5** — the set-password flow is not a legal decision. It does not consult `RuleIR`, does not produce `Provenance` in the rule-engine sense. This is by design: the kernel's authoritative machinery is unaffected.
- **I9** — tenant data: the user's `tenantId` is set at creation (the personal `INDIVIDUAL` tenant, per ADR 0008). The set-password flow does not change `tenantId`.
- **I18** — this ADR is an auth-sprint hardening decision; the kernel architecture is unchanged.

## Migration implications

- The `User` model gains two nullable fields: `invitationToken: String?` and `invitationExpiresAt: DateTime?`. These are additive changes (per I14) — existing users (if any) have `null` for both, which is the correct "no outstanding invitation" state.
- The `User.status` enum gains the `WAITLISTED` value (it was already in ADR 0007's design; this ADR makes its use explicit). Existing users (if any) are `ACTIVE`; the migration does not change their status.
- The `/?set_password=<token>` query parameter is a frontend concern; no API route is added beyond `/api/auth/set-password`.
- Future revisions to the invitation flow (e.g., email-based delivery, resend-invitation endpoint, configurable expiry) supersede this ADR rather than overwrite it (section 36).

## References

- `constitution.md` — section 25 (security), section 22 (capability-based permissions — `ACT_UPON` analogue for the set-password capability).
- `contracts/audit.md` — `AuditEvent` records for `SET_PASSWORD` and `SET_PASSWORD_FAILED`.
- `decisions/0006-postgresql-migration.md` — the Postgres schema that backs the `User` model with nullable `invitationToken` / `invitationExpiresAt`.
- `decisions/0007-nextauth-credentials.md` — `authorize()` gates on `status=ACTIVE`; a `WAITLISTED` user cannot sign in.
- `decisions/0008-waitlist-approval-flow.md` — the approval flow that creates the `WAITLISTED` user with the invitation token.
- `decisions/0011-rate-limiting-and-csrf.md` — rate limiting and CSRF protection on the set-password endpoint.
- `src/kernel/primitives/types.ts` — `AuditEvent` shape used to record set-password events.
