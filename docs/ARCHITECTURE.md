# Architecture

## Current implementation

- Next.js App Router, React, and strict TypeScript.
- Public discovery and partner-information routes plus golfer, partner, and admin areas.
- Supabase SSR authentication, profile management, typed data access, and role-aware server guards.
- PostgreSQL migrations with RLS, transactional tee-time holds, booking history, and notifications.
- These backend flows are implemented in code but are not operational until Supabase is provisioned, migrations are applied, and integration tests pass.

## MVP data flow

```text
Browser
  -> Next.js route handlers / server actions
      -> authentication and authorization
      -> readiness probe (`GET /api/health`) for external uptime monitoring
      -> domain services (course discovery, booking, cancellation)
      -> typed data-access layer
          -> PostgreSQL/Supabase with RLS and transactional constraints
      -> PayOS checkout API and signature-verified payment webhook
```

UI components should remain presentation-focused. Domain rules and access checks belong in server-side services; database policies are an independent enforcement layer. External provider integrations must be replaceable behind narrow interfaces.

## Module boundaries

- `src/app`: route composition and server entry points
- `src/components`: reusable presentation components
- `src/lib`: environment validation and shared infrastructure
- Domain rules and schemas in `src/lib`, with route-specific server actions and page loaders
- `supabase/migrations`: versioned SQL migrations and RLS policies
- `docs`: product, data, security, decisions, and delivery state

## First release decisions

- Use Next.js App Router and TypeScript strict mode because the workspace has no existing architecture.
- Use PostgreSQL as the source of truth for inventory and booking state.
- Keep server actions/API endpoints as transport, not as the place to duplicate domain rules.
- Use integer minor units for monetary values and explicit currency codes.
- PayOS secrets and the Supabase service-role key remain server-only; sandbox checkout requires explicit server configuration and a public HTTPS webhook.
