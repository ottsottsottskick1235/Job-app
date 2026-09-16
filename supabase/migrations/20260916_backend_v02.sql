-- Job App backend v0.2
-- Additive migration over the v0.1 prototype schema.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('worker','employer')),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'account_type', '') in ('worker','employer') then
    insert into public.profiles (id, account_type, full_name)
    values (
      new.id,
      new.raw_user_meta_data->>'account_type',
      nullif(trim(new.raw_user_meta_data->>'full_name'), '')
    )
    on conflict (id) do update set
      account_type = excluded.account_type,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table workers add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table workers add column if not exists preferred_employment_types text[] not null default '{}';
alter table workers add column if not exists preferred_workplace_types text[] not null default '{}';
alter table workers add column if not exists role_keywords text[] not null default '{}';
alter table workers add column if not exists updated_at timestamptz not null default now();
create unique index if not exists uq_workers_user_id on workers(user_id) where user_id is not null;
create index if not exists idx_workers_user_id on workers(user_id);

create table if not exists employer_memberships (
  employer_id uuid not null references employers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','recruiter','viewer')),
  created_at timestamptz not null default now(),
  primary key (employer_id, user_id)
);
create index if not exists idx_employer_memberships_user on employer_memberships(user_id);

create table if not exists employer_locations (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references employers(id) on delete cascade,
  name text not null,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  display_name text,
  geocode_provider text,
  geocode_place_id text,
  geocoded_at timestamptz,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_employer_locations_employer on employer_locations(employer_id);
create unique index if not exists uq_employer_default_location
  on employer_locations(employer_id) where is_default;

create table if not exists worker_locations (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  name text not null default 'Home',
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  display_name text,
  geocode_provider text,
  geocode_place_id text,
  geocoded_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_worker_locations_worker on worker_locations(worker_id);
create unique index if not exists uq_worker_primary_location
  on worker_locations(worker_id) where is_primary;

alter table jobs add column if not exists location_id uuid references employer_locations(id) on delete set null;
alter table jobs add column if not exists description text;
alter table jobs add column if not exists max_hourly_rate numeric(10,2);
alter table jobs add column if not exists currency text not null default 'CAD';
alter table jobs add column if not exists employment_type text;
alter table jobs add column if not exists workplace_type text;
alter table jobs add column if not exists end_date date;
alter table jobs add column if not exists closing_date date;
alter table jobs add column if not exists openings integer not null default 1;
alter table jobs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table jobs add column if not exists updated_at timestamptz not null default now();

alter table applications add column if not exists match_score numeric(5,2);
alter table applications add column if not exists match_breakdown jsonb not null default '{}'::jsonb;
alter table applications add column if not exists matcher_version text;
alter table applications add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_applications_match_score on applications(match_score desc);

create table if not exists application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('worker','employer','system')),
  from_status text,
  to_status text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_application_events_application on application_events(application_id, created_at);

create table if not exists matching_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('all','worker','job')),
  worker_id uuid references workers(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  matcher_version text not null,
  checked_pairs integer not null default 0,
  new_applications integer not null default 0,
  updated_applications integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_matching_runs_started on matching_runs(started_at desc);

create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  search_type text not null check (search_type in ('jobs','candidates','applications')),
  filters jsonb not null default '{}'::jsonb,
  sort text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name, search_type)
);
create index if not exists idx_saved_searches_user on saved_searches(user_id, search_type);

create table if not exists geocode_cache (
  query_key text primary key,
  query_text text not null,
  provider text not null,
  results jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_geocode_cache_expires on geocode_cache(expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keep timestamps current without relying on clients.
drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at before update on profiles
for each row execute function public.set_updated_at();

drop trigger if exists workers_set_updated_at on workers;
create trigger workers_set_updated_at before update on workers
for each row execute function public.set_updated_at();

drop trigger if exists employer_locations_set_updated_at on employer_locations;
create trigger employer_locations_set_updated_at before update on employer_locations
for each row execute function public.set_updated_at();

drop trigger if exists worker_locations_set_updated_at on worker_locations;
create trigger worker_locations_set_updated_at before update on worker_locations
for each row execute function public.set_updated_at();

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at before update on jobs
for each row execute function public.set_updated_at();

drop trigger if exists applications_set_updated_at on applications;
create trigger applications_set_updated_at before update on applications
for each row execute function public.set_updated_at();

drop trigger if exists saved_searches_set_updated_at on saved_searches;
create trigger saved_searches_set_updated_at before update on saved_searches
for each row execute function public.set_updated_at();

-- Defensive row-level security. Mutations are expected to go through authenticated
-- server routes; service-role access bypasses RLS only after application authorization.
alter table profiles enable row level security;
alter table workers enable row level security;
alter table worker_certifications enable row level security;
alter table worker_availability enable row level security;
alter table worker_locations enable row level security;
alter table employers enable row level security;
alter table employer_memberships enable row level security;
alter table employer_locations enable row level security;
alter table jobs enable row level security;
alter table job_required_certifications enable row level security;
alter table job_shifts enable row level security;
alter table applications enable row level security;
alter table application_events enable row level security;
alter table saved_searches enable row level security;

-- Read policies. Direct writes are intentionally omitted and therefore denied to anon/authenticated roles.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select to authenticated
using (id = auth.uid());

drop policy if exists workers_select_own on workers;
create policy workers_select_own on workers for select to authenticated
using (user_id = auth.uid());

drop policy if exists worker_certifications_select_own on worker_certifications;
create policy worker_certifications_select_own on worker_certifications for select to authenticated
using (exists (select 1 from workers w where w.id = worker_id and w.user_id = auth.uid()));

drop policy if exists worker_availability_select_own on worker_availability;
create policy worker_availability_select_own on worker_availability for select to authenticated
using (exists (select 1 from workers w where w.id = worker_id and w.user_id = auth.uid()));

drop policy if exists worker_locations_select_own on worker_locations;
create policy worker_locations_select_own on worker_locations for select to authenticated
using (exists (select 1 from workers w where w.id = worker_id and w.user_id = auth.uid()));

drop policy if exists employer_memberships_select_own on employer_memberships;
create policy employer_memberships_select_own on employer_memberships for select to authenticated
using (user_id = auth.uid());

drop policy if exists employers_select_member on employers;
create policy employers_select_member on employers for select to authenticated
using (exists (
  select 1 from employer_memberships m
  where m.employer_id = employers.id and m.user_id = auth.uid()
));

drop policy if exists employer_locations_select_member on employer_locations;
create policy employer_locations_select_member on employer_locations for select to authenticated
using (exists (
  select 1 from employer_memberships m
  where m.employer_id = employer_locations.employer_id and m.user_id = auth.uid()
));

drop policy if exists jobs_select_open_or_member on jobs;
create policy jobs_select_open_or_member on jobs for select to authenticated
using (
  status = 'open' or exists (
    select 1 from employer_memberships m
    where m.employer_id = jobs.employer_id and m.user_id = auth.uid()
  )
);

drop policy if exists job_required_certifications_select_visible_job on job_required_certifications;
create policy job_required_certifications_select_visible_job on job_required_certifications for select to authenticated
using (exists (select 1 from jobs j where j.id = job_id));

drop policy if exists job_shifts_select_visible_job on job_shifts;
create policy job_shifts_select_visible_job on job_shifts for select to authenticated
using (exists (select 1 from jobs j where j.id = job_id));

drop policy if exists applications_select_participant on applications;
create policy applications_select_participant on applications for select to authenticated
using (
  exists (select 1 from workers w where w.id = worker_id and w.user_id = auth.uid())
  or exists (
    select 1
    from jobs j
    join employer_memberships m on m.employer_id = j.employer_id
    where j.id = job_id and m.user_id = auth.uid()
  )
);

drop policy if exists application_events_select_participant on application_events;
create policy application_events_select_participant on application_events for select to authenticated
using (exists (select 1 from applications a where a.id = application_id));

drop policy if exists saved_searches_select_own on saved_searches;
create policy saved_searches_select_own on saved_searches for select to authenticated
using (user_id = auth.uid());

-- Atomic application transition + event write. Only the service role may execute it;
-- application code validates actor permissions and the state machine first.
create or replace function public.transition_application_service(
  p_application_id uuid,
  p_expected_status text,
  p_to_status text,
  p_actor_user_id uuid,
  p_actor_type text,
  p_reason text default null
)
returns applications
language plpgsql
security definer set search_path = public
as $$
declare
  v_application applications%rowtype;
begin
  update applications
  set
    status = p_to_status,
    employer_interest_at = case
      when p_to_status = 'employer_interested' then coalesce(employer_interest_at, now())
      else employer_interest_at
    end,
    worker_decision_at = case
      when p_to_status in ('worker_accepted','worker_declined') then now()
      else worker_decision_at
    end
  where id = p_application_id and status = p_expected_status
  returning * into v_application;

  if not found then
    raise exception 'APPLICATION_STATE_CHANGED' using errcode = 'P0001';
  end if;

  insert into application_events (
    application_id, actor_user_id, actor_type, from_status, to_status, reason
  ) values (
    p_application_id, p_actor_user_id, p_actor_type, p_expected_status, p_to_status, p_reason
  );

  return v_application;
end;
$$;

revoke all on function public.transition_application_service(uuid,text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.transition_application_service(uuid,text,text,uuid,text,text) to service_role;

-- Companies can be created before a physical location is added in v0.2.
alter table employers alter column latitude drop not null;
alter table employers alter column longitude drop not null;
alter table employers add column if not exists updated_at timestamptz not null default now();

drop trigger if exists employers_set_updated_at on employers;
create trigger employers_set_updated_at before update on employers
for each row execute function public.set_updated_at();

-- Internal operational tables are service-only.
alter table matching_runs enable row level security;
alter table geocode_cache enable row level security;

-- Search and integrity indexes/constraints.
create extension if not exists pg_trgm;
create index if not exists idx_jobs_employer_status on jobs(employer_id, status);
create index if not exists idx_jobs_category_status on jobs(category, status);
create index if not exists idx_jobs_pay on jobs(hourly_rate);
create index if not exists idx_jobs_employment_type on jobs(employment_type) where employment_type is not null;
create index if not exists idx_jobs_workplace_type on jobs(workplace_type) where workplace_type is not null;
create index if not exists idx_jobs_closing_date on jobs(closing_date) where closing_date is not null;
create index if not exists idx_jobs_title_trgm on jobs using gin(title gin_trgm_ops);
create index if not exists idx_workers_roles_gin on workers using gin(preferred_roles);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_employment_type_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_employment_type_check CHECK (
      employment_type is null or employment_type in ('full_time','part_time','contract','temporary','seasonal','casual','internship')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_workplace_type_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_workplace_type_check CHECK (
      workplace_type is null or workplace_type in ('on_site','hybrid','remote')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_pay_range_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_pay_range_check CHECK (max_hourly_rate is null or max_hourly_rate >= hourly_rate);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_openings_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_openings_check CHECK (openings > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_date_range_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_date_range_check CHECK (end_date is null or start_date is null or end_date >= start_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_match_score_check') THEN
    ALTER TABLE applications ADD CONSTRAINT applications_match_score_check CHECK (match_score is null or (match_score >= 0 and match_score <= 100));
  END IF;
END $$;
