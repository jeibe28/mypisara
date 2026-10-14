-- Deleted boards stay recoverable for 30 days before they are purged.
alter table boards add column if not exists deleted_at timestamptz;
create index if not exists boards_owner_deleted_idx on boards(owner_id, deleted_at);
