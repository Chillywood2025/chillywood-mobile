-- Server-owned iOS PushKit token and APNs delivery foundation.
-- This migration is additive only. It does not enable VoIP dispatch, native
-- calls, ordinary push, room authority, purchases, money, payouts, or cash-out.

set check_function_bodies = false;

create table if not exists public."user_voip_push_tokens" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null references auth.users(id) on delete cascade,
  "install_id" text not null,
  "token" text not null,
  "token_hash" text not null,
  "token_fingerprint" text not null,
  "apns_environment" text not null,
  "app_version" text,
  "build_version" text,
  "enabled" boolean default true not null,
  "last_seen_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "user_voip_push_tokens_pkey" primary key ("id"),
  constraint "user_voip_push_tokens_install_id_check"
    check (length(btrim("install_id")) between 8 and 200),
  constraint "user_voip_push_tokens_token_check"
    check ("token" ~ '^[0-9a-fA-F]{64,200}$'),
  constraint "user_voip_push_tokens_token_hash_check"
    check ("token_hash" ~ '^[0-9a-f]{64}$'),
  constraint "user_voip_push_tokens_fingerprint_check"
    check ("token_fingerprint" ~ '^[0-9a-f]{12}$'),
  constraint "user_voip_push_tokens_environment_check"
    check ("apns_environment" in ('development', 'production')),
  constraint "user_voip_push_tokens_revocation_check"
    check (
      ("enabled" = true and "revoked_at" is null)
      or ("enabled" = false and "revoked_at" is not null)
    )
);

create unique index if not exists "user_voip_push_tokens_environment_hash_unique"
  on public."user_voip_push_tokens" using btree ("apns_environment", "token_hash");

create index if not exists "user_voip_push_tokens_user_enabled_idx"
  on public."user_voip_push_tokens" using btree ("user_id", "enabled", "last_seen_at" desc);

create index if not exists "user_voip_push_tokens_active_install_idx"
  on public."user_voip_push_tokens" using btree ("user_id", "install_id", "apns_environment", "last_seen_at" desc)
  where "enabled" = true and "revoked_at" is null;

drop trigger if exists "user_voip_push_tokens_touch_updated_at" on public."user_voip_push_tokens";
create trigger "user_voip_push_tokens_touch_updated_at"
before update on public."user_voip_push_tokens"
for each row execute function public."touch_notification_updated_at"();

create table if not exists public."voip_push_delivery_attempts" (
  "id" uuid default gen_random_uuid() not null,
  "dispatch_key" text not null,
  "call_invite_id" uuid not null references public."chat_call_invites"(id) on delete cascade,
  "recipient_user_id" uuid not null references auth.users(id) on delete cascade,
  "voip_push_token_id" uuid references public."user_voip_push_tokens"(id) on delete set null,
  "apns_environment" text not null,
  "provider_message_id" text,
  "provider_status_code" integer,
  "status" text not null,
  "error_code" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "voip_push_delivery_attempts_pkey" primary key ("id"),
  constraint "voip_push_delivery_attempts_dispatch_key_check"
    check (length(btrim("dispatch_key")) between 16 and 160),
  constraint "voip_push_delivery_attempts_environment_check"
    check ("apns_environment" in ('development', 'production')),
  constraint "voip_push_delivery_attempts_status_check"
    check ("status" in ('attempted', 'sent', 'failed', 'skipped')),
  constraint "voip_push_delivery_attempts_provider_status_check"
    check ("provider_status_code" is null or "provider_status_code" between 100 and 599),
  constraint "voip_push_delivery_attempts_error_code_check"
    check ("error_code" is null or length("error_code") <= 120)
);

create unique index if not exists "voip_push_delivery_attempts_dispatch_unique"
  on public."voip_push_delivery_attempts" using btree ("dispatch_key");

create index if not exists "voip_push_delivery_attempts_invite_idx"
  on public."voip_push_delivery_attempts" using btree ("call_invite_id", "created_at" desc);

create index if not exists "voip_push_delivery_attempts_recipient_idx"
  on public."voip_push_delivery_attempts" using btree ("recipient_user_id", "created_at" desc);

alter table public."user_voip_push_tokens" enable row level security;
alter table public."voip_push_delivery_attempts" enable row level security;

-- No client policies are intentional. Raw PushKit tokens and provider delivery
-- evidence remain server-owned even for the user associated with a row.
revoke all on table public."user_voip_push_tokens" from public, anon, authenticated;
revoke all on table public."voip_push_delivery_attempts" from public, anon, authenticated;
grant all on table public."user_voip_push_tokens" to postgres, service_role;
grant all on table public."voip_push_delivery_attempts" to postgres, service_role;

comment on table public."user_voip_push_tokens" is
  'Server-owned PushKit device tokens. Raw tokens are never client-readable; authenticated lifecycle requests are mediated by the ios-voip-push-tokens Edge Function.';

comment on column public."user_voip_push_tokens"."token" is
  'Raw PushKit token required for APNs VoIP delivery. Restricted to postgres and service_role; never return or log this value.';

comment on table public."voip_push_delivery_attempts" is
  'Sanitized APNs VoIP delivery evidence. Contains HTTP status and provider identifiers but no token, JWT, APNs key, private payload, or provider credential.';
