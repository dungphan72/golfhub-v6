# Implementation plan

## Phase 0 — Discovery and foundation

- [x] Inspect repository and choose a compatible starting architecture.
- [x] Establish Next.js/React/strict TypeScript application shell and shared design foundation.
- [x] Add project requirements, target architecture, database outline, security model, plan, decisions, progress, and known issues.
- [x] Add server-side optional Supabase environment validation.
- [x] Verify lint, typecheck, unit tests, and production build.

**Acceptance:** Clean installation and all configured checks pass; public routes are responsive; absent data is not fabricated; incomplete or unsafe backend configuration fails explicitly.

## Phase 1 — MVP core

1. [x] Add Supabase config and migrations for profiles, roles, partner applications/members, courses, tee times, bookings, status history, notifications, and audit records.
2. [x] Add email/password auth, confirmation callback, profile editing, and role-aware route guards.
3. [x] Implement verified-course directory, detail, pagination, and name/city filters.
4. [x] Implement database availability, transactional ten-minute holds, capacity locking, idempotency, expiry, cancellation, and booking history/detail.
5. [x] Implement partner applications, tenant-scoped course/tee-time management, and partner booking view.
6. [x] Implement admin partner/course review and audit views.
7. [x] Apply all four migrations to the configured Supabase project and verify remote schema lint.
8. [x] Test cross-user profile, role, booking, and partner-tenant RLS with two authenticated identities.
9. [x] Test true concurrent booking with two PostgreSQL sessions; capacity permits only one booking.
10. [x] Test course search, hold creation, booking details, cancellation, notifications, and seat release through the app using a clearly labeled disposable course fixture.
11. [x] Test partner application submission, duplicate prevention, admin-only approval, owner assignment, course review, and audit records in a rollback-scoped database test.
12. [ ] Verify auth email-link PKCE callback in the same browser context.

**Acceptance:** The migrations are applied, but Phase 1 is not accepted until database-backed auth, RLS, concurrency, and critical end-to-end tests pass. No real payment success is represented until a provider is configured and verified end to end.

## Phase 2 — Commercial operations

- [x] Add partner booking reports for 7/30/90-day periods, scoped to the signed-in user's partner memberships; distinguish booking value from collected revenue.
- [x] Add PayOS checkout-link creation and signed webhook reconciliation, with late/mismatched payment review states.
- [ ] Configure PayOS sandbox credentials and verify the full checkout/webhook round trip.
- [ ] Add refunds, reviews, membership/rewards, communities, commissions, and settlement workflows.

## Phase 3 — Ecosystem expansion

Marketplace, coaches/academies, tournaments, tourism, performance/handicap features, additional mobile clients, and analytics.
