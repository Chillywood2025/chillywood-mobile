#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here,'../..');
const files = ['ops/isolated-paid-video-worker/scan.mjs','ops/isolated-paid-video-worker/job.mjs','ops/isolated-paid-video-worker/private-object.mjs',
 ...['operations.sql','monotonic-removal.sql','runner.mjs','worker.mjs','scan-child.mjs','reviewer.mjs','manifest.mjs'].map(name=>'ops/isolated-paid-video-operations-v2/'+name)]
 .sort().map(name=>({path:name,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}));
const manifest = { protocol:'scpv-operations-source-v1',files };
if (process.argv.length!==2) throw new Error('No arguments accepted; generate reviewed local source manifest only.');
fs.writeFileSync(path.join(here,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
process.stdout.write(JSON.stringify({sourceSha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),files:files.length})+'\n');
