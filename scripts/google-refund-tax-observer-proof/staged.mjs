// OFFLINE DESIGN CANDIDATE ONLY. No connection/execution and no manifest promotion.
import {sql as inverse} from './inverse.mjs';
import {sql as catalog} from './catalog.mjs';
import {invariantsHashSQL} from '../google-refund-tax-observer-exact-deploy.mjs';
import {dataEvidenceExpression,historyEvidenceExpression,fullHistoryHash,dataPredicate,historyPredicate,DATA_ANCHORS} from './predicates.mjs';
const names=['inverse','types','catalog','data','history'];
const key=n=>'chillywood.refund_proof_'+n;
const read=n=>`current_setting('${key(n)}',true)::jsonb`;
const originalInverse=inverse.slice(inverse.indexOf('with observed'),inverse.lastIndexOf('; rollback;'));
const typeStart=catalog.indexOf(' expected_types as materialized ('),typeEnd=catalog.indexOf(',\n proof as materialized (',typeStart);
const typeCte=catalog.slice(typeStart,typeEnd);
const stages={
 inverse:originalInverse,
 types:`with ${typeCte} select jsonb_build_object('qualified',not exists(select 1 from type_faults) and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and c.relkind='f'),'faults',coalesce((select jsonb_agg(key order by key) from type_faults),'[]'::jsonb)) evidence`,
 catalog:`select jsonb_build_object('hash',${invariantsHashSQL}) evidence`,
 data:`with additional as materialized (select ${dataEvidenceExpression} data_evidence) select jsonb_build_object('qualified',(${dataPredicate}),'hash',data_evidence->>'fullHash','frozenOriginalDataMatches',data_evidence->>'inverseHash'='${DATA_ANCHORS.inverse}','frozenQualifiedGuardedMatches',data_evidence->>'guardedHash'='${DATA_ANCHORS.guarded}','sourceSeedExact',data_evidence->'seedExact','holds',data_evidence->'holds') evidence from additional`,
 history:`with additional as materialized (select ${historyEvidenceExpression} history_evidence,${fullHistoryHash} full_history_hash) select jsonb_build_object('qualified',(${historyPredicate}),'hash',full_history_hash,'historyCount',history_evidence->'historyCount','historyMaximum',history_evidence->>'historyMaximum') evidence from additional`
};
const stageTokens=names.map(n=>`${n==='inverse'?'inv':n}->>'proofProtocol'='refund589-staged-offline-v1' and ${n==='inverse'?'inv':n}->>'proofStage'='${n}'`).join(' and ');
const context=`current_database()='postgres' and current_user='supabase_read_only_user' and session_user='supabase_read_only_user' and current_setting('transaction_read_only')='on' and current_setting('transaction_isolation')='repeatable read' and current_setting('server_version_num')='170006' and current_setting('TimeZone')='UTC' and current_setting('jit')='off' and current_setting('work_mem')='4MB' and current_setting('max_parallel_workers_per_gather')='0' and current_setting('statement_timeout')='15s' and current_setting('idle_in_transaction_session_timeout')='30s' and current_setting('lock_timeout')='2s'`;
const final=`with evidence as materialized (select ${names.map(n=>`${read(n)} ${n==='inverse'?'inv':n}`).join(',')}),proof as materialized (select *,coalesce((${context}) and (${stageTokens}) and inv->'bothFrozenAnchorsProven'='true'::jsonb and types->'qualified'='true'::jsonb and data->'qualified'='true'::jsonb and history->'qualified'='true'::jsonb and catalog->>'hash' ~ '^[a-f0-9]{64}$' and data->>'hash' ~ '^[a-f0-9]{64}$' and history->>'hash' ~ '^[a-f0-9]{64}$',false) verified from evidence)
select jsonb_build_object('finalEnvelope','refund589-staged-proof-final-v1','protocol','refund589-staged-database-baseline-offline-v1','databaseBaselineQualified',verified,'catalogQualified',coalesce((${context}) and (${stageTokens}) and inv->'bothFrozenAnchorsProven'='true'::jsonb and types->'qualified'='true'::jsonb,false),'dataQualified',coalesce(data->'qualified'='true'::jsonb,false),'historyQualified',coalesce(history->'qualified'='true'::jsonb,false),'expectedCatalogSha256',case when verified then catalog->>'hash' else null end,'expectedDataSha256',case when verified then data->>'hash' else null end,'expectedHistorySha256',case when verified then history->>'hash' else null end,'historyCount',history->'historyCount','historyMaximum',history->>'historyMaximum','deltaFaults',inv->'faults','typeFaults',types->'faults','frozenOriginalDataMatches',data->'frozenOriginalDataMatches','frozenQualifiedGuardedMatches',data->'frozenQualifiedGuardedMatches','sourceSeedExact',data->'sourceSeedExact','holds',data->'holds','edgeQualified',false,'deploymentQualified',false) evidence from proof`;
const setup=`begin isolation level repeatable read read only;
set local search_path=pg_catalog,public; set local time zone 'UTC'; set local standard_conforming_strings=on;
set local jit=off; set local work_mem='4MB'; set local max_parallel_workers_per_gather=0;
set local statement_timeout='15s'; set local idle_in_transaction_session_timeout='30s'; set local lock_timeout='2s';
${names.map(n=>`set local ${key(n)}='{}';`).join('\n')}
`;
const sql=setup+names.map(n=>`-- stage: ${n}\nDO $refund_proof_stage$ DECLARE result jsonb; BEGIN select evidence into strict result from (${stages[n]}) stage; perform set_config('${key(n)}',(result||jsonb_build_object('proofProtocol','refund589-staged-offline-v1','proofStage','${n}'))::text,true); END $refund_proof_stage$;`).join('\n')+'\n'+final+';\nrollback;\n';

export {sql,setup,context,stages,final};
