-- Folders for organising boards. A board lives in at most one folder.
alter table user_preferences
  add column if not exists folders jsonb not null default '[]'::jsonb check (jsonb_typeof(folders) = 'array'),
  add column if not exists board_folders jsonb not null default '{}'::jsonb check (jsonb_typeof(board_folders) = 'object');
