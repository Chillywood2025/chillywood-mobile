// This decision never authorizes deleting a provider object on RPC failure.
// Invoke only after existing exact actor/object deletion authorization succeeds.
export async function decideDeletedContentMediaDeletion(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error: unknown}>,
  input: {surfaceType: string; recordId: string | null; provider: string; bucket: string; objectKey: string; actorId: string},
): Promise<"delete_now" | "defer"> {
  // Unattached upload rollback must not create deleted-content history.
  if (!input.recordId) return "delete_now";
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

// Bounded, manually invoked SQL-only worker. No provider delete dependency exists.
// Held/media/soft-source blockers remain visible rather than being retried as a
// successful purge. Each mutation RPC independently checks enablement and holds.
export async function runDeletedContentExpiryBatch(
  rpc: (name: string,args: Record<string,unknown>) => Promise<{data: unknown;error: unknown}>,
): Promise<{enabled: boolean; results: {kind: string;status: string}[]}> {
  const work=await rpc("list_deleted_content_expiry_work",{});
  if(work.error || !work.data || typeof work.data!=="object") throw new Error("retention_work_unavailable");
  const data=work.data as Record<string,unknown>;
  if(data.enabled!==true) return {enabled:false,results:[]};
  const results: {kind:string;status:string}[]=[];
  for(const [field,name,param,kind] of [
    ["deletionIds","expire_deleted_content_text","p_deletion_id","deletion"],
    ["stageIds","reconcile_deleted_content_stage","p_stage_id","stage"],
  ]) {
    const ids=data[field];
    if(!Array.isArray(ids) || ids.length>20 || ids.some(id=>typeof id!=="string" || !/^[0-9a-f-]{36}$/i.test(id))) {
      throw new Error("retention_work_invalid");
    }
    for(const id of ids) {
      const reply=await rpc(name,{[param]:id});
      if(reply.error || !reply.data || typeof reply.data!=="object" || typeof (reply.data as Record<string,unknown>).status!=="string") {
        throw new Error("retention_work_failed");
      }
      results.push({kind,status:(reply.data as {status:string}).status});
    }
  }
  return {enabled:true,results};
}
