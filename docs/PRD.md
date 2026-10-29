# Product requirements

## Product

Golf Hub is a digital infrastructure platform connecting golfers, golf facilities, clubs, coaches, organizers, and golf-service businesses in Vietnam. It is not limited to tee-time booking.

## Users and value

| User | Intended value |
| --- | --- |
| Golfer | Discover verified golf services and manage a connected golf experience |
| Golf business | Reach golfers and, in later phases, manage facilities, inventory, and bookings |
| Club or community | Organize members, events, and communications |
| Platform operator | Govern partner quality, safety, and commercial operations |

## MVP scope

The first product vertical slice is golfer identity/profile, verified course discovery, server-validated temporary tee-time holds, booking history/cancellation, partner onboarding/course/availability operations, in-app booking notifications, and admin review/audit oversight. The configured Supabase project and RLS-backed workflows have been tested; no real golf-course or tee-time inventory is verified yet, so public course discovery remains empty.

## Phase 2 foundation

Partner users can view booking counts, player counts, lifecycle status totals, and active booking value over rolling 7/30/90-day periods. This is operational reporting only, not collected revenue.

PayOS checkout links and signature-verified webhook reconciliation are implemented. A booking is confirmed only after a valid, amount-matched webhook while its hold remains active; late or mismatched payments require manual reconciliation. Sandbox credentials, public webhook delivery, and end-to-end payment verification remain setup/release requirements.

## Explicitly out of scope for the first milestone

- Real payment collection or refunds (holds remain pending payment and expire after 10 minutes)
- Production live-inventory feeds or fabricated course content
- Marketplace checkout, rewards, social messaging, or handicap calculation
- Production readiness claims before authorization, concurrency, and operational controls are tested

## First milestone acceptance criteria

1. A clean install can run lint, strict type checking, and a production build.
2. The home, course directory, and partner information pages are responsive and accessible by keyboard.
3. Missing course data is represented as an explicit empty state; no fabricated listings, availability, ratings, or metrics are shown.
4. Supabase configuration is optional when wholly absent and fails clearly when partially or unsafely configured.
5. Product, architecture, database, security, and delivery status are documented.

## MVP acceptance criteria

1. A golfer can authenticate, update a profile, find verified courses, and filter by supported course name and city.
2. Course discovery is paginated; availability is calculated on the server and revalidated inside the booking transaction.
3. Concurrent requests for the same tee-time inventory cannot exceed its seat capacity.
4. Booking transitions, ten-minute hold expiry, cancellation rules, and append-only status history are enforced in the database.
5. Partners can only manage their own facilities, schedules, and bookings; administrators have separate, audited access.
6. Critical flows include positive, invalid-input, unauthorized, contention, idempotency, and failure-recovery tests.
7. Payment integration is labeled non-operational until a real provider, credentials, signatures, and reconciliation have been configured and tested.

## Success measures

Measures will be defined with real operational data and explicit time windows after the product can collect it. The app intentionally displays no invented growth or transaction metrics.
