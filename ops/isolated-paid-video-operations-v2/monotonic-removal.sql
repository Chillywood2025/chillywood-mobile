-- Fresh inactive successor assembly only, after operations.sql and before the
-- existing CREATE revoke/finalizer. Never replace the frozen media functions.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.paid_video_removals (
 resource_id uuid primary key references sandbox_commerce_v1.resources,
 upload_id uuid not null references sandbox_commerce_v1.paid_video_uploads,
 asset_id uuid not null, incarnation uuid not null, sha256 text not null,
 object_version text, moderation_record_id uuid, reason text not null,
 removed_at timestamptz not null default clock_timestamp()
);
alter table sandbox_commerce_v1.paid_video_removals enable row level security;
alter table sandbox_commerce_v1.paid_video_removals force row level security;
create policy core_owner on sandbox_commerce_v1.paid_video_removals for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.paid_video_removals from public,anon,authenticated,service_role,sbx_v1_operator;
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_removals
 for each row execute function sandbox_commerce_v1.protect_resource_identity();

-- All admission/removal writes serialize on this immutable parent identity.
-- NOWAIT aborts competing transactions; it never falls through on contention.
create function sandbox_commerce_v1.paid_video_removal_guard()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare rid uuid; u sandbox_commerce_v1.paid_video_uploads; positive boolean:=false; removed boolean;
begin
 if tg_table_name='paid_video_moderation' then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=new.upload_id;
  rid:=u.resource_id; positive:=new.decision<>'removed';
 elsif tg_table_name='paid_video_uploads' then
  rid:=new.resource_id; positive:=new.moderation<>'removed';
 elsif tg_table_name='delivery_assets' then
  rid:=new.resource_id; positive:=new.moderation<>'removed';
 elsif tg_table_name='resources' then rid:=new.id; positive:=new.status='published';
 elsif tg_table_name='offers' then rid:=new.resource_id; positive:=new.status='published';
 else raise exception 'paid_video_removal_guard_context'; end if;
 perform 1 from sandbox_commerce_v1.resources where id=rid for update nowait;
 if not found then raise exception 'paid_video_removal_guard_resource'; end if;
 removed:=exists(select 1 from sandbox_commerce_v1.paid_video_removals where resource_id=rid)
  or exists(select 1 from sandbox_commerce_v1.paid_video_uploads x where x.resource_id=rid and x.moderation='removed')
  or exists(select 1 from sandbox_commerce_v1.paid_video_moderation m
    join sandbox_commerce_v1.paid_video_uploads x on x.id=m.upload_id where x.resource_id=rid and m.decision='removed');
 if positive and removed then raise exception 'paid_video_removed_history_permanent' using errcode='42501'; end if;
 return new;
end $$;

create function sandbox_commerce_v1.paid_video_removal_record()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads; journal uuid;
begin
 if tg_table_name='paid_video_moderation' then
  if new.decision<>'removed' then return new; end if;
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=new.upload_id; journal:=new.id;
 elsif tg_table_name='paid_video_uploads' then
  if new.moderation<>'removed' then return new; end if; u:=new;
 else raise exception 'paid_video_removal_record_context'; end if;
 -- The BEFORE guard holds the resource lock through commit, including the
 -- absent tombstone case. Repeated negatives retain the FIRST removal fact.
 insert into sandbox_commerce_v1.paid_video_removals(resource_id,upload_id,asset_id,incarnation,sha256,object_version,moderation_record_id,reason)
 values(u.resource_id,u.id,u.asset_id,u.incarnation,u.expected_sha256,u.object_version,journal,tg_table_name)
 on conflict(resource_id) do nothing;
 return new;
end $$;
create trigger paid_video_removal_guard before insert on sandbox_commerce_v1.paid_video_moderation
 for each row execute function sandbox_commerce_v1.paid_video_removal_guard();
create trigger paid_video_removal_record after insert on sandbox_commerce_v1.paid_video_moderation
 for each row execute function sandbox_commerce_v1.paid_video_removal_record();
create trigger paid_video_removal_guard before insert or update on sandbox_commerce_v1.paid_video_uploads
 for each row execute function sandbox_commerce_v1.paid_video_removal_guard();
create trigger paid_video_removal_record after insert or update on sandbox_commerce_v1.paid_video_uploads
 for each row execute function sandbox_commerce_v1.paid_video_removal_record();
create trigger paid_video_removal_guard before insert or update on sandbox_commerce_v1.delivery_assets
 for each row execute function sandbox_commerce_v1.paid_video_removal_guard();
create trigger paid_video_removal_guard before update on sandbox_commerce_v1.resources
 for each row execute function sandbox_commerce_v1.paid_video_removal_guard();
create trigger paid_video_removal_guard before insert or update on sandbox_commerce_v1.offers
 for each row execute function sandbox_commerce_v1.paid_video_removal_guard();
revoke all on function sandbox_commerce_v1.paid_video_removal_guard(),sandbox_commerce_v1.paid_video_removal_record()
 from public,anon,authenticated,service_role,sbx_v1_operator;
-- The authenticated reviewer boundary is the operating path. Revocation is
-- defense in depth: the table invariant also constrains legacy core reuse.
revoke execute on function sandbox_commerce_v1.paid_video_moderate(uuid,text,text) from sbx_v1_operator;
reset role;
