// Local-only disposable PG17.6 fixture. Never accepts a target URL or credentials.
// Derived from native-store-play-handoff-v1/handoff.native.mjs startup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';

export async function localManagedFixture({sourceRoot,bin,output,oidPadding=false,eventParity=false}) {
  assert.ok(path.isAbsolute(bin)&&path.isAbsolute(sourceRoot)&&path.isAbsolute(output));
  fs.mkdirSync(output,{recursive:true});
  const work=fs.mkdtempSync(path.join(output,'ephemeral-pg-')),data=path.join(work,'data');
  const port=await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{const address=server.address();server.close(error=>error?reject(error):resolve(String(address.port)));});});
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')));
  const args=(user='fixture_admin',database='play_catalog_fixture')=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',user,'-d',database];
  const run=(tool,argv,input)=>spawnSync(path.join(bin,tool),argv,{input,encoding:'utf8',env,timeout:30000,maxBuffer:64*1024*1024});
  const invoke=(tool,argv,input)=>{const r=run(tool,argv,input);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
  const q=(sql,user='fixture_admin')=>invoke('psql',args(user),sql);
  let started=false;
  const stop=()=>{if(started){invoke('pg_ctl',['-D',data,'-w','-t','15','-m','immediate','stop']);started=false;}fs.rmSync(work,{recursive:true,force:true});};
  try {
    assert.match(invoke('postgres',['--version']),/PostgreSQL\) 17\.6/u);
    invoke('initdb',['-D',data,'-U','fixture_admin','--encoding=UTF8','--no-locale','--auth=trust']);
    invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c autovacuum=off`,'start']);started=true;
    invoke('psql',args('fixture_admin','postgres'),'create role postgres login createrole bypassrls nosuperuser nocreatedb noinherit;create database play_catalog_fixture owner postgres;');
    const runtime=path.join(sourceRoot,'isolated-runtime/sandbox-commerce-v1');
    const read=name=>fs.readFileSync(path.join(runtime,name),'utf8');
    const declaration='create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
    const authority=read('tests/authority.fixture.sql');assert.equal(authority.split(declaration).length,2);
    q('create role supabase_read_only_user login nosuperuser nocreaterole nocreatedb noreplication bypassrls;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
      +read('tests/premium-authority.fixture.sql')+authority.replace(declaration,'-- declarations supplied by real core')
      +'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);'
      +`grant usage on schema auth to postgres;do $$declare t record;begin
        for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('auth','public') and c.relkind='r' loop
        execute format('grant select,maintain on table %I.%I to postgres',t.nspname,t.relname);
        execute format('alter table %I.%I enable row level security',t.nspname,t.relname);
        execute format('alter table %I.%I force row level security',t.nspname,t.relname);end loop;end$$;
        alter default privileges for role postgres grant execute on functions to authenticated;`);
    if(oidPadding)q(`create schema fixture_oid_padding;do $$begin for i in 1..64 loop execute format('create table fixture_oid_padding.padding_%s(id integer)',i);end loop;end$$;drop schema fixture_oid_padding cascade;`);
    if(eventParity){const {installEventTriggerParity}=await import(pathToFileURL(path.join(sourceRoot,'isolated-runtime/native-store-sandbox-v1/event-trigger-parity.fixture.mjs')));installEventTriggerParity(q);}
    const {nativeStoreInstallProfile}=await import(pathToFileURL(path.join(sourceRoot,'isolated-runtime/native-store-sandbox-v1/install-profile.mjs')));
    const profile=nativeStoreInstallProfile();
    assert.equal(profile.sourceDigest,'e07d2e3266789b1d5e5c9665e03245f6edf1abb43643e16b06d718ef4c77e33d');assert.equal(profile.files.length,48);
    q(profile.sql,'postgres');
    assert.equal(q("select rolsuper,rolcreaterole,rolbypassrls,rolinherit from pg_roles where rolname='postgres';"),'f|t|t|f');
    // Local external facts and retained base rows only; never part of extension payload.
    // A fixed timestamp keeps the nonempty retention proof reproducible.
    q(`select authority_fixture.reset();
      update auth.users set email_confirmed_at='2026-11-10T00:00:00Z';
      update auth.sessions set not_after='2026-11-10T01:00:00Z';
      update sandbox_commerce_v1.declarations set updated_at='2026-11-10T00:00:00Z';`);
    return {q,run,args,profile,stop,port};
  } catch(error) {if(started)stop();throw error;}
}
