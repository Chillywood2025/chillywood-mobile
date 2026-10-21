// Disposable database only: execute actual deployed queue/claim/completion
// definitions, then the new receipt migration. No synthetic receipt or verifier.
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url),'utf8');
export const byteReceiptMigration = '20261021031016_media_scan_exact_byte_receipts.sql';
export async function installByteReceiptFixture(db) {
  const base = read('20260530191115_media_malware_scanning_pipeline.sql');
  await db.exec(base.slice(base.indexOf('create table if not exists'),base.indexOf('create unique index')));
  await db.exec(`alter table public.platform_brand_assets
    add column if not exists scan_status text default 'pending_scan',
    add column if not exists scan_provider text,
    add column if not exists scan_result text,
    add column if not exists scanned_at timestamptz,
    add column if not exists scan_error text,
    add column if not exists quarantined_at timestamptz;`);
  for(const name of ['claim_media_scan_jobs','complete_media_scan_job']) {
    const start=base.indexOf(`create or replace function public."${name}"(`);
    let definition=base.slice(start,base.indexOf('$$;',start)+3);
    if(name==='complete_media_scan_job') definition=definition.replace('public."complete_media_scan_job"(', 'public.complete_media_scan_job_with_target_propagation(');
    await db.exec(definition);
  }
  const wrapper=read('20260718214102_decouple_media_scan_audit_completion.sql');
  const start=wrapper.indexOf('create function public.complete_media_scan_job(');
  await db.exec(wrapper.slice(start,wrapper.indexOf('$$;',start)+3));
  await db.exec(read(byteReceiptMigration));
}
export async function createByteReceipt(db, {assetId, workerId='test-scanner', sha256='a'.repeat(64), sizeBytes=23}={}) {
  const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
  const job=(await one(`insert into media_scan_jobs(target_table,target_column,target_id,owner_user_id,storage_provider,storage_bucket,storage_object_key)
    select 'platform_brand_assets',asset_type,id::text,owner_user_id,storage_provider,storage_bucket,storage_object_key
    from platform_brand_assets where id=$1 returning id`,[assetId])).id;
  await db.query('select * from public.claim_media_scan_jobs(25,$1)',[workerId]);
  const observation=(await one('select public.begin_media_scan_byte_observation($1,$2,1) id',[job,workerId])).id;
  const completion=(await one("select public.complete_media_scan_job($1,'clean','clamav','ClamAV 1.4','daily/123',null,null,1) r",[job])).r;
  if (!completion.targetPropagationComplete) throw new Error('actual fixture completion propagation failed');
  const receipt=(await one('select public.record_media_scan_byte_receipt($1,$2,$3,$4,$5) id',[observation,job,workerId,sha256,sizeBytes])).id;
  return {job, observation, receipt, completion};
}
