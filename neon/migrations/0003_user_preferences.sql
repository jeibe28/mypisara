create table if not exists user_preferences (
  user_id uuid primary key references "user"(id) on delete cascade,
  theme text not null default 'system' check(theme in ('light','dark','system')),
  size text not null default 'medium' check(size in ('small','medium','large')),
  accent text not null default 'yellow' check(accent in ('yellow','blue','green','neutral')),
  updated_at timestamptz not null default now()
);
