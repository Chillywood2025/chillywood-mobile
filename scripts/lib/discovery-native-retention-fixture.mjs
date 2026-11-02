// Read-only disposition for the one freshly created, tracked native-test host.
// The caller supplies its original createUser ID/email, never a catalog-discovered
// account. A true result retains this exact synthetic financial fixture until
// disposal of the owned ephemeral cluster; it never authorizes deleting evidence.
export async function verifyRetainedDiscoveryHost(db, actor, { email }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor?.id ?? '')
    || !/^discovery-host-[0-9a-f]{16}@example\.invalid$/.test(email ?? '')) {
    throw new Error('discovery_retained_host_identity_invalid');
  }
  const event = `live-authority-premium-${actor.id}`;
  const original = `live-authority-original-${actor.id}`;
  const { rows } = await db.query(`select
    (select count(*)=1 from auth.users u where u.id=$1::uuid and u.email=$2) as auth_matches,
    count(*)::integer as authority_count,
    coalesce(bool_and(a.user_id=$1::uuid and a.provider='revenuecat_google_play' and a.environment='sandbox'
      and a.original_transaction_id=$3 and a.first_event_id=$4 and a.latest_event_id=$4
      and a.first_event_hash=repeat('a',64) and a.latest_event_hash=repeat('a',64)
      and a.latest_event_type='INITIAL_PURCHASE' and a.authority_state='active'
      and a.current_product_id=(select p.id from public.monetization_products p
        where p.provider='revenuecat_google_play' and p.environment='sandbox'
          and p.product_type='premium_subscription' and p.status='sandbox'
        order by p.created_at,p.id limit 1)
      and exists(select 1 from public.monetization_products p where p.id=a.current_product_id
        and p.provider_product_id=a.current_provider_product_id
        and p.provider_base_plan_id is not distinct from a.current_provider_base_plan_id)),false) as binding_matches,
    exists(select 1 from pg_catalog.pg_constraint c
      where c.conname='revenuecat_premium_transaction_authority_user_id_fkey' and c.contype='f'
        and c.conrelid='public.revenuecat_premium_transaction_authority'::regclass
        and c.confrelid='auth.users'::regclass and c.confdeltype='r'
        and c.convalidated and not c.condeferrable and not c.condeferred
        and c.conkey=array[(select attnum from pg_catalog.pg_attribute
          where attrelid=c.conrelid and attname='user_id' and not attisdropped)]
        and c.confkey=array[(select attnum from pg_catalog.pg_attribute
          where attrelid=c.confrelid and attname='id' and not attisdropped)]
        and exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
          where t.tgconstraint=c.oid and t.tgrelid=c.confrelid and t.tgisinternal
            and t.tgtype=9 and t.tgenabled in ('O','A') and not t.tgdeferrable and not t.tginitdeferred
            and p.pronamespace='pg_catalog'::regnamespace and p.proname='RI_FKey_restrict_del')) as restrict_matches
    from public.revenuecat_premium_transaction_authority a
    where a.user_id=$1::uuid or a.original_transaction_id=$3 or a.first_event_id=$4 or a.latest_event_id=$4`,
  [actor.id, email, original, event]);
  if (rows.length !== 1 || rows[0].auth_matches !== true) throw new Error('discovery_retained_host_identity_mismatch');
  const result = rows[0];
  if (result.authority_count === 0) return false;
  if (result.authority_count !== 1 || result.binding_matches !== true) throw new Error('discovery_retained_host_binding_mismatch');
  if (result.restrict_matches !== true) throw new Error('discovery_retained_host_constraint_mismatch');
  return true;
}
