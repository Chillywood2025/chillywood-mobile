import assert from 'node:assert/strict';

// Called only after this attempt created and committed every generated table.
// A closed target list prevents broad VACUUM of existing source relations.
export function maintainBrandNativeFixture({tables,execute,onResult=()=>{},now=Date.now}){
 const expected=Array.from({length:354},(_,n)=>'brand_reference_perf_'+String(n).padStart(3,'0'));
 assert.deepEqual(tables.map(table=>table.name),expected,'maintenance requires exactly the freshly generated 354-table inventory');
 const sql="select 'MAINTENANCE_SETTINGS:'||jsonb_build_object('statement_timeout',current_setting('statement_timeout'),'autovacuum',current_setting('autovacuum'),'isolation',current_setting('transaction_isolation'),'work_mem',current_setting('work_mem'),'maintenance_work_mem',current_setting('maintenance_work_mem'))::text;\n"
  +'vacuum (analyze) '+expected.map(name=>'public."'+name+'"').join(',')+';\n'
  +"select 'MAINTENANCE_COMPLETE:354';";
 const started=now();const result=execute(sql,{budget:'180s',timeout:210000});
 const record={scope:'Only the 354 freshly created synthetic tables; no source tables or production resources.',
  syntheticTables:expected,sql,statementBudget:'180s',processTimeoutMs:210000,elapsedMs:now()-started,
  exitCode:result.status,signal:result.signal??null,error:result.error?.message??null,stdout:result.stdout??'',stderr:result.stderr??'',completed:false,
  qualification:'Measurements follow explicit fixture maintenance with warmed data/statistics; they do not establish cold-start or production latency.'};
 onResult(record);
 assert.equal(result.status,0,result.stderr||result.error?.message||'synthetic maintenance failed');
 assert.equal(record.error,null);assert.equal(record.signal,null);
 assert.doesNotMatch(record.stderr,/WARNING:|ERROR:|FATAL:/,'maintenance must not skip a requested relation');
 const settings=JSON.parse(record.stdout.match(/^MAINTENANCE_SETTINGS:(.+)$/m)?.[1]??'null');record.settings=settings;
 assert.equal(settings?.statement_timeout,'180s');assert.equal(settings?.autovacuum,'on');assert.equal(settings?.isolation,'read committed');
 assert.match(record.stdout,/^MAINTENANCE_COMPLETE:354\s*$/m,'all requested maintenance must finish before measurement');
 record.completed=true;return record;
}
