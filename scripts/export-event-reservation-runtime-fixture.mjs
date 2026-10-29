#!/usr/bin/env node
// Export the existing full migration replay fixture for an isolated native
// PostgreSQL test. Only managed auth/storage transport/schema is substituted;
// every application authorization, intent, projection and RLS function is real.
import {createDatabase} from '../tests/helpers/database-runtime-authority-fixture.mjs';
if(process.argv.length>2)throw new Error('This exporter accepts no arguments');
const statements=[];
class CaptureDatabase { async exec(sql) {statements.push(sql);} async close() {} }
const {replayReport}=await createDatabase({includeHeldStudio:true,applyRepair:true,implicitApiGrants:true,
  databaseFactory:async()=>new CaptureDatabase()});
process.stderr.write(`Full schema fixture: ${replayReport.files.length} migration files; ${replayReport.statements} statements; ${replayReport.skipped.length} managed-service skips.\n`);
process.stdout.write(statements.join('\n'));
