-- Point-in-time copies of a board, so earlier states can be restored.
create table if not exists board_versions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  owner_id uuid not null references "user"(id) on delete cascade,
  title text not null,
  background text not null,
  cards jsonb not null,
  trash jsonb not null,
  scene_order jsonb not null,
  revision integer not null,
  created_at timestamptz not null default now()
);
create index if not exists board_versions_board_idx on board_versions(board_id, created_at desc);
alter table board_versions enable row level security;
alter table board_versions force row level security;
drop policy if exists own_board_versions on board_versions;
create policy own_board_versions on board_versions for all
  using(owner_id = public.current_mypisara_owner())
  with check(owner_id = public.current_mypisara_owner());
grant select, insert, update, delete on board_versions to mypisara_app;
