# Job App Backend v0.2

Backend-first foundation for a two-sided hiring marketplace where workers maintain reusable work profiles and employers publish jobs. Automatic matching creates applications only when hard requirements on both sides are compatible, then an explainable score ranks eligible matches without overriding those requirements.

The UI is intentionally plain. This version focuses on product logic, account security, data integrity, matching, filters, and workflows.

## Stack

- Next.js App Router + TypeScript
- Supabase Auth + Postgres
- Supabase server client
- Zod request validation
- OpenStreetMap/Nominatim-compatible server-side geocoding with database caching
- Node core tests for pure domain logic

## Backend v0.2 capabilities

### Accounts and authorization

- Worker and employer signup/login via Supabase Auth.
- `profiles` links auth users to an immutable primary account type.
- Worker records are linked to their authenticated user.
- Employer companies use memberships with `owner`, `admin`, `recruiter`, and `viewer` roles.
- One employer user can belong to multiple companies.
- API routes derive identity from Bearer access tokens instead of trusting caller-supplied email/user IDs.
- Sensitive database writes go through server routes using the service-role key only after authorization checks.
- Row-level security is enabled as defense in depth.

### Locations

- Employers can create multiple named business locations and select a default.
- Workers can save multiple locations and choose a primary matching origin.
- Jobs can reference an employer location while preserving coordinate snapshots for deterministic matching.
- Authenticated address geocoding is available at `POST /api/locations/geocode`.
- Geocoding results are normalized and cached for 30 days.
- Geocoding provider base URL and user agent are configurable.

### Matching

Hard eligibility checks:

- active worker and open/non-expired job
- role/category compatibility
- employment-type compatibility when the worker has preferences
- workplace-type compatibility when the worker has preferences
- minimum pay
- required experience
- travel radius, skipped for fully remote jobs
- requested weekly-hours range
- required certifications
- certification expiry against job start date
- availability covering every required shift

Eligible pairs receive a 0–100 explainable score with components for:

- distance
- pay surplus
- experience surplus
- weekly-hours fit
- schedule flexibility
- preference alignment

The score and breakdown are stored on the application with a matcher version. Re-running matching updates score metadata on existing applications without resetting their application status or creating duplicates.

### Application workflow

Actor-aware state machine:

- `submitted` -> `employer_interested` or `rejected` by an employer recruiter/admin/owner
- `submitted` -> `withdrawn` by the worker
- `employer_interested` -> `worker_accepted`, `worker_declined`, or `withdrawn` by the worker
- `worker_accepted` -> `hired` or `rejected` by the employer

Every valid transition is written atomically with an `application_events` audit record. Concurrent stale transitions are rejected. When hired applications reach the job's `openings` count, the job is automatically closed.

### Search and filters

`GET /api/jobs/search` supports combined filters, including:

- text query
- category
- employer
- employment type
- workplace type
- minimum/maximum pay
- weekly hours
- maximum required experience
- required certification names
- weekdays
- start-date windows
- closing-date floor
- geographic radius
- minimum/maximum match score
- eligibility-only for the signed-in worker

Sort options include score, pay, distance, newest, and start date. Worker searches use the worker's primary coordinates by default when no origin is provided.

Employers can inspect scored candidates with `GET /api/jobs/:id/candidates`. Users can persist filter JSON using saved searches.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor to create the v0.1 base tables.
3. Run `supabase/migrations/20260916_backend_v02.sql` once to upgrade the base schema to backend v0.2. Existing v0.1 databases only need this migration step.
4. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - a descriptive `GEOCODING_USER_AGENT`
5. Install and run:

```bash
npm install
npm run test:core
npm run typecheck
npm run dev
```

## Authentication flow

Create an account:

```http
POST /api/auth/signup
Content-Type: application/json

{
  "email": "worker@example.com",
  "password": "at-least-8-characters",
  "accountType": "worker",
  "fullName": "Example Worker"
}
```

Sign in:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "worker@example.com",
  "password": "at-least-8-characters"
}
```

Authenticated endpoints expect:

```http
Authorization: Bearer <access_token>
```

`GET /api/auth/me` returns the current profile, worker record when present, and employer memberships.

## Core API groups

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/profile`
- `GET|POST /api/workers`
- `GET|PATCH|DELETE /api/workers/me`
- `GET|POST /api/workers/me/locations`
- `GET|POST /api/employers`
- `GET|POST /api/employers/:id/locations`
- `GET|POST /api/employers/:id/members`
- `GET|POST /api/jobs`
- `GET|PATCH|DELETE /api/jobs/:id`
- `GET /api/jobs/search`
- `GET /api/jobs/:id/candidates`
- `GET /api/applications`
- `POST /api/applications/:id/transition`
- compatibility: `POST /api/applications/:id/interest`
- compatibility: `POST /api/applications/:id/worker-decision`
- `POST /api/locations/geocode`
- `GET|POST /api/saved-searches`
- `PATCH|DELETE /api/saved-searches/:id`
- `POST /api/matches/run`
- `GET /api/health`

## Matching and audit internals

- Pure hard eligibility + scoring: `lib/matching.ts`
- DB orchestration: `lib/runMatching.ts`
- Actor-aware state machine: `lib/applicationState.ts`
- Atomic transition service: `lib/applicationService.ts` + `transition_application_service(...)` SQL function
- Authorization: `lib/auth.ts`, `lib/authorization.ts`
- Filters: `lib/filters.ts`
- Geocoding: `lib/geocoding.ts`
- Schema/migration: `supabase/schema.sql`, `supabase/migrations/20260916_backend_v02.sql`

## Tests

`npm run test:core` compiles and runs pure-domain tests for matching, application transitions, advanced filtering, and geocoding normalization. These tests do not require Supabase credentials.

A live Supabase test project is still required for true integration testing of Auth, RLS, RPC transitions, and API routes. Do not treat core-unit success as a substitute for that integration pass before production.

## Security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.
- Never commit `.env.local`.
- The geocoder is called only from the server and is cached.
- Direct authenticated-table writes are intentionally not granted by RLS policies; server routes are the mutation boundary.
- This is a serious backend foundation, but production launch should still add deployment-level rate limiting, monitoring, backups, abuse controls, and a dedicated integration-test environment.
