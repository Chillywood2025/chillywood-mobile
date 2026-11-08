import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), { descriptor } = require("../config.js"), root = fileURLToPath(new URL("..", import.meta.url));
const id = n => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const run = (bin, args, cwd) => { const result = spawnSync(bin, args, { cwd, encoding: "utf8", timeout: 120000, maxBuffer: 2000000 }); assert.equal(result.status, 0, `${bin}: ${result.stderr}`); return result.stdout; };
const java = process.env.TEST_STORE_JAVA_HOME ?? "/Applications/Android Studio.app/Contents/jbr/Contents/Home";

test("compiled Java durable policy fixes identity, fences restart and permanently seals without erasing pending completion", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scq-java-"));
  try {
    fs.writeFileSync(path.join(dir, "Lifecycle.java"), `import java.util.*; import expo.modules.chillywoodqualification.QualificationPolicy;
public class Lifecycle {
 static void check(boolean b){if(!b)throw new AssertionError();} static void denied(Runnable r){try{r.run();throw new AssertionError();}catch(IllegalStateException expected){}}
 @SuppressWarnings("unchecked") static <T extends Throwable> void sneaky(Throwable failure)throws T{throw (T)failure;}
 static class Store implements QualificationPolicy.Store {Map<String,String> value;int writes;boolean fail,ioAfterWrite,ioOnLoad;public Map<String,String>load(){if(ioOnLoad)Lifecycle.<RuntimeException>sneaky(new java.io.IOException("readback fixture"));return value==null?null:new HashMap<>(value);}public void commit(Map<String,String>v){writes++;if(fail)throw new IllegalStateException();value=new HashMap<>(v);if(ioAfterWrite)Lifecycle.<RuntimeException>sneaky(new java.io.IOException("write fixture"));}}
 public static void main(String[]args){String run="${id(1)}",one="${id(2)}",two="${id(3)}",fp="${"a".repeat(64)}";Store s=new Store();QualificationPolicy p=new QualificationPolicy(s);int[]n={0};
 check(QualificationPolicy.cacheMatches("fixed",false,List.of()));check(!QualificationPolicy.cacheMatches("fixed",true,List.of()));check(!QualificationPolicy.cacheMatches("fixed",true,List.of("foreign")));
 p.bind("fixed",run,()->false,()->n[0]++);p.bind("fixed",run,()->true,()->n[0]++);check(n[0]==1);
 String lookup=p.beginLookup(one,run);denied(()->p.beginLookup(two,run));p.endLookup(lookup);String token=p.beginLookup(one,run);String ticket=p.reserveAfterLookup(token,one,run,fp,"prepared");check(s.value.get("record:"+one).equals("prepared"));
 QualificationPolicy reopened=new QualificationPolicy(s);reopened.bind("fixed",run,()->false,()->{});denied(()->reopened.reserve(two,run,fp,"prepared"));denied(()->reopened.invoke(ticket,one,run,fp,"invoking"));
 p.invoke(ticket,one,run,fp,"invoking");denied(()->p.invoke(ticket,one,run,fp,"invoking"));
 p.seal();check(p.sealed());check(p.active().equals(one));denied(()->p.reserve(two,run,fp,"prepared"));p.complete(one,"completed");check(p.active().isEmpty());check(p.records().equals(List.of("completed")));check(p.sealed());
 QualificationPolicy sealed=new QualificationPolicy(s);denied(()->sealed.bind("fixed",run,()->false,()->{}));
 Store t=new Store();QualificationPolicy switcher=new QualificationPolicy(t);switcher.bind("fixed",run,()->false,()->{});denied(()->switcher.bind("foreign",run,()->false,()->{}));denied(()->switcher.bind("fixed",run,()->false,()->{}));
 Store failed=new Store();QualificationPolicy broken=new QualificationPolicy(failed);broken.bind("fixed",run,()->false,()->{});failed.fail=true;denied(()->broken.seal());failed.fail=false;denied(()->broken.current(run));denied(()->broken.reserve(two,run,fp,"prepared"));
 for(boolean readback:List.of(false,true)){Store io=new Store();QualificationPolicy retired=new QualificationPolicy(io);retired.bind("fixed",run,()->false,()->{});io.ioAfterWrite=!readback;io.ioOnLoad=readback;denied(()->retired.reserve(one,run,fp,"prepared"));io.ioAfterWrite=false;io.ioOnLoad=false;Map<String,String> observed=io.load();int writes=io.writes;check(observed.get("record:"+one).equals("prepared"));check(retired.retired());denied(()->retired.seal());denied(()->retired.current(run));denied(()->retired.reserve(two,run,fp,"prepared"));check(io.writes==writes&&io.load().equals(observed));}
 Store callback=new Store();QualificationPolicy uncertain=new QualificationPolicy(callback);uncertain.bind("fixed",run,()->false,()->{});String callbackHandle=uncertain.reserve(one,run,fp,"prepared");uncertain.invoke(callbackHandle,one,run,fp,"invoking");callback.ioOnLoad=true;denied(()->uncertain.complete(one,"completed"));callback.ioOnLoad=false;Map<String,String> completed=callback.load();int saved=callback.writes;denied(()->uncertain.complete(one,"retry"));denied(()->uncertain.seal());check(callback.writes==saved&&callback.load().equals(completed));check(completed.get("record:"+one).equals("completed"));
 Store capacity=new Store();QualificationPolicy c=new QualificationPolicy(capacity);c.bind("fixed",run,()->false,()->{});for(int i=1;i<=32;i++){String x=String.format("c0000000-0000-4000-8000-%012d",i);String h=c.reserve(x,run,fp,"p");c.invoke(h,x,run,fp,"i");c.complete(x,"c");}check(c.records().size()==32);denied(()->c.reserve("${id(99)}",run,fp,"p"));System.out.println("java-qualified");}}
`);
    run(path.join(java, "bin/javac"), ["-d", dir, path.join(root, "modules/qualification-native/android/src/main/java/expo/modules/chillywoodqualification/QualificationPolicy.java"), path.join(dir, "Lifecycle.java")], dir);
    assert.match(run(path.join(java, "bin/java"), ["-cp", dir, "Lifecycle"], dir), /java-qualified/u);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
for (const mode of ["debug", "release"]) test(`compiled Swift ${mode} enforces actual build admission and durable sealed lifetime`, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scq-swift-"));
  try {
    const raw = descriptor(JSON.stringify({ qualificationConnectionId: id(4), qualificationConnectionRevision: 1, projectId: "source_fixture", appId: "test_app",
      publicSdkKey: "test_nonsecret_source_fixture", runId: id(1), scenarios: [{ id: id(5), label: "Source fixture", providerOfferingId: "ofrng_object", offeringIdentifier: "offering_lookup",
        providerPackageId: "pkg_object", packageIdentifier: "package_lookup", providerProductId: "prod_object", productId: "test_tip", amountMinor: 199, currency: "usd", intendedAction: "cancel" }] }), "ios");
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(raw));
    fs.writeFileSync(path.join(dir, "main.swift"), `import Foundation
final class Store {var value:[String:String]?;var fail=false,afterWrite=false,onLoad=false;var writes=0;func load()throws->[String:String]?{if onLoad{throw QualificationError.unavailable};return value};func save(_ v:[String:String])throws{writes += 1;if fail{throw QualificationError.unavailable};value=v;if afterWrite{throw QualificationError.unavailable}}}
func denied(_ f:()throws->Void){do{try f();preconditionFailure()}catch{}}
let run="${id(1)}",one="${id(2)}",two="${id(3)}",fp="${"a".repeat(64)}";let s=Store();let p=try QualificationPolicy(load:s.load,commit:s.save);var calls=0
try p.bind(ownerDocument:"fixed",capturedSession:run,alreadyConfigured:{false},configure:{calls += 1});try p.bind(ownerDocument:"fixed",capturedSession:run,alreadyConfigured:{true},configure:{calls += 1});precondition(calls==1)
let lookup=try p.beginLookup(dispatchId:one,capturedSession:run);denied{_ = try p.beginLookup(dispatchId:two,capturedSession:run)};let ticket=try p.reserveAfterLookup(token:lookup,dispatchId:one,capturedSession:run,fingerprint:fp,document:"prepared");precondition(s.value?["record:"+one]=="prepared")
let reopened=try QualificationPolicy(load:s.load,commit:s.save);try reopened.bind(ownerDocument:"fixed",capturedSession:run,alreadyConfigured:{false},configure:{});denied{try reopened.invoke(ticket:ticket,dispatchId:one,capturedSession:run,fingerprint:fp,invokingDocument:"invoking")}
try p.invoke(ticket:ticket,dispatchId:one,capturedSession:run,fingerprint:fp,invokingDocument:"invoking")
try p.seal();precondition(p.sealed && p.active==one);denied{try p.current(run)};try p.complete(dispatchId:one,completedDocument:"completed");precondition(p.sealed && p.active.isEmpty && p.records()==["completed"])
let sealed=try QualificationPolicy(load:s.load,commit:s.save);denied{try sealed.bind(ownerDocument:"fixed",capturedSession:run,alreadyConfigured:{false},configure:{})}
let failed=Store();let broken=try QualificationPolicy(load:failed.load,commit:failed.save);try broken.bind(ownerDocument:"fixed",capturedSession:run,alreadyConfigured:{false},configure:{});failed.fail=true;denied{try broken.seal()};failed.fail=false;denied{try broken.current(run)};denied{_ = try broken.reserve(dispatchId:two,capturedSession:run,fingerprint:fp,preparedDocument:"prepared")}
for readback in [false,true]{let io=Store();let retired=try QualificationPolicy(load:io.load,commit:io.save);try retired.bind(ownerDocument:"fixed",capturedSession:run,alreadyConfigured:{false},configure:{});io.afterWrite = !readback;io.onLoad=readback;denied{_ = try retired.reserve(dispatchId:one,capturedSession:run,fingerprint:fp,preparedDocument:"prepared")};io.afterWrite=false;io.onLoad=false;let observed=try io.load(),writes=io.writes;precondition(observed?["record:"+one]=="prepared" && retired.retired);denied{try retired.seal()};denied{try retired.current(run)};denied{_ = try retired.reserve(dispatchId:two,capturedSession:run,fingerprint:fp,preparedDocument:"prepared")};let retained=try io.load();precondition(io.writes==writes && retained==observed)}
let callback=Store();let uncertain=try QualificationPolicy(load:callback.load,commit:callback.save);try uncertain.bind(ownerDocument:"fixed",capturedSession:run,alreadyConfigured:{false},configure:{});let h=try uncertain.reserve(dispatchId:one,capturedSession:run,fingerprint:fp,preparedDocument:"prepared");try uncertain.invoke(ticket:h,dispatchId:one,capturedSession:run,fingerprint:fp,invokingDocument:"invoking");callback.onLoad=true;denied{try uncertain.complete(dispatchId:one,completedDocument:"completed")};callback.onLoad=false;let completed=try callback.load(),saved=callback.writes;denied{try uncertain.complete(dispatchId:one,completedDocument:"retry")};denied{try uncertain.seal()};let retained=try callback.load();precondition(callback.writes==saved && retained==completed && completed?["record:"+one]=="completed")
let data=try Data(contentsOf:URL(fileURLWithPath:"config.json"));let config=try JSONSerialization.jsonObject(with:data) as! [String:String]
#if DEBUG
let parsed=try QualificationContract.build(QualificationPolicy.applicationId,config);precondition(parsed["mode"] as? String=="record-only-debug")
denied{_ = try QualificationContract.build("com.chillywood.mobile",config)};var bad=config;bad["publicSdkKey"]="appl_live";denied{_ = try QualificationContract.build(QualificationPolicy.applicationId,bad)}
#else
denied{_ = try QualificationContract.build(QualificationPolicy.applicationId,config)}
#endif
print("swift-qualified")
`);
    const sources = ["QualificationPolicy.swift", "QualificationContract.swift"].map(f => path.join(root, "modules/qualification-native/ios", f));
    run("/usr/bin/swiftc", ["-module-cache-path", path.join(dir, "cache"), ...(mode === "debug" ? ["-D", "DEBUG"] : []), ...sources, path.join(dir, "main.swift"), "-o", path.join(dir, "test")], dir);
    assert.match(run(path.join(dir, "test"), [], dir), /swift-qualified/u);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
