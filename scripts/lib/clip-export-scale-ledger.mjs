const POOL_ID=/^[a-z][a-z0-9_-]{0,63}$/u;

export function emptyClipScaleLedger() {
 return {version:1,sequence:0,lastScaleAtMs:null,planningState:{},targetWorkers:null,
  healthState:'unknown',healthObservedAtMs:null,admissionReady:false,resources:[]};
}

/** Direct PostgreSQL control-plane adapter. connect is an already-authorized
 * client factory, NOT a render-worker RPC or credential supplied by a request.
 * No package, connection string, role grant or provider access is created here.
 * Every callback must be synchronous and contain no external/provider I/O.
 * The lock and state commit precede dispatch; crashes retain reservations. */
export function createPostgresClipScaleLedger({connect}={}) {
 if(typeof connect!=='function')throw new Error('clip_scale_durable_connection_required');
 return Object.freeze({
  atomicDurable:true,
  async transact(poolId,change) {
   if(!POOL_ID.test(poolId)||typeof change!=='function')throw new Error('clip_scale_ledger_input_invalid');
   const client=await connect();
   let committed=false;
   try {
    await client.query('begin');
    await client.query("set local lock_timeout='5s'");
    await client.query("set local statement_timeout='10s'");
    // Also serializes first insertion, when no row yet exists to lock.
    await client.query("select pg_advisory_xact_lock(hashtextextended('clip-scale-ledger:'||$1,0))",[poolId]);
    await client.query('insert into private.creator_clip_scale_ledger(pool_id,state) values($1,$2::jsonb) on conflict(pool_id) do nothing',[poolId,JSON.stringify(emptyClipScaleLedger())]);
    const selected=await client.query('select revision,state from private.creator_clip_scale_ledger where pool_id=$1 for update',[poolId]);
    if(selected.rows.length!==1)throw new Error('clip_scale_ledger_unavailable');
    const state=structuredClone(selected.rows[0].state);
    const result=change(state);
    if(result&&typeof result.then==='function')throw new Error('clip_scale_ledger_callback_must_be_synchronous');
    await client.query('update private.creator_clip_scale_ledger set state=$2::jsonb,revision=revision+1,updated_at=clock_timestamp() where pool_id=$1',[poolId,JSON.stringify(state)]);
    const healthState=['healthy','technical_delay','unknown'].includes(state.healthState)?state.healthState:'unknown';
    const observed=Number.isFinite(state.healthObservedAtMs)&&state.healthObservedAtMs>=0
     &&state.healthObservedAtMs<=8_640_000_000_000_000?new Date(state.healthObservedAtMs).toISOString():null;
    // Optional operator binding only. An unbound/manual worker's status is not
    // overwritten, and old evidence is never freshened to the transaction time.
    await client.query('update private.creator_clip_export_worker set health_state=$2,health_observed_at=$3::timestamptz,controller_admission_ready=$4 where scale_pool_id=$1',[poolId,healthState,observed,state.admissionReady===true]);
    await client.query('commit');committed=true;
    return result;
   } finally {
    if(!committed)await client.query('rollback').catch(()=>{});
    await client.release();
   }
  },
 });
}
