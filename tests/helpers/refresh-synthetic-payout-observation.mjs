import assert from 'node:assert/strict';

// Explicit positive-case boundary only. Never call automatically from a request.
// Owned disposable fixtures only: this is not an authenticated provider issuer.
export async function refreshSyntheticPayoutObservation(db, {creator, accountId}) {
 const account=(await db.query(`select id,last_platform_admin_audit_log_id from public.creator_payout_accounts
  where creator_user_id=$1 and provider_account_id=$2 and provider='stripe_connect' and provider_environment='live'
   and metadata->>'synthetic_fixture'='true'`,[creator,accountId])).rows;
 assert.equal(account.length,1,'renew only the exact synthetic recipient');
 const prior=(await db.query('select to_jsonb(a) row from public.platform_admin_audit_logs a where id=$1',[account[0].last_platform_admin_audit_log_id])).rows[0].row;
 const audit=(await db.query(`insert into public.platform_admin_audit_logs(action,action_category,target_type,target_id,target_user_id,metadata)
  values('stripe_connect_account_synced','payout','creator_payout_account',$1,$2,'{"synthetic_fixture":true,"explicit_positive_case_renewal":true}') returning id`,[account[0].id,creator])).rows[0].id;
 await db.query(`update public.creator_payout_accounts set last_provider_sync_at=clock_timestamp(),
  last_platform_admin_audit_log_id=$2 where id=$1`,[account[0].id,audit]);
 assert.deepEqual((await db.query('select to_jsonb(a) row from public.platform_admin_audit_logs a where id=$1',[account[0].last_platform_admin_audit_log_id])).rows[0].row,prior,'renewal preserves the old audit');
 return audit;
}
