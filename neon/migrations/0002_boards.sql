create table if not exists "rateLimit" (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  count integer not null,
  "lastRequest" bigint not null
);

-- Restricted role used for all board queries. It cannot bypass row-level security.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mypisara_app') then
    create role mypisara_app nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
end
$$;
grant mypisara_app to current_user;
grant usage on schema public to mypisara_app;

create or replace function current_mypisara_owner()
returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('app.owner_id', true), '')::uuid;
$$;

create table boards (
  id uuid primary key,
  owner_id uuid not null references "user"(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 200),
  background text not null default 'default'
    check(background in ('default','paper','slate','sage','sand','blue')),
  cards jsonb not null default '[]' check(jsonb_typeof(cards) = 'array'),
  trash jsonb not null default '[]' check(jsonb_typeof(trash) = 'array'),
  scene_order jsonb not null default '[]' check(jsonb_typeof(scene_order) = 'array'),
  revision integer not null default 1 check(revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index boards_owner_updated_idx on boards(owner_id, updated_at desc);
alter table boards enable row level security;
alter table boards force row level security;
create policy own_boards on boards for all
  using(owner_id = public.current_mypisara_owner())
  with check(owner_id = public.current_mypisara_owner());
grant select, insert, update, delete on boards to mypisara_app;
