import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import { PGlite } from '@electric-sql/pglite';
import { isS3ObjectVersion, validateObjectBinding } from '../ops/isolated-paid-video-worker/private-object.mjs';
import { signScanResult } from '../ops/isolated-paid-video-worker/scan.mjs';
import { objectVersionCorpus as corpus } from './isolated-paid-video-object-version-corpus.mjs';
const uuid = randomUUID(), incarnation = randomUUID();
const binding = {provider:'s3',bucket:'private-bucket',routeId:uuid,incarnation,expectedSha256:'a'.repeat(64),expectedByteLength:1,
  objectKey:`sandbox-commerce-v1/${uuid}/scv1_resource_${uuid}/scv1_asset_${uuid}/${incarnation}.mp4`};
const scan = {key:new Uint8Array(32),ticketId:uuid,uploadId:'scpv_upload_'+uuid,incarnation,
  result:{protocol:'scpv-byte-scan-v1',verdict:'clean',profile:'scpv-mp4-h264-aac-v1',sha256:'a'.repeat(64)}};

test('opaque version corpus preserves scalar Unicode and enforces UTF8 bytes, not character count',()=>{
  const schema=JSON.parse(fs.readFileSync(new URL('../isolated-runtime/sandbox-commerce-v1/paid-video-contract-v2.json',import.meta.url)));
  const ajv=new Ajv({allErrors:true});ajv.addFormat('s3-object-version',isS3ObjectVersion);
  const validate=ajv.compile(schema.definitions.objectReceipt.properties.objectVersion);
  for(const [value,expected] of corpus){
    assert.equal(isS3ObjectVersion(value),expected,JSON.stringify(value));
    assert.equal(validate(value),expected,JSON.stringify(value));
    if(expected){
      validateObjectBinding({...binding,objectVersion:value});
      const signed=signScanResult({...scan,objectVersion:value});assert.equal(JSON.parse(signed.raw).objectVersion,value);
      const url=new URL('https://fixture.invalid/?versionId='+encodeURIComponent(value));assert.equal(url.searchParams.get('versionId'),value);
    }else{
      assert.throws(()=>validateObjectBinding({...binding,objectVersion:value}),/object_binding_invalid/u);
      assert.throws(()=>signScanResult({...scan,objectVersion:value}),/result_binding_invalid/u);
    }
  }
});

test('exact base SQL version predicates agree with runtime and schema corpus',async()=>{
  const db=new PGlite();
  try{
    for(const [file,variable] of [['paid-video-media.sql','body'],['paid-video-gateway-v2.sql','b']]){
      const sql=fs.readFileSync(new URL('../isolated-runtime/sandbox-commerce-v1/'+file,import.meta.url),'utf8');
      const start=sql.indexOf(`  or coalesce(${variable}->>'objectVersion','')=''`);
      assert.ok(start>0);
      const predicate=sql.slice(start,sql.indexOf('\n',sql.indexOf(" ~ U&'",start))).trim().slice(3);
      for(const [value,expected] of corpus){
        try{
          const result=await db.query(`select jsonb_typeof(${variable}->'objectVersion') = 'string' and not (${predicate}) as valid from (select $1::jsonb as ${variable}) input`,[JSON.stringify({objectVersion:value})]);
          assert.equal(result.rows[0].valid===true,expected,`${file}: ${JSON.stringify(value)}`);
        }catch(error){
          // PostgreSQL JSON rejects NUL and unpaired surrogates before predicates.
          if(typeof value==='string' && /[\u0000\ud800-\udfff]/u.test(value)){assert.equal(expected,false);assert.match(error.message,/unicode|surrogate|\\u0000|invalid input syntax for type json/i);}
          else throw error;
        }
      }
    }
  }finally{await db.close();}
});
