import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {sql} from '../scripts/google-refund-tax-observer-proof/catalog.mjs';
const start=sql.indexOf(' expected_types as materialized ('),end=sql.indexOf(',\n proof as materialized (',start);
assert.ok(start>0&&end>start);
const typeQuery=`with ${sql.slice(start,end)} select key from type_faults order by key`;
async function fixture(fn){const db=new PGlite();try{await fn(db);}finally{await db.close();}}
test('complete emitted query fails closed on unauthenticated empty catalog',()=>fixture(async db=>{
 const r=await db.exec(sql);const e=r.find(x=>x.rows?.[0]?.evidence).rows[0].evidence;
 assert.notEqual(e.catalogDerivationQualified,true);assert.equal(e.expectedCatalogSha256,null);
 assert.ok(e.deltaFaults.length>0);for(const k of ['dataQualified','historyQualified','edgeQualified','deploymentQualified'])assert.equal(e[k],false);
}));
test('source-known implicit built-in collations accepted',()=>fixture(async db=>{
 await db.exec('create table public.source_types(id bigint,name text)');
 assert.deepEqual((await db.query(typeQuery)).rows,[]);
}));
test('explicit nondefault column collation rejected',()=>fixture(async db=>{
 await db.exec('create table public.drifted(value text collate "C")');
 assert.deepEqual((await db.query(typeQuery)).rows,[{key:'public.drifted.value'}]);
}));
test('unlisted formatted type rejected instead of adopted',()=>fixture(async db=>{
 await db.exec('create table public.drifted(value varchar(123))');
 assert.deepEqual((await db.query(typeQuery)).rows,[{key:'public.drifted.value'}]);
}));
test('source-known managed Auth name must be a noncollatable enum, not domain',()=>fixture(async db=>{
 await db.exec("create schema auth;create type auth.aal_level as enum('fixture');create table auth.accepted(value auth.aal_level)");
 assert.deepEqual((await db.query(typeQuery)).rows,[]);
 await db.exec('drop table auth.accepted;drop type auth.aal_level;create domain auth.aal_level as text;create table auth.rejected(value auth.aal_level)');
 assert.deepEqual((await db.query(typeQuery)).rows,[{key:'auth.rejected.value'}]);
}));
test('foreign relations remain explicit failure evidence',()=>fixture(async db=>{
 await db.exec("create foreign data wrapper no_network;create server no_network foreign data wrapper no_network;create foreign table public.foreign_drift(id bigint) server no_network");
 const r=await db.exec(sql),e=r.find(x=>x.rows?.[0]?.evidence).rows[0].evidence;
 assert.equal(e.foreignRelationCount,1);assert.notEqual(e.catalogDerivationQualified,true);assert.equal(e.expectedCatalogSha256,null);
}));
