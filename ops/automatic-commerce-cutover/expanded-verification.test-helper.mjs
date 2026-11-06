// Frozen comparison oracle from expanded prepare.mjs SHA b5689973400cbb807ab0993ad07be1a80b131344288282fe8e415ae81a570840.
// Test-only; never used to generate deployment SQL.
import {literal} from './bridge.mjs';
import {hashSQL} from './catalog.mjs';

const metadataSQL=`jsonb_build_object('acl',p.proacl::text,'cost',p.procost,'kind',p.prokind,'rows',p.prorows,
 'owner',p.proowner::regrole::text,'result',pg_get_function_result(p.oid),'strict',p.proisstrict,'support',p.prosupport::regproc::text,
 'argModes',p.proargmodes,'argNames',p.proargnames,'language',l.lanname,'parallel',p.proparallel,'leakproof',p.proleakproof,
 'proconfig',p.proconfig,'volatility',p.provolatile,'argDefaults',pg_get_expr(p.proargdefaults,0),
 'securityDefiner',p.prosecdef,'identityArguments',pg_get_function_identity_arguments(p.oid))`;
export const expandedFunctionStateSQL=(bundle,phase)=>bundle.functions.map(f=>`exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
 where p.oid=to_regprocedure(${literal(f.signature)}) and ${hashSQL('pg_get_functiondef(p.oid)')}=${literal(f[phase].sha256)}
 and ${metadataSQL}=${literal(JSON.stringify(f.metadata))}::jsonb)`).join(' and ');
export const expandedFinalHistorySQL=bundle=>bundle.migrations.map(m=>`exists(select 1 from supabase_migrations.schema_migrations where version=${literal(m.version)} and name=${literal(m.name)} and statements=array[${literal(m.source)}]::text[])`).join(' and ');
