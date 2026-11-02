#!/usr/bin/env node
import {appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
appendFileSync('/tmp/renderer-early-fractional-controls/commands.jsonl',JSON.stringify(process.argv.slice(2))+'\n');
const r=spawnSync('/usr/bin/ffmpeg',process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);
