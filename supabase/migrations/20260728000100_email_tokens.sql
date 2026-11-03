-- One-time links sent by e-mail: password reset and e-mail confirmation.
-- Only the token hash is stored. Only the server (table owner) reads it.
create table if not exists auth.email_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('reset', 'verify')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists email_tokens_user_idx on auth.email_tokens (user_id, purpose, created_at);
revoke all on auth.email_tokens from anon, authenticated;
