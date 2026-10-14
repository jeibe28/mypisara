-- Favorites and dashboard layout follow the account across devices.
alter table user_preferences
  add column if not exists favorites jsonb not null default '[]'::jsonb check (jsonb_typeof(favorites) = 'array'),
  add column if not exists board_sort text not null default 'recent' check (board_sort in ('recent', 'name', 'cards')),
  add column if not exists board_layout text not null default 'grid' check (board_layout in ('grid', 'list'));
