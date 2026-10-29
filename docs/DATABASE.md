# Database design

The schema is defined in twelve versioned migrations under `supabase/migrations`. All twelve have been applied to the configured Supabase project; hosted schema lint and rollback-scoped partner-report, PayOS-payment, tee-time closure, inventory permission, and staging access integration tests pass.

## MVP entities

- `profiles`: user identity metadata keyed to the auth user; no password storage.
- `user_roles`: platform-level role assignments, managed only by authorized server operations.
- `partner_organizations`: approved provider identity and verification state.
- `partner_members`: organization membership, role, and invitation/active state.
- `golf_courses`: verified course profile owned by a partner organization.
- `tee_times`: explicit time-slot inventory with start/end, VND price per player, and seat capacity.
- `bookings`: golfer, tee-time slot, player count, VND amount snapshot, idempotency key, 10-minute hold expiry, and lifecycle state.
- `booking_status_history`: append-only actor, transition, and timestamp record.
- `partner_applications`: user-submitted onboarding applications, reviewed by admins.
- `notifications`: user/partner-scoped booking messages without payment secrets.
- `audit_logs`: append-only records for partner/course reviews and partner tee-time closures.
- `payment_transactions` and `payment_webhook_events`: server-managed PayOS payment attempts, idempotent webhook references, and manual reconciliation records.
- `private.course_import_batches` and `private.golf_course_import_staging`: source-hash tracked, non-public snapshots awaiting human verification; API roles have no access. Imported verification labels are limited to `secondary_source_only` and `partial_primary_verification`, while admin verification must remain `unverified`.

The partner report RPC aggregates booking counts, players, lifecycle statuses, and active booking value over a bounded date range. It runs as the authenticated caller and only returns organizations linked to that caller's partner memberships. Booking value is not proof of collected revenue.

## Integrity and money

- Use UUID identifiers, foreign keys, explicit deletion behavior, and UTC timestamps.
- The MVP is VND-only: amounts are integer VND, with no floating-point arithmetic.
- Snapshot the accepted price and currency on a booking. Never trust a client-supplied price.
- Partner users may edit course details but cannot change verification/publication fields; tee-time inventory is created or closed through controlled paths, not direct updates/deletes.
- Make financial transaction history append-only; corrections should be compensating records.
- Add indexes for common course, partner, user, status, and time-window lookups.

## Booking concurrency

The MVP models inventory as explicit tee-time slots with a seat capacity. `create_booking` serializes retries by golfer/idempotency key, rejects reuse of a key with changed booking details, locks the selected `tee_times` row, expires timed-out holds, recalculates occupied seats, snapshots the database price, and inserts an idempotent ten-minute `pending_payment` booking in the same transaction. Availability is read via a server-side database function and is revalidated on every booking attempt. PayOS webhook reconciliation confirms only an active booking with a valid signature and exact order, link, currency, and amount match; late/mismatched transfers require manual review. The PayOS sandbox round trip remains unverified until credentials and public webhook delivery are configured.

## Migrations

Migrations must be versioned, reviewed, and safe to apply in order. Never edit an already-applied migration to change hosted state. Apply migrations to a fresh test database and verify each RLS boundary before production launch.
