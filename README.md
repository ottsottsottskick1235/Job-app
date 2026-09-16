# Job Match Core

A deliberately unstyled MVP foundation for a two-sided hiring marketplace.

## What it does

- Workers create one reusable work profile.
- Employers create jobs with hard requirements.
- The matching engine checks both sides' constraints.
- Compatible workers are automatically entered into the job's application pool when either a worker or job is created.
- Employers can mark an application as interested.
- Workers can accept or decline that interest.
- The system does not rank workers or employers. It only determines compatibility.

## Stack

- Next.js + TypeScript
- Supabase/Postgres
- Zod validation

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the values.
4. Run:

```bash
npm install
npm run dev
```

5. Open `http://localhost:3000`.

## Prototype flow

1. Create an employer at `/employer`.
2. Create a job for that employer at `/employer`.
3. Create a worker at `/worker`.
4. Matching runs automatically after worker/job creation. `/matches` is included as a manual re-run/debug tool.
5. Review applications through `GET /api/applications` or the Supabase table editor.
6. Employer marks interest with `POST /api/applications/:id/interest`.
7. Worker accepts or declines with `POST /api/applications/:id/worker-decision`.

## Matching rules in V1

A worker matches a job only when all hard requirements pass:

- Job category is in the worker's preferred roles.
- Job hourly pay meets the worker's minimum.
- Worker experience meets the job minimum.
- Job location is within the worker's maximum travel distance.
- Worker possesses every required certification.
- Required certifications are not expired by the job start date.
- Worker availability covers every required job shift.
- Job weekly hours fit inside the worker's requested weekly-hours range, when those limits are supplied.

The match engine lives in `lib/matching.ts` and is intentionally independent of the database layer.

## Important MVP limitation

Authentication is intentionally not implemented yet. Server API routes use the Supabase service role key, so this should only be used as a local/private prototype until auth and row-level security are added.
