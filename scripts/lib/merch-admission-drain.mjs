// Pure validation only: no database connection, mutation, termination or timer.
import assert from 'node:assert/strict';
const identityKeys=['database','databaseOid','systemIdentifier','postmasterStart','serverAddress','serverPort'];
export function assessMerchAdmissionDrain(snapshot,{baseline,cutoff}={}) {
 assert.equal(snapshot.primary,true,'not primary');
 assert.equal(snapshot.trackActivities,'on');assert.equal(snapshot.readAllStats,true);
 assert.equal(snapshot.hiddenActivityRows,0);assert.equal(snapshot.unknownActivityRows,0);
 assert.equal(typeof snapshot.systemIdentifier,'string');assert.match(snapshot.systemIdentifier,/^\d+$/u);
 assert.equal(typeof snapshot.database,'string');assert.ok(snapshot.database.length);
 assert.ok(Number.isInteger(snapshot.databaseOid)&&snapshot.databaseOid>0);
 assert.ok(Number.isFinite(Date.parse(snapshot.postmasterStart)));
 for(const key of identityKeys){assert.ok(Object.hasOwn(snapshot,key),`missing ${key}`);if(baseline)assert.deepEqual(snapshot[key],baseline[key],`primary identity changed: ${key}`);}
 assert.ok(Number.isFinite(Date.parse(snapshot.observedAt)));
 assert.ok(Number.isInteger(snapshot.preparedTransactions)&&snapshot.preparedTransactions>=0);
 assert.ok(Array.isArray(snapshot.transactions));
 const limit=cutoff===undefined?Date.parse(snapshot.observedAt):Date.parse(cutoff);
 assert.ok(Number.isFinite(limit)&&Date.parse(snapshot.observedAt)>=limit,'invalid or future cutoff');
 const blockers=snapshot.transactions.filter(row=>!Number.isFinite(Date.parse(row.transactionStart))||Date.parse(row.transactionStart)<=limit);
 return {drained:blockers.length===0&&snapshot.preparedTransactions===0,blockers,preparedTransactions:snapshot.preparedTransactions};
}
