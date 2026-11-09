import {Buffer} from 'node:buffer';
// Generate local PostgreSQL17 single-user input only; never opens a server.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createHistoricalDeploymentDatabase} from '../../tests/helpers/historical-deployment-schema-fixture.mjs';
import {splitSQL} from '../../tests/helpers/database-runtime-authority-fixture.mjs';
import {catalogRowsSQL} from '../../ops/automatic-commerce-cutover/catalog.mjs';
import {loadBundle,MIGRATION} from '../google-refund-tax-observer-exact-deploy.mjs';
import {verifyInputs} from './verify-inputs.mjs';
verifyInputs();
const root=new URL('../../',import.meta.url).pathname,out=path.resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('OUTPUT_DIRECTORY_REQUIRED');
fs.mkdirSync(out,{recursive:true});
const b=loadBundle(root);
const initial=b.predecessors.slice(0,3).map(p=>`supabase/migrations/${p.version}_${p.name}.sql`);
const deltas=[...b.social.map(p=>p.path),...b.predecessors.slice(3).map(p=>`supabase/migrations/${p.version}_${p.name}.sql`)];
const excluded=[MIGRATION,...initial,...deltas,'supabase/migrations/20261102093836_creator_clip_export_bounded_pool.sql','supabase/migrations/20261102094308_creator_clip_scale_lifecycle_ledger.sql'].map(p=>path.basename(p));
const statements=[];
const {replayReport}=await createHistoricalDeploymentDatabase({implicitApiGrants:false,excludeMigrations:excluded,databaseFactory:async()=>({exec:async s=>{statements.push(s);},close:async()=>{}})});
const E=s=>"E'"+s.replaceAll('\\','\\\\').replaceAll("'","''").replaceAll('\r','\\r').replaceAll('\n','\\n')+"'";
function encoded(source){return splitSQL(source).map(sql=>{
 const head=sql.replace(/--[^\n]*/gu,'').replace(/\/\*[\s\S]*?\*\//gu,'').trim();
 if(!head)return '';
 // Single-user input boundary cannot preserve raw newlines inside function
 // bodies. Decode exact statement text inside one-line EXECUTE instead.
 // Explicit transaction wrappers stay outside DO, preserving local roles.
 if(/^(begin|commit|rollback)\s*;?$/iu.test(head))return head.replace(/;?$/u,';')+'\n\n';
 return `DO $inverse_transport$ BEGIN EXECUTE ${E(sql)}; END $inverse_transport$;\n\n`;
}).join('');}
const capture=label=>`SELECT replace(encode(convert_to(jsonb_build_object('label','${label}','serverVersion',current_setting('server_version_num'),'rows',(select jsonb_agg(jsonb_build_object('key',key,'item_text',item::text) order by key collate "C",item::text collate "C") from (${catalogRowsSQL.replaceAll('\n',' ')}) catalog))::text,'UTF8'),'base64'),E'\\n','');\n\n`;
const before=statements.map(encoded).join('')+initial.map(p=>encoded(fs.readFileSync(path.join(root,p),'utf8'))).join('')+encoded("set search_path=pg_catalog,public; set time zone 'UTC';")+capture('source586');
const after=encoded("set time zone 'UTC';")+deltas.map(p=>encoded(fs.readFileSync(path.join(root,p),'utf8'))).join('')+encoded("set search_path=pg_catalog,public; set time zone 'UTC';")+capture('source589');
const expected=JSON.parse(fs.readFileSync(new URL('./inverse-native-capture-manifest.json',import.meta.url),'utf8'));
for(const [name,body] of [['inverse-native-source586.sql',before],['inverse-native-source589.sql',after]])if(createHash('sha256').update(body).digest('hex')!==expected.packets.find(p=>p.path===name)?.sha256)throw Error('NATIVE_RECIPE_DRIFT:'+name);
for(const [name,body] of [['inverse-native-source586.sql',before],['inverse-native-source589.sql',after]])fs.writeFileSync(path.join(out,name),body);
fs.writeFileSync(path.join(out,'inverse-native-capture-manifest.json'),JSON.stringify({protocol:'owned-single-user-source-capture-v1',targetExecuted:false,originalMigrationBytesPreserved:true,transactionWrappersPreserved:true,replayReport,initial,deltas,packets:[['inverse-native-source586.sql',before],['inverse-native-source589.sql',after]].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')}))},null,2));
console.log(JSON.stringify({beforeBytes:Buffer.byteLength(before),afterBytes:Buffer.byteLength(after),statements:statements.length,executed:false}));
