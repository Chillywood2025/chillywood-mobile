// Deterministic fresh-profile substitutions. Never execute against a database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const replace=(source,old,value)=>{assert.equal(source.split(old).length,2,'Substitution must match exactly once');return source.replace(old,value);};
const bases={commands:'candidates/paid-video-checkout-recovery/commands.sql',gateway:'paid-video-gateway-v2.sql',provisioning:'candidates/paid-video-plan-lifecycle/provisioning.sql'};
const sources=Object.fromEntries(Object.entries(bases).map(([name,file])=>[name,fs.readFileSync(path.join(root,file),'utf8')]));
const expected={commands:'202b50e091eb3b68a5df972f4565d0528252aa1fef894acd95f6b932643574e7',gateway:'fdf563b2ded0ed6549f03acde08edf1e1546a7b98e9c60a19587f7a6c415cdf1',provisioning:'97b80419ed1f818b040ac9797946b0cd01013bb94e470020a7dbad5bd4e766d2'};
for(const name of Object.keys(bases))assert.equal(sha(sources[name]),expected[name],'Frozen derivation input changed');
const prefix=name=>`-- Fresh inactive combined-readiness substitution; derived ${bases[name]} SHA256 ${sha(sources[name])}.\n-- Do not install alongside its source; no CREATE OR REPLACE or active cutover.\n`;
let commands=prefix('commands')+replace(sources.commands,' perform sandbox_commerce_v1.test_store_v3_assert_media(media_probe);',
 ' perform sandbox_commerce_v1.test_store_v3_assert_media(media_probe);\n perform sandbox_commerce_v1.paid_video_verified_media_v2(media_probe.resource_id,media_probe.resource_revision,media_probe.creator_id);');
const intentCheck='perform sandbox_commerce_v1.test_store_v3_assert_media(i);';
assert.equal(commands.split(intentCheck).length,4,'Exact preparation/new allocation/new SDK claim checks');
commands=commands.replaceAll(intentCheck,intentCheck+'\n   perform sandbox_commerce_v1.paid_video_verified_media_v2(i.resource_id,i.resource_revision,i.creator_id);');
const provisioning=prefix('provisioning')+replace(sources.provisioning,'   perform sandbox_commerce_v1.test_store_v3_assert_media(intent);',
 '   perform sandbox_commerce_v1.test_store_v3_assert_media(intent);\n   perform sandbox_commerce_v1.paid_video_verified_media_v2(intent.resource_id,intent.resource_revision,intent.creator_id);');
const start=sources.gateway.indexOf(" if not ctl.enabled or ctl.route_id<>u.route_id or not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts r");
const end=sources.gateway.indexOf(" then raise exception 'paid_video_current_object_receipt_required'; end if;",start);
assert.ok(start>0&&end>start);
const old=sources.gateway.slice(start,end+" then raise exception 'paid_video_current_object_receipt_required'; end if;".length);
const gateway=prefix('gateway')+replace(sources.gateway,old,` asset:=sandbox_commerce_v1.paid_video_verified_media_v2(p_resource,asset.resource_revision,u.creator_id);
 if result->'object' is distinct from jsonb_build_object('provider',asset.provider,'bucket',asset.bucket,'routeId',u.route_id,
  'objectKey',asset.object_key,'incarnation',asset.incarnation,'expectedSha256',asset.sha256,'expectedByteLength',asset.byte_length,'objectVersion',asset.object_version)
 then raise exception 'paid_video_current_object_receipt_required'; end if;`);
const output={'commands.sql':commands,'gateway.sql':gateway,'provisioning.sql':provisioning};
for(const [name,source] of Object.entries(output)){
 assert.ok(!/create\s+or\s+replace/iu.test(source.replace(/^--.*$/gmu,'')));
 if(process.argv[2]==='--write')fs.writeFileSync(path.join(here,name),source);
 else {assert.equal(process.argv[2],'--check');assert.equal(fs.readFileSync(path.join(here,name),'utf8'),source,name+' drift');}
}
console.log(JSON.stringify({bases:Object.fromEntries(Object.entries(bases).map(([name,file])=>[file,sha(sources[name])])),outputs:Object.fromEntries(Object.entries(output).map(([name,source])=>[name,sha(source)]))}));
