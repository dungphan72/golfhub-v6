# Golf Hub

Golf Hub is a digital platform foundation for golfers, golf businesses, and the wider golf community in Vietnam.

## Current status

The app includes email/password auth, golfer profiles, verified-course discovery, temporary booking holds, partner onboarding/course management, admin review, booking notifications, partner booking reports, and a PayOS checkout/webhook integration. All nine migrations are applied to the configured Supabase project; RLS isolation, concurrent booking, critical booking flows, partner self-review prevention, and partner report aggregation/date windows/tenant isolation have been tested. PayOS credentials and a public HTTPS webhook are not configured, so live/sandbox payment round-trip remains unverified. A fresh email-link PKCE round trip remains outstanding. No real golf-course inventory is loaded.

## Requirements

- Node.js 20.9 or later
- npm

## Local development

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Follow [Supabase setup](./docs/SUPABASE_SETUP.md), then set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `APP_URL` in `.env.local`. The publishable key is designed for client exposure, but this application only uses it on the server. Never add a secret/service-role key to client code or a `NEXT_PUBLIC_` variable. Apply the versioned migrations before using authenticated pages.

## Quality checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx supabase db lint --local
npx supabase db query --linked --file supabase/tests/mvp_critical_flows.sql
powershell -ExecutionPolicy Bypass -File supabase/tests/mvp_concurrency_test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/mvp_e2e_fixture.ps1
```

The SQL integration test requires two distinct confirmed test golfers and rolls back all fixture data. The concurrency test uses separate sessions and removes its temporary fixture rows. The E2E command creates a disposable `TEST ONLY` course; remove it afterward with `-Action Cleanup`.

## Project documentation

- [Product requirements](./docs/PRD.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Database design](./docs/DATABASE.md)
- [Security model](./docs/SECURITY.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [Progress](./docs/PROGRESS.md)
- [Decisions](./docs/DECISIONS.md)
- [Known issues](./docs/KNOWN_ISSUES.md)
- [Supabase setup](./docs/SUPABASE_SETUP.md)
