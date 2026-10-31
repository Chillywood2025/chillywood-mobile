// This decision never authorizes deleting a provider object on RPC failure.
// Invoke only after existing exact actor/object deletion authorization succeeds.
export async function decideDeletedContentMediaDeletion(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error: unknown}>,
  input: {surfaceType: string; recordId: string | null; provider: string; bucket: string; objectKey: string; actorId: string},
): Promise<"delete_now" | "defer"> {
  // A missing client record ID is not proof that an object is still unattached.
  // The database must fence retired keys and active object-only requests too.
  const {data, error} = await rpc("stage_deleted_content_media", {
    p_type: input.surfaceType, p_target: input.recordId, p_provider: input.provider,
    p_bucket: input.bucket, p_object_key: input.objectKey, p_actor: input.actorId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("deleted_content_retention_decision_unavailable");
  }
  const decision = (data as Record<string, unknown>).decision;
  if (decision !== "delete_now" && decision !== "defer") {
    throw new Error("deleted_content_retention_decision_unavailable");
  }
  return decision;
}

// Bounded, manually invoked SQL-only text worker. Orphan stage cleanup has its
// own queue and irreversible object claims; this worker must not lease that work.
const retentionUuid=(value:unknown):value is string=>typeof value==="string"
  && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
// These are the current SQL text-expiry outcomes, including delegated Brand
// and reviewed external-reference paths. A future/unknown status requires an
// explicit contract update; it must not refresh a successful worker heartbeat.
const textExpiryStatuses=new Set([
  "disabled","already_absent","not_due","held","provider_exact_delete_unproven",
  "soft_source_cleanup_required","source_busy","source_cleanup_required",
  "external_reference_archive_proof_required","brand_delegation_unavailable",
  "delegated_brand_lifecycle","purged",
]);
export async function runDeletedContentExpiryBatch(
  rpc: (name: string,args: Record<string,unknown>) => Promise<{data: unknown;error: unknown}>,
): Promise<{enabled: boolean; results: {kind: string;status: string}[]}> {
  const work=await rpc("list_deleted_content_expiry_work",{});
  if(work.error || !work.data || typeof work.data!=="object" || Array.isArray(work.data)) throw new Error("retention_work_unavailable");
  const data=work.data as Record<string,unknown>;
  if(data.enabled===false) return {enabled:false,results:[]};
  if(data.enabled!==true) throw new Error("retention_work_invalid");
  const results: {kind:string;status:string}[]=[];
  for(const [field,name,param,kind] of [
    ["deletionIds","expire_deleted_content_text","p_deletion_id","deletion"],
  ]) {
    const ids=data[field];
    if(!Array.isArray(ids) || ids.length>20 || ids.some(id=>!retentionUuid(id))
      || new Set(ids.map(id=>(id as string).toLowerCase())).size!==ids.length) {
      throw new Error("retention_work_invalid");
    }
    for(const id of ids) {
      const reply=await rpc(name,{[param]:id});
      if(reply.error || !reply.data || typeof reply.data!=="object" || Array.isArray(reply.data)) {
        throw new Error("retention_work_failed");
      }
      const receipt=reply.data as Record<string,unknown>;
      if(typeof receipt.status!=="string" || !textExpiryStatuses.has(receipt.status)
        || (receipt.status==="purged" && !retentionUuid(receipt.claimId))) {
        throw new Error("retention_work_failed");
      }
      results.push({kind,status:receipt.status});
    }
  }
  return {enabled:true,results};
}
