// Isolated SQL fixture, not deployment/full-chain proof. Current production
// session, role, creator-tool, legal, visibility, RLS and scan-queue functions run.
// Infrastructure tables and finite Premium provider backing are controlled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export { PGlite };
export const root = process.cwd();
export const read = (path, dir=root) => fs.readFileSync(`${dir}/${path}`, 'utf8');
export function sqlFunction(file, name, dir=root) {
  const source=read(file,dir), escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=source.match(new RegExp(`create(?: or replace)? function public\\.\\"?${escaped}\\"?\\([\\s\\S]*?\\$\\$;`,'i'));
  assert.ok(m,`SQL function ${name} in ${file}`); return m[0];
}
export function sqlPolicy(file,name,dir=root) {
  const source=read(file,dir), start=source.indexOf(`create policy "${name}"`);
  assert.ok(start>=0); return source.slice(start,source.indexOf(';',start)+1);
}
export function table(file,name) {
  const source=read(file), escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=source.match(new RegExp(`create table(?: if not exists)? public\\.\\"?${escaped}\\"? \\([\\s\\S]*?\\n\\);`));
  assert.ok(m,`DDL ${name}`); return m[0];
}
export const ids = {
  owner:'10000000-0000-4000-8000-000000000001',
  follower:'20000000-0000-4000-8000-000000000002',
  outsider:'30000000-0000-4000-8000-000000000003',
  staff:'40000000-0000-4000-8000-000000000004',
  requester:'50000000-0000-4000-8000-000000000005',
  protected:'60000000-0000-4000-8000-000000000006',
};
export const sessionId = user => user.replace(/.$/u,'0');
export async function makeFixture() {
  const db = new PGlite();
  await db.exec(`
    set check_function_bodies=false;
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
    grant usage on schema auth to anon,authenticated,service_role;
    create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
    create table public.fixture_accounts(user_id text primary key,restricted boolean default false,deleted boolean default false,premium boolean default true,staff_role text,protected boolean default false);
    create table public.account_deletion_requests(user_id uuid,status text,restore_deadline timestamptz,delete_after timestamptz);
    create table public.platform_role_memberships(user_id text,role text,status text,expires_at timestamptz);
    create table public.platform_staff_permission_grants(target_user_id text,permission_key text,status text,expires_at timestamptz);
    create table public.user_entitlements(user_id text,entitlement_key text,status text,revoked_at timestamptz,expires_at timestamptz);
    create function public.premium_subject_has_finite_authority_internal(text) returns boolean language sql stable security definer as $$select coalesce((select premium from public.fixture_accounts where user_id=$1),false)$$;
    create table public.wave1_legal_document_versions(document_key text,capability text,active boolean,market text,version text,effective_at timestamptz);
    create table public.wave1_legal_acceptances(user_id uuid,session_generation text,document_key text,document_version text,market text,capability text,role_key text,invalidated_at timestamptz);
    insert into public.wave1_legal_document_versions select key,'account',true,'UNITED_STATES','fixture-current',now()-interval '1 day' from unnest(array['terms','privacy','community_guidelines']) key;
    create function public.assert_account_private_feature_allowed(text,text) returns void language plpgsql security definer as $$begin if public.is_account_access_restricted($1) or public.is_account_deletion_scheduled($1) then raise exception 'account_restricted'; end if; end$$;
    create table public.user_friendships(user_low_id text,user_high_id text,status text);
    create table public.creator_channel_subscriptions(creator_id uuid,subscriber_id uuid,status text,current_period_end timestamptz,revoked_at timestamptz,expired_at timestamptz);
    create table public.videos(id uuid primary key,owner_id uuid,visibility text,moderation_status text,scan_status text default 'clean',deleted_at timestamptz,quarantined_at timestamptz);
  `);
  await db.exec(sqlFunction('supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql','is_account_access_restricted'));
  await db.exec(sqlFunction('supabase/migrations/20260603014500_self_service_account_deletion_30_day_restore.sql','is_account_deletion_scheduled'));
  await db.exec(sqlFunction('supabase/migrations/20260624231731_account_purge_deidentification_proof.sql','account_deletion_public_hidden_reason'));
  await db.exec(sqlFunction('supabase/migrations/202608250002_whole_app_media_authority_closure.sql','media_scan_public_safe'));
  await db.exec(sqlFunction('supabase/migrations/20260826055737_exact_current_session_not_after_authority.sql','wave1_session_authority_readback'));
  await db.exec(sqlFunction('supabase/migrations/202608250001_chilly_chat_room_authority_closure.sql','whole_app_exact_current_session_authority_internal'));
  for(const name of ['platform_exact_current_session_authority_internal','platform_subject_has_role_internal','has_platform_role','is_platform_owner_user']) await db.exec(sqlFunction('supabase/migrations/202608250004_platform_role_exact_subject_closure.sql',name));
  for(const name of ['platform_staff_normalize_permission_key','platform_admin_scope_legacy_aliases']) await db.exec(sqlFunction('supabase/migrations/20260625184725_admin_role_scope_permissions.sql',name));
  await db.exec(sqlFunction('supabase/migrations/202608250004_platform_role_exact_subject_closure.sql','has_platform_permission'));
  await db.exec(read('supabase/migrations/202604190005_create_channel_audience_relationships.sql'));
  await db.exec(sqlFunction('supabase/migrations/20260624125951_wave4_abuse_rate_limit_controls.sql','has_channel_audience_block_between'));
  await db.exec(read('supabase/migrations/20260624144500_wave4_profile_platform_blocked_route_policy.sql'));
  for(const name of ['channel_followers_insert_own','channel_followers_select_self_owner_or_operator','channel_audience_requests_insert_requester','channel_audience_requests_select_requester_owner_or_operator']) {
    const relation=name.startsWith('channel_followers')?'channel_followers':'channel_audience_requests';
    await db.exec(`drop policy "${name}" on public.${relation};`+sqlPolicy('supabase/migrations/202605200002_owner_superuser_scoped_staff_legal_evidence.sql',name));
  }
  const publicProfile=sqlFunction('supabase/migrations/20260530191115_media_malware_scanning_pipeline.sql','read_public_channel_profile');
  const columns=publicProfile.match(/returns table \(([\s\S]*?)\)\nlanguage/)[1];
  await db.exec(`create table public.user_profiles(${columns},profile_avatar_scan_status text,profile_background_scan_status text,updated_at timestamptz default now());
    alter table public.user_profiles enable row level security; grant select on public.user_profiles to anon,authenticated;
  `);
  await db.exec(read('supabase/migrations/20260617235547_profile_platform_access_visibility.sql'));
  await db.exec(`alter function public.resolve_profile_platform_visibility_access(text,text,text) rename to resolve_profile_platform_visibility_access_profile_backed_v1;`);
  for(const name of ['resolve_profile_platform_visibility_access','resolve_profile_visibility_access','resolve_platform_visibility_access','can_view_profile_content']) await db.exec(sqlFunction('supabase/migrations/20260907183000_pre_activation_rachi_official_visibility_authority.sql',name));
  for(const name of ['wave1_legal_document_configuration_complete_internal','money_purchase_intent_session_authorized_internal','wave1_current_caller_authority_internal','has_active_premium_creator_tool_access']) await db.exec(sqlFunction('supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql',name));
  await db.exec(sqlPolicy('supabase/migrations/202605200002_owner_superuser_scoped_staff_legal_evidence.sql','user_profiles_select_self_public_or_owner_hidden'));
  await db.exec(publicProfile);
  const brandBase='supabase/migrations/202605240001_platform_brand_studio_assets.sql';
  await db.exec(table(brandBase,'platform_brand_assets'));
  await db.exec(table(brandBase,'platform_brand_profiles'));
  await db.exec(`alter table public.platform_brand_assets add column scan_status text default 'pending_scan', add column quarantined_at timestamptz,
    add column scan_provider text,add column scan_result text,add column scanned_at timestamptz,add column scan_error text;
    alter table public.platform_brand_assets enable row level security;
    alter table public.platform_brand_profiles enable row level security;
    grant select on public.platform_brand_assets to anon;
    grant select,insert,update,delete on public.platform_brand_assets,public.platform_brand_profiles to authenticated;
  `);
  await db.exec(table('supabase/migrations/202605240002_platform_brand_studio_review_workflow.sql','platform_brand_asset_review_events'));
  await db.exec(sqlFunction('supabase/migrations/202608250002_whole_app_media_authority_closure.sql','guard_platform_brand_asset_client_update'));
  await db.exec(sqlFunction('supabase/migrations/20260530191115_media_malware_scanning_pipeline.sql','queue_platform_brand_asset_scan'));
  await db.exec(`create trigger guard_platform_brand_asset_client_update before update on public.platform_brand_assets for each row execute function public.guard_platform_brand_asset_client_update();
    create trigger queue_platform_brand_asset_scan_before before insert or update on public.platform_brand_assets for each row execute function public.queue_platform_brand_asset_scan();
    alter table public.platform_brand_assets add constraint platform_brand_assets_published_malware_clean_check check (asset_state <> 'published' or public.media_scan_public_safe(scan_status));`);
  await db.exec(sqlFunction('supabase/migrations/20260615142151_platform_brand_owner_publish_assets_rpc.sql','publish_platform_brand_profile_assets'));
  await db.exec(sqlFunction('supabase/migrations/20260827233000_social_attachment_storage_policy_composition_closure.sql','platform_brand_asset_row_access_allowed'));
  await db.exec(sqlFunction('supabase/migrations/20260827233000_social_attachment_storage_policy_composition_closure.sql','platform_brand_asset_public_safe'));
  await db.exec(sqlPolicy('supabase/migrations/20260827233000_social_attachment_storage_policy_composition_closure.sql','platform_brand_assets_select_owner_or_public_safe'));
  await db.exec(sqlPolicy(brandBase,'platform_brand_profiles_select_owner'));
  await db.exec(sqlPolicy('supabase/migrations/202606010001_premium_creator_tool_guards.sql','platform_brand_profiles_write_owner'));
  await db.exec(sqlFunction('supabase/migrations/202605240003_platform_brand_studio_reference_casts.sql','assert_platform_brand_profile_references'));
  await db.exec(`create trigger assert_platform_brand_profile_references before insert or update on public.platform_brand_profiles for each row execute function public.assert_platform_brand_profile_references();`);
  await db.exec(sqlFunction('supabase/migrations/202605240002_platform_brand_studio_review_workflow.sql','read_public_platform_brand_profile'));
  for(const id of Object.values(ids)) {
    await db.query('insert into public.fixture_accounts(user_id) values($1)',[id]);
    await db.query("insert into public.user_entitlements values($1,'premium','active',null,now()+interval '1 day')",[id]);
    await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[id]);
    await db.query('insert into auth.sessions values($1,$2,null)',[sessionId(id),id]);
    await db.query("insert into public.wave1_legal_acceptances select $1::uuid,$2,document_key,version,market,capability,'member',null from public.wave1_legal_document_versions",[id,sessionId(id)]);
    await db.query("insert into public.user_profiles(user_id,username,display_name,tagline,profile_access_visibility,platform_access_visibility,follower_surface_enabled) values($1,'creator','Public Name','Public Tagline','private','public',true)",[id]);
  }
  await db.query("insert into public.platform_role_memberships values($1,'operator','active',null),($2,'owner','active',null)",[ids.staff,ids.protected]);
  const as = async(role,id,sql,params=[])=> {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:id,session_id:id?sessionId(id):undefined})]);
    await db.exec(`set role ${role}`);
    try{return await db.query(sql,params);}finally{await db.exec("reset role; select set_config('request.jwt.claims','{}',false)");}
  };
  const user=(id,sql,params=[])=>as('authenticated',id,sql,params);
  return {db,as,user};
}
