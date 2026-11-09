import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {canonicalArrayTextSQL} from '../scripts/google-refund-canonical-array.mjs';

test('canonical array constructor preserves exact PostgreSQL bytes, NULLs, FILTER and ordering',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create table sample(id integer primary key,item jsonb)');
  const values=[null,'null','true','false','0','-0','1.00','1e20','9007199254740993',
   '"quote\\\" slash\\\\ newline\\n"','"é 中文 😀"','[]','{}',
   '{"z":1,"aa":2,"b":3}','{"duplicate":1,"duplicate":2}',
   '[null,{"a":[1.00,"\\t"]}]'];
  let seed=12345;
  for(let i=0;i<200;i++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   values.push(JSON.stringify({id:i,n:seed,text:'x'.repeat(seed%120),a:[null,seed%2===0,'é😀']}));
  }
  for(let i=0;i<values.length;i++)await db.query('insert into sample values($1,$2::jsonb)',[i,values[i]]);
  for(const order of ['id','id desc','item::text collate "C",id','item::text desc nulls first,id']){
   for(const filter of ['',' filter(where id<0)',' filter(where id=0)',' filter(where id%3=0)']){
    const q=`select coalesce(jsonb_agg(item order by ${order})${filter}::text,'[]') original,
     ${canonicalArrayTextSQL('item',order,filter)} candidate from sample`;
    const {rows:[r]}=await db.query(q);assert.equal(r.candidate,r.original,`${order}/${filter}`);
   }
  }
  const {rows:[r]}=await db.query("select jsonb_agg(item order by id)::text original,'['||string_agg(item::text,', ' order by id)||']' broken from sample where id<2");
  assert.notEqual(r.broken,r.original,'dropping SQL NULL is not an equivalent optimization');
 }finally{await db.close();}
});
