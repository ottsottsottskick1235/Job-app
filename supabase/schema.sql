create extension if not exists pgcrypto;

create table if not exists employers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  email text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now()
);

create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  preferred_roles text[] not null default '{}',
  min_hourly_rate numeric(10,2) not null default 0,
  max_travel_km numeric(10,2) not null default 25,
  min_weekly_hours integer,
  max_weekly_hours integer,
  experience_months integer not null default 0,
  latitude double precision not null,
  longitude double precision not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists worker_certifications (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  name text not null,
  expires_on date,
  unique(worker_id, name)
);

create table if not exists worker_availability (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references employers(id) on delete cascade,
  title text not null,
  category text not null,
  hourly_rate numeric(10,2) not null,
  weekly_hours integer,
  min_experience_months integer not null default 0,
  latitude double precision not null,
  longitude double precision not null,
  start_date date,
  status text not null default 'open' check (status in ('open','paused','closed')),
  created_at timestamptz not null default now()
);

create table if not exists job_required_certifications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  name text not null,
  unique(job_id, name)
);

create table if not exists job_shifts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  status text not null default 'submitted' check (
    status in ('submitted','employer_interested','worker_accepted','worker_declined','withdrawn','hired','rejected')
  ),
  match_reasons jsonb not null default '[]'::jsonb,
  matched_at timestamptz not null default now(),
  employer_interest_at timestamptz,
  worker_decision_at timestamptz,
  unique(worker_id, job_id)
);

create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_workers_active on workers(active);
create index if not exists idx_applications_job on applications(job_id);
create index if not exists idx_applications_worker on applications(worker_id);
