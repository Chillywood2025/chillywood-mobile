import assert from 'node:assert/strict';

// Exact additive identities; historical migration/function baselines remain
// unchanged. The final column is the complete non-owner EXECUTE ACL.
export const discoveryInvalidationFiles = ['20261028145327_discovery_scoped_invalidation_outbox.sql'];
export const discoveryInvalidationFunctions = [
  ['private.discovery_public_invalidation_scopes/1', 'private.discovery_public_invalidation_scopes(public.discovery_feed_items)', []],
  ['private.enqueue_discovery_scope_invalidations/0', 'private.enqueue_discovery_scope_invalidations()', []],
  ['private.enqueue_creator_event_scope_invalidations/0', 'private.enqueue_creator_event_scope_invalidations()', []],
  ['public.can_receive_discovery_invalidation/1', 'public.can_receive_discovery_invalidation(text)', ['authenticated']],
  ['public.authorize_discovery_invalidation_worker/1', 'public.authorize_discovery_invalidation_worker(text)', ['service_role']],
  ['public.flush_discovery_invalidations/1', 'public.flush_discovery_invalidations(integer)', ['service_role']],
  ['public.read_discovery_invalidation_health/0', 'public.read_discovery_invalidation_health()', ['service_role']],
];

export async function assertDiscoveryInvalidationInventory(db, functions) {
  const keys = new Set(discoveryInvalidationFunctions.map(([key]) => key));
  assert.deepEqual(functions.filter(fn => keys.has(fn.key)).map(fn => fn.key).sort(), [...keys].sort());
  for (const [key, signature, roles] of discoveryInvalidationFunctions) {
    const {rows} = await db.query(`select p.oid,
      coalesce((select array_agg(case when a.grantee=0 then 'PUBLIC' else r.rolname end order by r.rolname)
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        left join pg_roles r on r.oid=a.grantee
        where a.privilege_type='EXECUTE' and a.grantee<>p.proowner),array[]::name[]) roles
      from pg_proc p where p.oid=$1::regprocedure`,[signature]);
    assert.equal(rows[0]?.oid,functions.find(fn => fn.key===key)?.oid,`${key}: exact argument identity`);
    assert.deepEqual(rows[0]?.roles,roles,`${signature}: exact non-owner EXECUTE ACL`);
  }
  const {rows} = await db.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity,
    (select count(*)::int from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee<>c.relowner) non_owner_grants
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'
      and c.relname in ('discovery_invalidation_outbox','discovery_invalidation_scope_dispatch','discovery_invalidation_worker_config')
    order by c.relname`);
  assert.deepEqual(rows,['discovery_invalidation_outbox','discovery_invalidation_scope_dispatch','discovery_invalidation_worker_config']
    .map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true,non_owner_grants:0})),
  'all discovery worker tables remain forced-RLS and owner-only');
}
