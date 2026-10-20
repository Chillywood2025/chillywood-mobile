import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('batched locator normalization preserves the original PostgreSQL four-pass contract', async () => {
  const db=new PGlite();
  try {
    await db.exec('create schema private');
    for(const [file,name] of [
      ['20261020141554_deleted_media_reference_retirement.sql','original_normalize'],
      ['20261020201310_deleted_content_stage_recovery.sql','batched_normalize'],
    ]) {
      const sql=readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
      const definition=sql.match(/create (?:or replace )?function private\.deleted_media_normalize_locator\(p_text text\)[\s\S]*?end \$\$;/)?.[0];
      assert.ok(definition);
      await db.exec(definition.replace('private.deleted_media_normalize_locator','private.'+name));
    }
    const inputs=[null,'','plain/path/source.mp4','café/原本','%','%%20','%2','%G1','%00%1f%7F%80%ff',
      '%25252525252F','%2525252F','x%25%32%46y','line\n%2f\nend','%2F'.repeat(20)];
    for(let code=0;code<256;code++) inputs.push(`prefix/${code.toString(16)}%${code.toString(16).padStart(2,'0')}/suffix`);
    for(const input of inputs) {
      const {rows}=await db.query('select private.original_normalize($1) original,private.batched_normalize($1) batched',[input]);
      assert.equal(rows[0].batched,rows[0].original,`normalization changed for ${JSON.stringify(input)}`);
    }
    const {rows}=await db.query("select private.batched_normalize('%252525252F') result");
    assert.equal(rows[0].result,'%2F','the fifth encoded level must remain encoded');
  } finally { await db.close(); }
});
