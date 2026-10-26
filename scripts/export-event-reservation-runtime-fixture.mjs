#!/usr/bin/env node
// Export the existing full migration replay fixture for an isolated native
// PostgreSQL test. Only managed auth/storage transport/schema is substituted;
// every application authorization, intent, projection and RLS function is real.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitSQL,heldStudioBundleVersions,repairMigrationPath,liveSnapshotPath} from '../tests/helpers/database-runtime-authority-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const migrationDirectory=path.join(root,'supabase/migrations');
const repairName=path.basename(repairMigrationPath);
const statements=[];
class CaptureDatabase { async exec(sql) {statements.push(sql);} async close() {} }
const source=fs.readFileSync(path.join(root,'tests/helpers/database-runtime-authority-fixture.mjs'),'utf8');
const body=source.slice(source.indexOf('export async function createDatabase')).replace('export async function','async function');
const createDatabase=new Function('fs','path','root','migrationDirectory','repairName','heldStudioBundleVersions','splitSQL',
  'liveSnapshotPath','repairMigrationPath','PGlite','pgcrypto','pg_trgm',`${body}; return createDatabase;`)(
  fs,path,root,migrationDirectory,repairName,heldStudioBundleVersions,splitSQL,liveSnapshotPath,repairMigrationPath,CaptureDatabase,{},{});
const {replayReport}=await createDatabase({includeHeldStudio:true,applyRepair:true,implicitApiGrants:true});
process.stderr.write(`Full schema fixture: ${replayReport.files.length} migration files; ${replayReport.statements} statements; ${replayReport.skipped.length} managed-service skips.\n`);
process.stdout.write(statements.join('\n'));
