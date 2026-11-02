-- Control-plane reservation ledger only. This creates no host, worker, secret,
-- activation, grant to runtime/API roles, or provider integration.
create table private.creator_clip_scale_ledger (
 pool_id text primary key check(pool_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
 revision bigint not null default 0 check(revision >= 0),
 state jsonb not null check(jsonb_typeof(state)='object'),
 updated_at timestamptz not null default clock_timestamp()
);
alter table private.creator_clip_scale_ledger enable row level security;
alter table private.creator_clip_scale_ledger force row level security;
revoke all on private.creator_clip_scale_ledger from public,anon,authenticated,service_role;
comment on table private.creator_clip_scale_ledger is
 'Disabled clip scaling control-plane ledger. Runtime workers have no access. A separately authorized trusted DB adapter persists reservations before provider dispatch; unknown operations retain capacity and cost reservations.';
