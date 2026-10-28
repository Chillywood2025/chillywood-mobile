import assert from 'node:assert/strict';

// Additive inventory: do not rewrite the historical replay/function baselines.
export const profileFeedFiles = [
  '20261028005149_profile_relationship_feed_cursor.sql',
  '20261028005306_profile_public_read_role_isolation.sql',
  '20261028005432_profile_engagement_sharded_counters.sql',
  '20261028005725_profile_feed_guarded_candidate_fastpath.sql',
];
// Exact new identities (the counter migration replaces, rather than adds,
// read_profile_post_engagement_batch). The final column is non-owner EXECUTE.
export const profileFeedFunctions = [
  ['public.preserve_creator_feed_cursor_identity/0', 'public.preserve_creator_feed_cursor_identity()', ['service_role']],
  ['public.read_profile_relationship_feed_page/4', 'public.read_profile_relationship_feed_page(timestamptz,uuid,timestamptz,integer)', ['authenticated', 'service_role']],
  ['public.read_profile_post_engagement_batch/1', 'public.read_profile_post_engagement_batch(uuid[])', ['anon', 'authenticated', 'service_role']],
  ['public.anonymous_social_attachment_source_visible/2', 'public.anonymous_social_attachment_source_visible(text,uuid)', ['anon']],
  ['profile_engagement_private.bucket/1', 'profile_engagement_private.bucket(text)', []],
  ['profile_engagement_private.apply_delta/4', 'profile_engagement_private.apply_delta(uuid,smallint,bigint,bigint)', []],
  ['profile_engagement_private.track_like/0', 'profile_engagement_private.track_like()', []],
  ['profile_engagement_private.track_comment/0', 'profile_engagement_private.track_comment()', []],
  ['public.read_authorized_profile_post_counts/1', 'public.read_authorized_profile_post_counts(uuid)', ['anon', 'authenticated', 'service_role']],
  ['public.read_authorized_profile_feed_candidates/5', 'public.read_authorized_profile_feed_candidates(jsonb,timestamptz,uuid,timestamptz,integer)', ['authenticated']],
];

export async function assertProfileFeedInventory(db, functions) {
  const {rows: counters} = await db.query(`select c.relrowsecurity, c.relforcerowsecurity,
    (select count(*)::int from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where a.grantee<>c.relowner) non_owner_grants,
    (select count(*)::int from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      where a.grantee<>n.nspowner) non_owner_schema_grants
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='profile_engagement_private' and c.relname='post_counts' and c.relkind='r'`);
  assert.deepEqual(counters, [{relrowsecurity: true, relforcerowsecurity: true,
    non_owner_grants: 0, non_owner_schema_grants: 0}], 'counter table is forced-RLS and owner-only, including schema access');
  const keys = new Set(profileFeedFunctions.map(([key]) => key));
  assert.deepEqual(functions.filter(fn => keys.has(fn.key)).map(fn => fn.key).sort(), [...keys].sort(),
    'exact additive profile feed and private counter function inventory');
  for (const [key, signature, roles] of profileFeedFunctions) {
    const fn = functions.find(fn => fn.key === key);
    const {rows} = await db.query(`select p.oid,
      coalesce((select array_agg(case when a.grantee=0 then 'PUBLIC' else r.rolname end order by r.rolname)
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        left join pg_roles r on r.oid=a.grantee
        where a.privilege_type='EXECUTE' and a.grantee<>p.proowner),array[]::name[]) roles
      from pg_proc p where p.oid=$1::regprocedure`, [signature]);
    assert.equal(rows[0]?.oid, fn.oid, `${key}: exact argument signature`);
    assert.deepEqual(rows[0].roles, roles, `${signature}: exact non-owner EXECUTE ACL (including PUBLIC)`);
  }
}
