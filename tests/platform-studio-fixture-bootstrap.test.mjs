// Focused fixture-composition proof, not full Supabase schema/concurrency proof.
// Run the actual signup, username, media queue and provenance functions rather
// than silently assuming an auth.users INSERT leaves user_profiles empty.
import assert from "node:assert/strict";
import test from "node:test";
import { makeFixture, read, table } from "./helpers/studio-authority-fixture.mjs";

const usernameSource = "supabase/migrations/20260602032030_modern_username_handle_system.sql";
const signupSource = "supabase/migrations/20260603133500_auth_signup_profile_username_backstop.sql";
const mediaSource = "supabase/migrations/202608250002_whole_app_media_authority_closure.sql";
const canonical = read("supabase/tests/platform_studio_publication_authority_test.sql");
const runner = read("scripts/test-platform-studio-authority-concurrency.mjs");
function latestFunction(file, name) {
  const matches = [...read(file).matchAll(new RegExp(`create(?: or replace)? function public\\."?${name}"?\\([\\s\\S]*?\\$\\$;`, "giu"))];
  assert.ok(matches.length, `actual source function ${name}`);
  return matches.at(-1)[0];
}
function statement(source, start) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, `actual fixture statement ${start}`);
  return source.slice(offset, source.indexOf(";", offset) + 1);
}
const id = (n) => `ac150000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const expandNativeTemplate = (template, person) => new Function("person", "literal", `return \`${template}\`;`)(person, sqlLiteral);

test("Studio fixtures compose with actual auth signup, username and Profile media triggers", async (t) => {
  const { db } = await makeFixture();
  t.after(() => db.close());
  await db.exec(`
    alter table auth.users add column raw_user_meta_data jsonb default '{}',
      add column is_sso_user boolean, add column is_anonymous boolean;
    create table storage.objects(bucket_id text, name text, owner uuid, owner_id text, metadata jsonb,
      primary key(bucket_id,name));
    update public.user_profiles set username='seed'||substr(md5(user_id),1,12);
    alter table public.user_profiles add primary key(user_id), alter column username set not null,
      alter column profile_avatar_media_status set default 'active',
      alter column profile_background_media_status set default 'active',
      add column profile_avatar_scan_provider text, add column profile_avatar_scan_result text,
      add column profile_avatar_scanned_at timestamptz, add column profile_avatar_scan_error text,
      add column profile_background_scan_provider text, add column profile_background_scan_result text,
      add column profile_background_scanned_at timestamptz, add column profile_background_scan_error text;
    create unique index user_profiles_username_unique_ci_idx on public.user_profiles(lower(username));
  `);
  await db.exec(table(usernameSource, "username_reserved_names"));
  await db.exec(table(usernameSource, "username_change_audit"));
  await db.exec(statement(read(usernameSource), 'insert into public.username_reserved_names ("username"'));
  for (const name of ["normalize_username_handle", "is_username_handle_format_valid", "is_username_format_valid",
    "is_username_blocked_word", "is_username_reserved", "is_username_available_for_user", "enforce_user_profile_username"]) {
    await db.exec(latestFunction(usernameSource, name));
  }
  for (const name of ["profile_media_public_origin", "profile_media_public_url", "media_scan_object_key_from_public_url",
    "profile_media_storage_object_valid", "guard_profile_media_client_authority"]) {
    await db.exec(latestFunction(mediaSource, name));
  }
  await db.exec(latestFunction("supabase/migrations/20260530191115_media_malware_scanning_pipeline.sql", "queue_profile_media_scan"));
  for (const name of ["resolve_signup_profile_username", "ensure_user_profile_after_auth_signup"]) {
    await db.exec(latestFunction(signupSource, name));
  }
  await db.exec(`alter table public.user_profiles add constraint user_profiles_username_format_check
      check(public.is_username_format_valid(username));
    ${statement(read(usernameSource), 'create trigger "enforce_user_profile_username_before"')}
    ${statement(read(signupSource), 'create trigger "ensure_user_profile_after_auth_signup_trigger"')}
    ${statement(read("supabase/migrations/20260530191115_media_malware_scanning_pipeline.sql"), 'create trigger "queue_profile_media_scan_before"')}
    ${statement(read(mediaSource), "create trigger zz_guard_profile_media_client_authority")}
  `);
  await db.exec(canonical.slice(canonical.indexOf("create function pg_temp.studio_user"), canonical.indexOf("insert into auth.users")));
  await db.exec(statement(canonical, "insert into auth.users"));
  assert.equal((await db.query("select count(*)::int n from public.user_profiles where user_id=any($1::text[])",
    [Array.from({ length: 6 }, (_, i) => id(i + 1))])).rows[0].n, 6, "real signup creates all six Profiles first");
  assert.equal((await db.query("select count(*)::int n from public.username_change_audit where action='signup_username_created'")).rows[0].n, 6,
    "actual signup username audit ran");
  await db.exec(statement(canonical, "insert into storage.objects"));
  await assert.rejects(db.query("update public.user_profiles set avatar_url='https://example.invalid/private-avatar' where user_id=$1", [id(1)]),
    { code: "42501", message: "profile_avatar_storage_provenance_invalid" });
  const profileSeed = statement(canonical, "insert into public.user_profiles(user_id,username,display_name,tagline");
  await assert.rejects(db.exec(profileSeed.replace(/\n\s*on conflict \(user_id\)[\s\S]*;$/u, ";")),
    { code: "23505" }, "old plain INSERT fails against the actual signup-created row");
  await db.exec(profileSeed);
  await db.exec(profileSeed); // Repeated customization must remain deterministic.
  for (let n = 1; n <= 6; n++) {
    const row = (await db.query(`select user_id,username,display_name,tagline,profile_access_visibility,platform_access_visibility,
      follower_surface_enabled,subscriber_surface_enabled,avatar_url,profile_background_url,default_watch_party_join_policy,
      profile_avatar_scan_status,profile_background_scan_status from public.user_profiles where user_id=$1`, [id(n)])).rows[0];
    const urls = (await db.query("select public.profile_media_public_url($1,$1||'/avatar/studio.png') avatar, public.profile_media_public_url($1,$1||'/background/studio.png') background", [id(n)])).rows[0];
    assert.deepEqual(row, { user_id: id(n), username: `studiofixture${n}`, display_name: `Platform ${n}`, tagline: "Platform tagline",
      profile_access_visibility: "private", platform_access_visibility: "public", follower_surface_enabled: true,
      subscriber_surface_enabled: true, avatar_url: urls.avatar, profile_background_url: urls.background,
      default_watch_party_join_policy: "invite_only", profile_avatar_scan_status: "pending_scan", profile_background_scan_status: "pending_scan" });
  }
  // Keep transaction-local fixture claims and the write in one statement batch.
  await assert.rejects(db.exec(`select pg_temp.studio_login(4);
    update public.user_profiles set platform_access_visibility='private' where user_id='${id(1)}';`),
    { code: "42501", message: "profile_avatar_storage_provenance_invalid" }, "retained foreign viewer claims remain invalid");
  await db.exec(`select pg_temp.studio_login(null);
    update public.user_profiles set platform_access_visibility='private' where user_id='${id(1)}';`);

  const person = { user: id(9), session: "ac150001-0000-4000-8000-000000000009" };
  const nativeAuth = runner.match(/query\(`(insert into auth\.users[\s\S]*?)`\);/u)?.[1];
  const nativeProfile = runner.match(/(insert into public\.user_profiles\(user_id,username,display_name,platform_access_visibility,follower_surface_enabled\)[\s\S]*?)(?=\n\s*insert into public\.wave1_legal_acceptances)/u)?.[1];
  assert.ok(nativeAuth && nativeProfile, "extract exact native runner fixture SQL");
  await db.exec(expandNativeTemplate(nativeAuth, person));
  assert.equal((await db.query("select count(*)::int n from public.user_profiles where user_id=$1", [person.user])).rows[0].n, 1);
  const nativeSeed = expandNativeTemplate(nativeProfile, person);
  await assert.rejects(db.exec(nativeSeed.replace(/\n\s*on conflict\(user_id\)[\s\S]*;$/u, ";")), { code: "23505" },
    "old native plain INSERT also fails against the real bootstrap");
  await db.exec(nativeSeed);
  await db.exec(nativeSeed);
  assert.deepEqual((await db.query("select username,display_name,platform_access_visibility,follower_surface_enabled from public.user_profiles where user_id=$1", [person.user])).rows[0],
    { username: `studioc${person.user.replaceAll("-", "").slice(0, 15)}`, display_name: "Concurrency fixture",
      platform_access_visibility: "public", follower_surface_enabled: true });
});
