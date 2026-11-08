// Minimum synthetic shared projections plus the exact seven-file module.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {installSql} from './receipts.fixture.mjs';
export function historyInstallSql(here){
 const install=installSql(here);
 const finalizer=fs.readFileSync(path.join(here,'../permissions-finalize.sql'),'utf8');
 const history=fs.readFileSync(path.join(here,'../history.sql'),'utf8');
 assert.ok(install.sql.endsWith(finalizer+'commit;'));
 return {...install,sql:install.sql.slice(0,-(finalizer+'commit;').length)+history+finalizer+'commit;',
  sourceHashes:{...install.sourceHashes,'history.sql':createHash('sha256').update(history).digest('hex')}};
}
