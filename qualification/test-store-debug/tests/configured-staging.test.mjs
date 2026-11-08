import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parsePrivateJson, validateInput, readPrivateInput, stagedSourceFiles, stage, build, childEnvironment, runPrivate, verifyAndroidManifest, verifyIosInfo, restoreExpectedPrebuildPackage } from "../scripts/stage-configured-debug.mjs";

// All readback facts, keys and child-build outputs here are synthetic fixtures.
// These portable checks never invoke an SDK, provider, native build or device.
const hash = value => createHash("sha256").update(value).digest("hex");
const uuid = n => `d0000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const fixtureKey = "test_synthetic_local_build_fixture";
const appId = "com.chillywood.qualification.teststore";
const script = path.resolve(import.meta.dirname, "../scripts/stage-configured-debug.mjs");
function input(now = Date.now()) {
  const catalog = { providerOfferingId: "ofrng_fixture", offeringIdentifier: "qualification_fixture", providerPackageId: "pkg_fixture", packageIdentifier: "qualification", providerProductId: "prod_fixture", productId: "qualification_fixture", amountMinor: 99, currency: "usd" };
  return { schema: "scq-local-build-input-v1", descriptor: { qualificationConnectionId: uuid(1), qualificationConnectionRevision: 1, projectId: "projfixture", appId: "appfixture", publicSdkKey: fixtureKey, runId: uuid(2), scenarios: [{ id: uuid(3), label: "Synthetic local validation", ...catalog, intendedAction: "cancel" }] },
    readback: { observedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 600000).toISOString(),
      project: { id: "projfixture", appIds: ["appfixture"], stores: ["TEST_STORE"], publicSdkKeySha256: hash(fixtureKey) },
      receiver: { endpoint: "https://synthetic.invalid/functions/v1/isolated-test-store-qualification-v1", connectionId: uuid(1), connectionRevision: 1, projectId: "projfixture", appId: "appfixture", phase: "capturing", maxEntries: 16, maxDeliveries: 32, maxTotalBytes: 1048576, entriesUsed: 0, deliveriesUsed: 0, totalBytesUsed: 0 },
      catalog: [catalog], providerEvidenceSha256: "a".repeat(64), receiverEvidenceSha256: "b".repeat(64) } };
}
function workspace(t, data = input()) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "scq-private-staging-test-"))); fs.chmodSync(parent,0o700);
  t.after(() => fs.rmSync(parent,{recursive:true,force:true}));
  const descriptorFile = path.join(parent,"private-input.json");fs.writeFileSync(descriptorFile,JSON.stringify(data),{mode:0o600});
  return { parent, descriptorFile, outputDirectory:path.join(parent,"build"), platform:"android", data };
}
function xml(native) {
  const escaped = JSON.stringify(native).replaceAll("&","&amp;").replaceAll('"',"&quot;");
  return `<manifest package="${appId}"><application android:debuggable="true" android:allowBackup="false" android:fullBackupContent="false"><meta-data android:name="SCQ_QUALIFICATION_CONFIG" android:value="${escaped}"/><meta-data android:name="expo.modules.updates.ENABLED" android:value="false"/></application></manifest>`;
}

test("private JSON rejects duplicate sensitive keys, trailing tokens and excessive nesting",()=>{
  assert.equal(parsePrivateJson(JSON.stringify(input())).schema,"scq-local-build-input-v1");
  for(const raw of ['{"projectId":"one","projectId":"two"}','{"projectId":"one","project\\u0049d":"two"}','{}{}','['.repeat(30)+'0'+']'.repeat(30),'{"publicSdkKey":"unterminated}'])assert.throws(()=>parsePrivateJson(raw));
});
test("exact operator readback binds native descriptor, SDK-key digest and every catalog tuple",()=>{
  for(const platform of ["ios","android"]){const d=input(),result=validateInput(d,platform);assert.equal(result.native.publicSdkKey,fixtureKey);assert.match(result.native.configurationDigest,/^[a-f0-9]{64}$/u);}
  for(const alter of [d=>{d.readback.project.publicSdkKeySha256="c".repeat(64);},d=>{d.readback.project.appIds.push("appother");},d=>{d.readback.project.stores=["APP_STORE"];},d=>{d.readback.catalog[0].amountMinor++;},d=>{d.readback.catalog.push({...d.readback.catalog[0]});},d=>{d.readback.receiver.connectionRevision++;},d=>{d.readback.receiver.projectId="foreign";},d=>{d.descriptor.authorization="never accepted";}]){
    const d=input();alter(d);assert.throws(()=>validateInput(d,"ios"));
  }
});
test("economic and mixed legacy projects are excluded in dashboard and REST forms",()=>{
  for(const id of ["44662861","proj44662861","c5629a24","projc5629a24","PROJC5629A24"]){const d=input();d.descriptor.projectId=id;d.readback.project.id=id;d.readback.receiver.projectId=id;assert.throws(()=>validateInput(d,"android"),/excluded_project/u);}
});
test("receiver readback must be fresh, bounded, capturing and nonexhausted without implying attestation",()=>{
  for(const change of [d=>{d.readback.expiresAt=new Date(Date.now()-1).toISOString();},d=>{d.readback.observedAt=new Date(Date.now()+10000).toISOString();},d=>{d.readback.expiresAt=new Date(Date.now()+7200000).toISOString();},d=>{d.readback.receiver.phase="sealed";},d=>{d.readback.receiver.entriesUsed=16;},d=>{d.readback.receiver.maxTotalBytes=67108865;},d=>{d.readback.receiver.endpoint+="?token=forbidden";},d=>{d.readback.receiver.endpoint="https://user:password@synthetic.invalid/functions/v1/isolated-test-store-qualification-v1";}]){const d=input();change(d);assert.throws(()=>validateInput(d,"ios"));}
});
test("descriptor must be regular, private, single-link, outside Git and in a private directory",t=>{
  const w=workspace(t);assert.equal(readPrivateInput(w.descriptorFile,w.platform).input.descriptor.publicSdkKey,fixtureKey);
  fs.chmodSync(w.descriptorFile,0o644);assert.throws(()=>readPrivateInput(w.descriptorFile,w.platform));fs.chmodSync(w.descriptorFile,0o600);
  const link=path.join(w.parent,"link.json");fs.symlinkSync(w.descriptorFile,link);assert.throws(()=>readPrivateInput(link,w.platform));
  const hard=path.join(w.parent,"hard.json");fs.linkSync(w.descriptorFile,hard);assert.throws(()=>readPrivateInput(w.descriptorFile,w.platform));fs.unlinkSync(hard);
  fs.chmodSync(w.parent,0o755);assert.throws(()=>readPrivateInput(w.descriptorFile,w.platform));fs.chmodSync(w.parent,0o700);
  fs.mkdirSync(path.join(w.parent,".git"));assert.throws(()=>readPrivateInput(w.descriptorFile,w.platform),/private_path_in_git/u);
});
test("stage copies only the standalone allowlist and never copies descriptor, env, credentials or main app",t=>{
  const w=workspace(t),r=stage(w);assert.equal(r.status,"staged");assert.equal(r.installed,false);assert.equal(r.generatedConfigurationPresent,false);
  assert.equal(r.publicSdkKeySha256,hash(fixtureKey));assert.match(r.readbackAuthority,/operator assertion/u);assert.equal(r.metroRequired,true);
  const files=[];const visit=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory())visit(q);else files.push(q);}};visit(w.outputDirectory);
  assert.deepEqual(Object.keys(r.sourceHashes).sort(),[...stagedSourceFiles].sort());
  for(const file of files){assert.equal(fs.readFileSync(file,"utf8").includes(fixtureKey),false,file);assert.equal(fs.statSync(file).mode&0o077,0);}
  assert.equal(files.length,stagedSourceFiles.length+1);assert.throws(()=>stage(w),/output_exists/u);
});
test("child environment drops credentials and injection; only configured prebuild receives descriptor",()=>{
  const inherited={PATH:"/toolchain",HOME:"/private-home",NODE_OPTIONS:"--require=bad",SCQ_NATIVE_DESCRIPTOR:"inherited",EXPO_TOKEN:"private",REVENUECAT_SECRET_KEY:"private",JAVA_TOOL_OPTIONS:"bad",SCQ_PLATFORM:"invalid"};
  const ordinary=childEnvironment(inherited,"/private-scratch","ios");const configured=childEnvironment(inherited,"/private-scratch","ios",input().descriptor);
  for(const key of ["NODE_OPTIONS","EXPO_TOKEN","REVENUECAT_SECRET_KEY","JAVA_TOOL_OPTIONS","SCQ_NATIVE_DESCRIPTOR"])assert.equal(ordinary[key],undefined);
  assert.equal(JSON.parse(configured.SCQ_NATIVE_DESCRIPTOR).publicSdkKey,fixtureKey);assert.equal(configured.SCQ_PLATFORM,"ios");assert.equal(configured.EXPO_NO_DOTENV,"1");
});
test("build refuses changed stage or descriptor before invoking any child",async t=>{
  const w=workspace(t);stage(w);let calls=0;const execute=async()=>{calls++;throw Error(fixtureKey);};
  fs.appendFileSync(path.join(w.outputDirectory,"project/App.js"),"\n// changed\n");await assert.rejects(build(w,{execute}),/stage_mismatch/u);assert.equal(calls,0);
});
test("modeled build uses environment-only configuration and emits no descriptor or child output in receipts",async t=>{
  const w=workspace(t),staged=stage(w),sdk=path.join(w.parent,"sdk");fs.mkdirSync(path.join(sdk,"cmdline-tools/latest/bin"),{recursive:true});fs.writeFileSync(path.join(sdk,"cmdline-tools/latest/bin/apkanalyzer"),"");
  const calls=[],native=validateInput(w.data,"android").native,project=path.join(w.outputDirectory,"project");
  const execute=async(command,args,options)=>{
    calls.push({command,args,options});assert.equal(JSON.stringify(args).includes(fixtureKey),false);
    if(args.includes("resolve"))return JSON.stringify({modules:[{packageName:"chillywood-qualification-native",projects:[{name:"chillywood-qualification-native",sourceDir:path.join(project,"modules/qualification-native/android"),modules:["expo.modules.chillywoodqualification.ChillywoodQualificationModule"]}]}]});
    if(args.includes("prebuild")){const p=path.join(project,"package.json"),d=JSON.parse(fs.readFileSync(p,"utf8"));d.scripts.android="expo run:android";d.scripts.ios="expo run:ios";fs.writeFileSync(p,JSON.stringify(d));}
    if(args.includes(":app:assembleDebug")){const apk=path.join(project,"android/app/build/outputs/apk/debug/app-debug.apk");fs.mkdirSync(path.dirname(apk),{recursive:true});fs.writeFileSync(apk,"modeled artifact only");}
    if(args[0]==="manifest")return xml(native);return fixtureKey;
  };
  const result=await build(w,{execute,inherited:{PATH:process.env.PATH,HOME:w.parent,JAVA_HOME:"/synthetic-java",ANDROID_HOME:sdk}});
  assert.equal(result.status,"compiled_not_installed");assert.equal(result.metroRequired,true);assert.equal(result.configurationDigest,staged.configurationDigest);
  assert.equal(calls.filter(c=>c.options.env.SCQ_NATIVE_DESCRIPTOR).length,1);assert.ok(calls.find(c=>c.options.env.SCQ_NATIVE_DESCRIPTOR).args.includes("prebuild"));
  const saved=fs.readFileSync(path.join(w.outputDirectory,"receipt.json"),"utf8");assert.equal(saved.includes(fixtureKey),false);assert.equal(saved.includes("descriptorJson"),false);assert.equal(result.commands.every(c=>c.status==="passed"),true);
});
test("actual pinned Expo script additions are narrowly restored while dependency or source changes fail",t=>{
  const w=workspace(t),file=path.join(w.parent,"package.json"),original='{"name":"fixture","scripts":{"start":"expo start --localhost"},"dependencies":{"expo":"54.0.37"}}\n';
  const generated=JSON.parse(original);generated.scripts.android="expo run:android";generated.scripts.ios="expo run:ios";
  fs.writeFileSync(file,JSON.stringify(generated));assert.match(restoreExpectedPrebuildPackage(file,original),/^[a-f0-9]{64}$/u);assert.equal(fs.readFileSync(file,"utf8"),original);
  for(const mutate of [d=>{d.dependencies.expo="^54.0.37";},d=>{d.scripts.start="expo start --tunnel";},d=>{d.scripts.android="expo run:android --variant release";}]){const d=structuredClone(generated);mutate(d);fs.writeFileSync(file,JSON.stringify(d));assert.throws(()=>restoreExpectedPrebuildPackage(file,original),/generated_package_changed/u);}
});
test("failed child output stays private and cannot be reported as a successful build",async t=>{
  const w=workspace(t);stage(w);await assert.rejects(build(w,{execute:async()=>{throw Error(`private child ${fixtureKey}`);},inherited:{PATH:process.env.PATH,HOME:w.parent}}),/build_failed/u);
  const raw=fs.readFileSync(path.join(w.outputDirectory,"receipt.json"),"utf8"),receipt=JSON.parse(raw);assert.equal(raw.includes(fixtureKey),false);assert.equal(receipt.status,"failed_unknown_partial_artifacts");assert.equal(receipt.installed,false);
});
test("compiled identity checks reject release, foreign app, changed configuration and enabled OTA",()=>{
  const native=validateInput(input(),"android").native,good=xml(native);verifyAndroidManifest(good,native);
  for(const bad of [good.replace('debuggable="true"','debuggable="false"'),good.replace(appId,"com.chillywood.mobile"),good.replace('allowBackup="false"','allowBackup="true"'),good.replace('value="false"','value="true"')])assert.throws(()=>verifyAndroidManifest(bad,native));
  assert.throws(()=>verifyAndroidManifest(good,{...native,configurationDigest:"f".repeat(64)}));
  const ios=validateInput(input(),"ios").native,info={CFBundleIdentifier:appId,DTPlatformName:"iphonesimulator",SCQQualificationConfiguration:ios};verifyIosInfo(info,ios);
  assert.throws(()=>verifyIosInfo({...info,DTPlatformName:"iphoneos"},ios));assert.throws(()=>verifyIosInfo({...info,SCV2TestStoreConfiguration:{}},ios));
});
test("private process errors and CLI failures never echo key-bearing input or raw child output",async t=>{
  await assert.rejects(runPrivate(process.execPath,["-e","process.stderr.write(process.env.PRIVATE_FIXTURE);process.exit(2)"],{env:{PRIVATE_FIXTURE:fixtureKey}}),error=>!error.message.includes(fixtureKey));
  const w=workspace(t);fs.writeFileSync(w.descriptorFile,`{"publicSdkKey":"${fixtureKey}","broken":`,{mode:0o600});
  const result=spawnSync(process.execPath,[script,"stage","--descriptor-file",w.descriptorFile,"--output",w.outputDirectory,"--platform","ios"],{encoding:"utf8"});
  assert.equal(result.status,1);assert.equal((result.stdout+result.stderr).includes(fixtureKey),false);assert.match(result.stderr,/withheld/u);
  fs.writeFileSync(w.descriptorFile,JSON.stringify(w.data),{mode:0o600});
  const valid=spawnSync(process.execPath,[script,"stage","--descriptor-file",w.descriptorFile,"--output",w.outputDirectory,"--platform","ios"],{encoding:"utf8"});
  assert.equal(valid.status,0);assert.equal((valid.stdout+valid.stderr).includes(fixtureKey),false);assert.equal(JSON.parse(valid.stdout).status,"staged");
  const release=spawnSync(process.execPath,[script,"build","--descriptor-file",w.descriptorFile,"--output",w.outputDirectory,"--platform","ios","--release"],{encoding:"utf8"});
  assert.equal(release.status,1);assert.equal(JSON.parse(fs.readFileSync(path.join(w.outputDirectory,"receipt.json"))).status,"staged");
});
