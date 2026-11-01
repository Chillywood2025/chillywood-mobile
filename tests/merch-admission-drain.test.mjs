import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMerchAdmissionDrain} from '../scripts/lib/merch-admission-drain.mjs';
const snapshot=()=>({primary:true,trackActivities:'on',readAllStats:true,hiddenActivityRows:0,unknownActivityRows:0,
 database:'postgres',databaseOid:5,systemIdentifier:'1234',postmasterStart:'2026-11-01T00:00:00Z',serverAddress:'127.0.0.1',serverPort:5432,
 observedAt:'2026-11-01T01:00:00Z',preparedTransactions:0,transactions:[]});
test('drain requires complete same-primary visibility, no prepared or pre-cutoff/unknown transactions',()=>{
 const baseline=snapshot(),cutoff='2026-11-01T00:59:00Z';
 assert.equal(assessMerchAdmissionDrain(snapshot(),{baseline,cutoff}).drained,true);
 for(const patch of [{primary:false},{readAllStats:false},{hiddenActivityRows:1},{unknownActivityRows:1},
  {systemIdentifier:'456'},{databaseOid:6},{postmasterStart:'2026-11-01T00:01:00Z'},{serverAddress:'127.0.0.2'},
  {trackActivities:'off'},{observedAt:'2026-11-01T00:58:00Z'}])assert.throws(()=>assessMerchAdmissionDrain({...snapshot(),...patch},{baseline,cutoff}));
 assert.equal(assessMerchAdmissionDrain({...snapshot(),preparedTransactions:1},{baseline,cutoff}).drained,false);
 for(const transactionStart of [null,cutoff,'2026-11-01T00:58:00Z'])assert.equal(assessMerchAdmissionDrain({...snapshot(),transactions:[{transactionStart,state:'idle in transaction'}]},{baseline,cutoff}).drained,false);
 assert.equal(assessMerchAdmissionDrain({...snapshot(),transactions:[{transactionStart:'2026-11-01T00:59:30Z'}]},{baseline,cutoff}).drained,true);
});
