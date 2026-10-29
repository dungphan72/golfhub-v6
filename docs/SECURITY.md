# Security model

## Current state

Auth, profile, booking, partner, and admin code plus RLS migrations are present. The hosted Supabase project has all nine migrations applied; the Auth API is reachable and email sign-in is enabled. Signup, email confirmation, password sign-in, self-profile RLS, partner tenant isolation, concurrent booking, partner self-review prevention, and partner report scoping have been verified. PayOS now uses a server-only service-role key for signed-webhook reconciliation; it must never be exposed to the browser. The PayOS round trip remains unverified until sandbox secrets and a public HTTPS webhook are configured. Environment validation rejects partial configuration and non-HTTPS remote URLs (loopback is allowed for local development).

## Planned permission matrix

| Capability | Golfer | Partner member | Admin | Super admin |
| --- | --- | --- | --- | --- |
| Read public verified course profiles | Yes | Yes | Yes | Yes |
| Manage own profile | Own only | Own only | Own only | Own only |
| Manage course, inventory, and bookings | No | Assigned organization only | Authorized oversight | Authorized oversight |
| Verify partner | No | No | Yes, audited | Yes, audited |
| Manage platform roles/settings | No | No | Limited, audited | Yes, audited |

Partner membership and ownership are tenant relationships, not global role claims. Staff and coaches receive only the organization-scoped permissions they need.

## Implemented controls

- Protected pages and server actions verify the Supabase user. Admin operations also check role membership on the server and inside database RPCs.
- Every MVP public-schema table enables RLS. Partner membership is tenant-scoped; role-check functions live in a non-exposed `private` schema.
- Booking creation/cancellation/expiry and payment reconciliation use database functions; booking price and user identity are derived server-side, with a row lock and idempotency key.
- PayOS checkout request signatures are created server-side. The public webhook verifies the provider's HMAC-SHA256 signature with constant-time comparison; the return URL never confirms payment. A service-role-only RPC checks order, payment-link ID, currency, amount, reference idempotency, and active hold before confirming a booking. Late, duplicate-transfer, and mismatched events require manual reconciliation.
- Privileged partner/course reviews create append-only audit entries. Booking transitions create append-only history and user/partner notifications.
- Inputs are validated in server actions and database functions. PayOS client/API/checksum credentials and `SUPABASE_SERVICE_ROLE_KEY` are server-only. None of those secrets are configured in the current workspace.
- `GET /api/health` performs a read-only Supabase query using the publishable key, with a three-second timeout. It returns only `ok` or `unavailable`; configuration and database details are kept in server logs.
- Next.js sends `nosniff`, clickjacking protection, a strict-origin referrer policy, a restrictive permissions policy, and HSTS headers. HSTS is sent without `includeSubDomains` or preload until the production domain/subdomain policy is confirmed. A Content Security Policy remains deferred because the deployment's trusted resource origins have not been established.

## Verified against the hosted project

- Anonymous REST requests cannot read profiles, roles, partner applications, or bookings.
- With two confirmed identities under the authenticated database role, each golfer can read their own profile and role, and each partner can read its own organization, course, and tee time. Neither identity can read the other's private partner membership, profile, role, or bookings.
- The second identity cannot cancel the first golfer's pending booking; the RPC returns `BOOKING_NOT_FOUND`.
- Partner onboarding tests verified applicants can see their own pending application, cannot see another applicant's record, and cannot submit a second pending application or perform admin review.
- A temporary admin role inside the rollback transaction successfully approved a partner application and a pending course, assigned partner ownership, published the course, and wrote both audit entries. The role and all fixtures were rolled back; no account was granted persistent admin access.
- Rollback-scoped booking assertions cover capacity rejection, idempotent retries/key reuse, expiry, cancellation, append-only status history, and notifications.
- Two concurrent authenticated database sessions competing for a capacity-one tee time produced exactly one booking and one `TEE_TIME_FULL` rejection; test fixtures were removed afterward.
- The app-level flow was exercised with a disposable `TEST ONLY` course: directory search, temporary hold, booking detail/history, cancellation, notifications, and seat restoration all passed. The fixture and test booking were then removed and verified absent.
- Rollback-scoped PayOS payment tests verified payment intent ownership and idempotency, successful booking confirmation, duplicate webhook handling, late-payment expiry, mismatch hold-for-review, and rejection of the privileged RPC for authenticated users. No PayOS network transaction has been tested because merchant credentials are not configured.
- The verified `dungphan72@gmail.com` account received `SUPER_ADMIN` after explicit user authorization. A separate application for “Sân Golf Hub” by `phantiendung3185@gmail.com` was approved through the admin UI; Supabase verification confirmed the audit entry, verified organization, and owner membership. The `dungphan72@gmail.com` account later approved its own “Sân Dũng Phan” application. Migration `20261029000008_prevent_partner_self_review.sql` now blocks an applicant-admin from approving or rejecting their own application.
- PKCE now carries the SDK's `sb_flow_id` from the email redirect into server-side code exchange to select the matching verifier. A new email-link round trip remains necessary to verify the fix against Supabase Auth.

## Release controls still required

- Verify the email-link PKCE callback in the same browser context.
- Configure and verify Supabase email confirmation URLs and production origins.
- Configure an external uptime monitor for `GET /api/health` and test alert delivery. The endpoint reports application/Supabase readiness only; it does not check PayOS.
- Configure rate limiting at the production edge and review abuse cases; the health endpoint itself is intentionally unauthenticated for monitoring.
- Select backup retention and point-in-time recovery for the production Supabase plan, document restore procedures, and complete a restore drill before launch.
- Review storage, audit retention, and incident recovery before production.
- Configure PayOS sandbox credentials and public HTTPS webhook, then verify the checkout/webhook round trip end to end.

Refunds, settlement, production webhook abuse controls, and a policy for paid-but-cancelled bookings remain outstanding.
