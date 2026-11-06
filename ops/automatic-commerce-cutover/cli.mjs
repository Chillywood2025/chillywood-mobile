#!/usr/bin/env node
// The supported command boundary imports only built-ins before byte-checking
// all executable helpers and the contract against the exact committed head.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const files=['cli.mjs','prepare.mjs','bridge.mjs','catalog.mjs','contract.json'];
try {
 const [, ,mode,source,...captures]=process.argv;
 if(!/^[a-f0-9]{40}$/u.test(source??'')||!['readback','bridge','finalize','restore'].includes(mode)||!captures.length)throw Error('USAGE_cli_MODE_FULL_TOOL_COMMIT_BASELINE_CAPTURE_JSON');
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 if(git('rev-parse','HEAD').trim()!==source)throw Error('SOURCE_HEAD_CHANGED');
 // Git status alone ignores assume-unchanged and skip-worktree files.
 for(const name of files){const file=`ops/automatic-commerce-cutover/${name}`;
  if(fs.readFileSync(path.join(root,file),'utf8')!==git('show',`${source}:${file}`))throw Error('TOOL_SOURCE_CHANGED');
 }
 if(git('status','--porcelain','--untracked-files=no').trim()!=='')throw Error('TRACKED_SOURCE_DIRTY');
 const {prepareArguments}=await import('./prepare.mjs');
 process.stdout.write(JSON.stringify(prepareArguments({mode,source,captures,root}))+'\n');
} catch(error) {
 process.stderr.write(String(error.message)+'\n');process.exitCode=1;
}
