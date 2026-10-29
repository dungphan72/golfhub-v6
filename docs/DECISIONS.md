# Decisions

## 2026-10-29 — Start with the generated workspace’s absence

**Decision:** Use Next.js App Router, React, TypeScript strict mode, and Tailwind CSS in the empty workspace rather than introduce a separate backend or replace an existing stack.

**Reason:** No repository architecture, data store, or compatibility constraint existed to preserve.

## 2026-10-29 — Do not fabricate course inventory

**Decision:** The directory displays an explicit empty state until verified partner data is available.

**Reason:** Unverified course names, prices, ratings, coordinates, and tee-time availability could mislead users.

## 2026-10-29 — Keep Supabase optional until provisioned

**Decision:** Validate server-side Supabase variables when configured, but allow both to be absent in the public shell.

**Reason:** No project credentials were provided. A partial or unsafe configuration is an error; no mock backend or secret is introduced.

## 2026-10-29 — Defer payment and hold details

**Decision:** Do not implement payment or a booking hold model before provider choice and business cancellation/hold rules are confirmed.

**Reason:** These choices affect money, availability, and concurrency guarantees and cannot be safely simulated as production behavior.
