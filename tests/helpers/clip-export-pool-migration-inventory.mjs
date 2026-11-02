// Explicit source-reviewed forward successors, not generated from the database
// under test. Both depend on the November clip-export/secondary-media stack.
// The ledger migration is data-definition-only and adds no callable function.
export const clipExportPoolFiles = Object.freeze([
  '20261102093836_creator_clip_export_bounded_pool.sql',
  '20261102094308_creator_clip_scale_lifecycle_ledger.sql',
]);

export const clipExportPoolAddedFunctionIdentities = Object.freeze([
  ['private.clip_export_registry_lock/0', 'private.clip_export_registry_lock()'],
  ['private.clip_export_worker_session_alive/2', 'private.clip_export_worker_session_alive(uuid,uuid)'],
  ['private.clip_export_failure_class/1', 'private.clip_export_failure_class(text)'],
  ['public.open_creator_clip_export_worker/2', 'open_creator_clip_export_worker(uuid,uuid)'],
  ['public.heartbeat_creator_clip_export_worker/2', 'heartbeat_creator_clip_export_worker(uuid,uuid)'],
  ['public.close_creator_clip_export_worker/2', 'close_creator_clip_export_worker(uuid,uuid)'],
  ['public.claim_creator_clip_export/2', 'claim_creator_clip_export(uuid,uuid)'],
  ['public.begin_creator_clip_export_output/2', 'begin_creator_clip_export_output(uuid,uuid)'],
  ['public.read_creator_clip_export_pool_metrics/0', 'read_creator_clip_export_pool_metrics()'],
]);

// These six identities already belong to the November completion additions;
// they are replacements only relative to the immediately preceding pool state.
export const clipExportPoolReplacedFunctionIdentities = Object.freeze([
  ['private.clip_export_safe_status/1', 'private.clip_export_safe_status(private.creator_clip_export_jobs)'],
  ['public.claim_creator_clip_export/0', 'claim_creator_clip_export()'],
  ['public.fail_creator_clip_export/3', 'fail_creator_clip_export(uuid,uuid,text)'],
  ['public.request_creator_clip_export/3', 'request_creator_clip_export(uuid,uuid,jsonb)'],
  ['public.heartbeat_creator_clip_export/2', 'heartbeat_creator_clip_export(uuid,uuid)'],
  ['public.finish_creator_clip_export/4', 'finish_creator_clip_export(uuid,uuid,text,jsonb)'],
]);
