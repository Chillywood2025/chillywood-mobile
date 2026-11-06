import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=fileURLToPath(new URL('../../supabase/tests/',import.meta.url));
// psql resolves this one fixture relative to the test file, not the shell cwd.
// Restrict the adapter to the same explicit directive immediately after BEGIN;
// never interpret arbitrary psql commands embedded in SQL strings or bodies.
export function readPgtapSource(name) {
  if(!/^[a-z0-9_]+_test\.sql$/u.test(name)) throw new Error('invalid pgTAP test name');
  const source=fs.readFileSync(path.join(directory,name),'utf8');
  return source.replace(/^begin;\r?\n\\ir fixtures\/automatic-commerce\.inc\r?\n/u,
    ()=>`begin;\n${fs.readFileSync(path.join(directory,'fixtures/automatic-commerce.inc'),'utf8')}\n`)
    .replace(/create extension if not exists pgtap with schema extensions;/giu,'');
}
