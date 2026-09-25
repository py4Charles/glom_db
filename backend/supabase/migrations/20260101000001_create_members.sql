-- Members directory schema.
--
-- Authorization model: this table has Row Level Security ENABLED with no
-- policies, which is Postgres "deny all" for the anon and authenticated roles.
-- The only door is the Express server, which connects with the service_role key
-- and performs its own checks.
--
-- Enabling RLS is still required even though we never use RLS. Supabase also
-- exposes PostgREST at /rest/v1, and PostgREST authenticates with the anon key.
-- With RLS disabled, anyone holding the anon key could read this table directly
-- and bypass Express entirely. RLS-enabled-with-no-policies closes that door.

create type gender_enum as enum ('male', 'female', 'prefer_not_to_say');

create type marital_status_enum as enum (
  'single',
  'married',
  'divorced',
  'widowed',
  'prefer_not_to_say'
);

create table members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_name text,
  last_name text not null,
  preferred_name text,
  suffix text,
  title text,
  gender gender_enum not null,
  date_of_birth date,
  marital_status marital_status_enum not null,
  photo_url text,
  phone_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint members_names_present check (
    btrim(first_name) <> '' and btrim(last_name) <> ''
  )
);

alter table members enable row level security;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger members_set_updated_at
  before update on members
  for each row execute function set_updated_at();

-- No indexes yet, deliberately. At directory scale the whole table is a
-- sequential scan either way, and an index is a write cost paid on every
-- insert. Add them when a query plan shows a sequential scan on real data --
-- most likely lower(last_name) for the default sort, and marital_status/gender
-- for the filter selects.
