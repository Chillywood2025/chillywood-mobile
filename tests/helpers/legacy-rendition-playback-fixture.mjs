import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const binding = read('supabase/migrations/20260827223000_creator_video_rendition_source_binding_closure.sql');
const storage = read('supabase/migrations/20260827224000_creator_video_storage_owner_authority_closure.sql');
const original = read('supabase/migrations/20260623170000_creator_media_scan_safe_playback_resolver.sql');
const commerce = read('supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql');
export const candidate = read('supabase/migrations/20261025192059_legacy_rendition_playback_authority.sql');
export const ids = {
  video: 'a1000000-0000-4000-8000-000000000001',
  owner: 'a2000000-0000-4000-8000-000000000001',
  viewer: 'a2000000-0000-4000-8000-000000000002',
  rendition: 'a3000000-0000-4000-8000-000000000001',
};

export function definition(source, name) {
  const match = new RegExp(`create (?:or replace )?function (?:public|private)\\."?${name}"?\\s*\\(`, 'i').exec(source);
  if (!match) throw Error(`Missing function ${name}`);
  const start = match.index;
  const delimiter = /\$[a-zA-Z_0-9]*\$/.exec(source.slice(start));
  const end = source.indexOf(`${delimiter[0]};`, start + delimiter.index + delimiter[0].length);
  if (end < 0) throw Error(`Unterminated function ${name}`);
  return source.slice(start, end + delimiter[0].length + 1);
}

// Execute the real legacy resolver, public wrapper, claim predicates/triggers,
// Storage gate and candidate SQL. Commerce/session/Premium prerequisites are
// explicitly controlled doubles; the full-schema pgTAP test covers real parent
// authorization. No fixture connects to a provider or retrieves media bytes.
export async function createLegacyRenditionFixture() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid
      $$;
      create table public.videos (
        id uuid primary key, owner_id uuid, title text, visibility text default 'public',
        moderation_status text default 'clean', scan_status text default 'clean',
        quarantined_at timestamptz, storage_object_key text, storage_path text, playback_url text
      );
      create table public.video_renditions (
        id uuid primary key, video_id uuid references public.videos(id) on delete cascade,
        owner_id uuid, quality_label text default '360p', status text default 'ready',
        access_tier text default 'free', scan_status text default 'clean', quarantined_at timestamptz,
        storage_bucket text default 'creator-videos', storage_path text, manifest_path text,
        width int, height int, fps numeric, bitrate_kbps int, codec text, container text,
        error_message text, updated_at timestamptz default now()
      );
      create table public.media_rendition_output_path_claims (
        output_path text primary key, rendition_kind text, rendition_id uuid
      );
      create table storage.objects(bucket_id text,name text);
      alter table public.video_renditions enable row level security;
      alter table storage.objects enable row level security;
      grant select on public.video_renditions,storage.objects to anon,authenticated;
      create function public.has_platform_role(text[]) returns boolean language sql stable as $$
        select coalesce(current_setting('fixture.staff',true),'false')='true'
      $$;
      create function public.wave1_current_caller_authority_internal() returns boolean language sql stable as $$select true$$;
      create function public.is_account_access_restricted(text) returns boolean language sql stable as $$select false$$;
      create function public.user_has_active_entitlement(text,text[]) returns boolean language sql stable as $$
        select coalesce(current_setting('fixture.premium',true),'false')='true'
      $$;
      create function public.monetization_has_active_premium(uuid) returns boolean language sql stable as $$
        select public.user_has_active_entitlement($1::text,array['premium'])
      $$;
      create function public.resolve_creator_content_access(text,uuid) returns jsonb language sql stable security definer as $$
        select jsonb_build_object('allowed',coalesce(current_setting('fixture.parent_denied',true),'false')<>'true'
          and exists(select 1 from public.videos v where v.id=$2 and
            (v.owner_id=auth.uid() or (v.visibility='public' and v.scan_status='clean'
              and v.moderation_status in ('clean','reported') and v.quarantined_at is null))),
          'requiresPurchase',false,'reason','fixture_parent_gate')
      $$;
      create function public.can_read_creator_video_row(text,text,text,text,text,text,text,text)
        returns boolean language sql stable security definer as $$
          select exists(select 1 from public.videos v where v.owner_id::text=$1
            and v.storage_path is not distinct from $5
            and (public.resolve_creator_content_access('creator_video',v.id)->>'allowed')::boolean)
        $$;
      select set_config('request.jwt.claims','{"role":"anon"}',false);
      insert into public.videos(id,owner_id,title,storage_path) values
        ('${ids.video}','${ids.owner}','Legacy fixture','source/original.mp4');
      insert into public.video_renditions(id,video_id,owner_id,storage_path,manifest_path)
        values('${ids.rendition}','${ids.video}','${ids.owner}','renditions/360.mp4','renditions/master.m3u8');
      insert into public.media_rendition_output_path_claims values
        ('renditions/360.mp4','video_rendition','${ids.rendition}'),
        ('renditions/master.m3u8','video_rendition','${ids.rendition}');
      insert into storage.objects values('creator-videos','renditions/360.mp4'),('creator-videos','renditions/master.m3u8');
    `);
    await db.exec(definition(read('supabase/migrations/202608250002_whole_app_media_authority_closure.sql'), 'media_scan_public_safe'));
    for (const name of ['video_rendition_binding_valid','video_rendition_output_paths_valid',
      'creator_rendition_direct_owner_authorized','creator_video_rendition_parent_read_safe',
      'enforce_video_rendition_binding_and_paths','release_video_rendition_output_path_claims']) {
      await db.exec(definition(binding, name));
    }
    await db.exec(`
      create trigger aa_enforce_video_rendition_binding_and_paths before insert or update of video_id,owner_id,storage_path,manifest_path
        on public.video_renditions for each row execute function public.enforce_video_rendition_binding_and_paths();
      create trigger zz_release_video_rendition_output_path_claims after update of storage_path,manifest_path or delete
        on public.video_renditions for each row execute function public.release_video_rendition_output_path_claims();
    `);
    await db.exec(definition(original,'resolve_video_playback').replace('public."resolve_video_playback"','public."resolve_video_playback_pre_paid_authority_closeout"'));
    await db.exec(definition(commerce,'resolve_video_playback'));
    await db.exec(definition(storage,'creator_video_storage_rendition_access_allowed'));
    const policyStart = binding.indexOf('create policy "video_renditions_select_owner_operator"');
    await db.exec(binding.slice(policyStart,binding.indexOf(';',policyStart)+1));
    await db.exec(`
      create policy free_rendition on storage.objects for select to anon,authenticated
        using(public.creator_video_storage_rendition_access_allowed(bucket_id,name,'free'));
      create policy premium_rendition on storage.objects for select to authenticated
        using(public.creator_video_storage_rendition_access_allowed(bucket_id,name,'premium'));
      revoke all on function public.resolve_video_playback_pre_paid_authority_closeout(uuid) from public,anon,authenticated,service_role;
    `);
    return { db, async install() { await db.exec(candidate); }, async resolve() {
      return (await db.query('select public.resolve_video_playback($1::uuid) result',[ids.video])).rows[0].result;
    }, async as(role, userId = null) {
      await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({role,...(userId ? {sub:userId} : {})})]);
      await db.exec(`set role ${role}`);
    } };
  } catch (error) { await db.close(); throw error; }
}
