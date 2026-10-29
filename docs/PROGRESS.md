# Progress

## Current milestone

The MVP application foundation and code paths are implemented. The repository began as an empty workspace; there was no prior app, database, documentation, or test suite. A Supabase project is now configured and migrated, but authenticated workflows are not yet end-to-end verified.

## Completed

- Scaffolded Next.js 16 App Router, React 19, and strict TypeScript.
- Added public home, course-directory empty state, and partner information pages.
- Added shared header/footer and responsive Golf Hub visual foundation.
- Added optional server-side Supabase environment validation and `.env.example`.
- Added product, architecture, database, security, implementation, and setup documentation.
- Added unit tests for Supabase configuration validation and safe internal redirects.
- Implemented Supabase auth/profile, verified-course discovery, temporary booking holds/cancellation, partner onboarding/operations, admin review, notifications, and ten RLS-backed migrations.
- Configured the Supabase project in local `.env.local`; verified the hosted project is healthy, applied all ten migrations, and confirmed the Auth API responds and email sign-in is enabled.
- Verified all migration versions are recorded remotely, `supabase db lint --linked` reports no schema errors, and anonymous REST requests cannot read profiles, roles, partner applications, or bookings.
- Hardened the email callback and sign-in redirect against protocol-relative and backslash-based external redirects.
- Completed a real signup and email confirmation; verified the database trigger created exactly one profile and default `GOLFER` role, then signed in and read that golfer's own profile through the authenticated app/RLS.
- Moved authenticated session checks to request time and opted personalized routes out of instant-navigation validation so Next.js does not prerender session-dependent work.
- Simulated the authenticated database role to verify a golfer can read their own profile and role but no other profile. Ran rollback-scoped booking assertions for capacity rejection, idempotent retry/key reuse, expiry, cancellation, status history, and notifications; confirmed test fixtures were not retained.
- Added a reusable rollback-scoped database integration script. Its first run found an ambiguous `partner_id` variable in both booking notification triggers; added and applied a forward-only migration to fix the triggers, then reran the integration script successfully.
- With the second confirmed golfer, extended and passed the hosted integration script for two-user profile/role/booking isolation, separate partner membership/course/tee-time visibility, and rejection of unauthorized booking cancellation.
- Added and ran a hosted two-session concurrency harness: one identity holds the tee-time row lock while both golfers race for its single seat; exactly one booking succeeded, the other received `TEE_TIME_FULL`, and all temporary rows were removed.
- Extended and passed the rollback-scoped integration suite for partner onboarding and admin RPCs: applicant isolation, duplicate pending-application rejection, non-admin denial, partner approval/owner assignment, course publication, and append-only audit entries. The temporary admin grant and all records rolled back; no persistent role change was made.
- Granted `SUPER_ADMIN` to the verified `dungphan72@gmail.com` account after the user explicitly authorized it. The separate “Sân Golf Hub” application from `phantiendung3185@gmail.com` was approved through `/admin`; verified its status, audit entry, verified partner organization, and applicant's owner membership in Supabase.
- The “Sân Dũng Phan” application for `dungphan72@gmail.com` was subsequently approved by that same account. Supabase confirms both applications are approved. Migration `20261029000008_prevent_partner_self_review.sql` now blocks admins from reviewing their own applications, hides the self-review form, and passes regression tests for both approval and rejection attempts.
- Added `GET /api/health` as a production readiness probe: it checks Supabase with a three-second timeout and returns only a generic status. Unit tests cover healthy, unconfigured, database-error, and configuration-error cases; the external monitor, alert routing, edge rate limits, and backup/restore policy still require production setup.
- Configured baseline HTTP security headers in Next.js: `nosniff`, frame denial, strict-origin referrer handling, disabled camera/microphone/geolocation, and HSTS. CSP is intentionally deferred until production resource origins are known.
- Added partner tee-time closure through a database RPC: only organization owners/managers or platform admins can close a future slot; active holds and confirmed bookings block closure; successful closure is idempotent and audited. Partners see active/closed inventory and localized prices in their course dashboard.
- Implemented Phase 2 partner booking reports for rolling 7/30/90-day windows, aggregating counts, players, booking statuses, and active booking value per partner organization. Applied migration `20261029000004_partner_booking_reports.sql`, passed a rollback-scoped test for aggregation, date windows, invalid ranges, and tenant isolation, passed hosted schema lint, and verified the report page and period selector in the browser. The report explicitly states that booking value is not collected revenue or partner settlement.
- Added PayOS checkout and payment reconciliation code: server-only provider credentials, signed payment-link requests, authenticated golfer checkout, signed and timing-safe webhook verification, idempotent database reconciliation, and manual-review states for late, mismatched, duplicate, or uncertain payments. Migrations `20261029000005_payos_payments.sql` through `20261029000007_fix_payos_webhook_lock_order.sql` add owner-scoped payment records and service-role-only reconciliation RPCs, including consistent lock ordering. Rollback tests passed for payment-intent ownership/idempotency, confirmation, duplicate webhook, late expiry, mismatch/additional transfer, and privilege boundaries. Hosted schema lint is clean. The full PayOS sandbox round trip is not verified because merchant credentials and a public HTTPS webhook endpoint are not configured.
- Investigated email confirmation through the browser: Supabase callback logs showed `pkce_code_verifier_not_found`. The installed Supabase Auth SDK stores the verifier by flow ID, but the app neither appended `sb_flow_id` to email redirects nor passed it to the code exchange. Enabled flow-ID redirect propagation in the proxy/server clients and wired the callback exchange to the returned flow ID. The previous fresh signup attempt hit `over_email_send_rate_limit`; verify a new email round trip after the limit clears.
- Added a reusable setup/cleanup script for a clearly labeled disposable course and used it to verify course search, detail, seat availability, authenticated booking creation, booking detail/history, cancellation, notifications, and restored capacity through the browser. Confirmed all fixture rows were removed afterward.
- Fixed Next.js Cache Components prerendering errors on course search and detail by deferring database/time-dependent rendering to request time with `connection()`.
- Added setup, implementation, security, database, progress, and known-issues documentation.

## Not yet complete

- Email confirmation marked the account confirmed, but exchanging the email link failed in the current browser context because its PKCE verifier cookie was unavailable; manual password sign-in then succeeded. Verify email callback in the same browser context as signup.
- A fresh email-link PKCE round trip is still needed. Cross-user/partner tenant isolation, onboarding/admin RPC permissions, partner submission/review, the golfer admin-route denial, a true two-session booking race, partner report isolation, and app-level discovery/booking/cancellation/notification flows passed against hosted Supabase test fixtures.
- Partner organizations are verified, but no real course or tee-time inventory has been verified; course discovery intentionally remains empty.
- PayOS integration is implemented but not operational until sandbox credentials and a public HTTPS webhook are configured and the round trip passes. Refunds and settlement are not implemented; bookings still expire after ten minutes.
- Local Supabase Docker services are unavailable; hosted migration lint was used instead.

## Next recommended task

Use the partner dashboard to submit the real course profile and tee-time inventory for review. Do not mark an unverified venue as published or use test fixtures as production inventory. Verify the course details and operating hours with the partner before public launch.
