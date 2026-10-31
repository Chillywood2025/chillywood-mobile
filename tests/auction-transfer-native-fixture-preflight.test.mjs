import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import ts from 'typescript';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

// Execute the native runner's actual setup and fulfilled-room fixture against
// the full SQL schema. Only adapt synchronous psql transport to asynchronous
// WASM SQL; this is fixture qualification, never native concurrency evidence.
function asyncTransport(fragment) {
  const ast=ts.createSourceFile('native-fixture.js',fragment,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const transformed=ts.transform(ast,[context=>root=>{
    const visit=node=>{
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.getText(ast)==='assert.throws')
        return ts.factory.createAwaitExpression(ts.factory.updateCallExpression(node,
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('assert'),'rejects'),node.typeArguments,
          node.arguments.map(argument=>ts.visitNode(argument,visit))));
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['query','rpc','run','make','otherBuckets','operation','allocationSnapshot','evidence'].includes(node.expression.text))
        return ts.factory.createAwaitExpression(ts.visitEachChild(node,visit,context));
      if(ts.isFunctionDeclaration(node)&&node.name?.text==='make') {
        const updated=ts.visitEachChild(node,visit,context);
        return ts.factory.updateFunctionDeclaration(updated,[ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],updated.asteriskToken,
          updated.name,updated.typeParameters,updated.parameters,updated.type,updated.body);
      }
      if(ts.isArrowFunction(node)){
        const updated=ts.visitEachChild(node,visit,context);
        let awaits=false;
        const scan=n=>{if(ts.isAwaitExpression(n))awaits=true;ts.forEachChild(n,scan);};scan(updated.body);
        if(awaits)return ts.factory.updateArrowFunction(updated,[ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],updated.typeParameters,
          updated.parameters,updated.type,updated.equalsGreaterThanToken,updated.body);
        return updated;
      }
      return ts.visitEachChild(node,visit,context);
    };return ts.visitNode(root,visit);
  }]);
  const executable=ts.createPrinter().printFile(transformed.transformed[0]);transformed.dispose();return executable;
}
const wireQuery=db=>async sql=>{
  try{return (await db.exec(sql)).flatMap(result=>result.rows.map(row=>Object.values(row).map(value=>
    value===null?'':typeof value==='object'?JSON.stringify(value):String(value)).join('|'))).join('\n').trim();}
  catch(error){
    // Each native query owns a psql process: failed transactions roll back
    // when that connection exits. Preserve that transport property in WASM.
    await db.exec('rollback');throw error;
  }
};
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
for(const control of ['current','expired','malformed'])test(`native transfer fixture qualification ${control}`, {timeout:180000}, async()=>{
  const source=readFileSync('scripts/test-auction-transfer-concurrency-postgres.mjs','utf8');
  const start=source.indexOf("  query(readFileSync('tests/fixtures/event-reservation-authority.sql'");
  const end=source.indexOf('  let checks=0;',start);
  assert.ok(start>0&&end>start);
  const calls=[...source.matchAll(/await fixture\('([A-Z_]+)'\)/gu)].map(match=>match[1]);
  assert.deepEqual(calls,['DUPLICATE','REFUND_FIRST','DISPATCH_FIRST','REVOKE_FIRST','DISPATCH_REVOKE','COST_FIRST','ELIGIBILITY','DISPATCH_ELIGIBILITY','QUALIFICATION_REVOKE']);
  assert.equal(new Set(calls.map(name=>name.replace(/[^A-Za-z0-9]/gu,''))).size,calls.length,'provider identities remain distinct');
  let fragment=source.slice(start,end);
  if(control==='expired'){
    const anchor="'active',true,now(),now()+interval '10 minutes'";
    assert.ok(fragment.includes(anchor));
    fragment=fragment.replace(anchor,"'active',true,now()-interval '11 minutes',now()-interval '1 minute'");
  }
  if(control==='malformed'){
    const anchor="const providerSuffix=name.replace(/[^A-Za-z0-9]/gu,'');";
    assert.ok(fragment.includes(anchor));fragment=fragment.replace(anchor,'const providerSuffix=name;');
  }
  const executable=asyncTransport(fragment+`\nconst fixtures=[];for(const name of ${JSON.stringify(calls)})fixtures.push(await fixture(name));return {fixtures,cap,product,actors};`);
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
  const query=wireQuery(db);
  try {
    const execute=new AsyncFunction('query','readFileSync','assert','randomUUID','createHash','delay','literal',executable);
    if(control==='expired'){
      await assert.rejects(execute(query,readFileSync,assert,randomUUID,createHash,delay,literal),/auction_platform_qualification_required/);
      return;
    }
    if(control==='malformed'){
      await assert.rejects(execute(query,readFileSync,assert,randomUUID,createHash,delay,literal),/auction_checkout_response_mismatch/);
      return;
    }
    const result=await execute(query,readFileSync,assert,randomUUID,createHash,delay,literal);
    assert.equal(result.fixtures.length,calls.length);
    assert.equal(new Set(result.fixtures.map(fixture=>fixture.contract)).size,calls.length);
    for(const fixture of result.fixtures)assert.equal(fixture.qualified.status,'qualified_test_only');
    // Setup isolation must never disable the actual production throttle: the
    // last fixture created one room; four more consume the limit, sixth denies.
    const actor=result.actors.creator.id;
    for(let i=0;i<4;i++)await db.query(`select public.enforce_abuse_rate_limit($1,'watch_party_room_create','live',5,600,'{"source":"watch_party_rooms"}')`,[actor]);
    await assert.rejects(db.query(`select public.enforce_abuse_rate_limit($1,'watch_party_room_create','live',5,600,'{"source":"watch_party_rooms"}')`,[actor]),/rate_limited/);
    const qualification=(await db.query('select extract(epoch from expires_at-verified_at)::integer seconds from private.auction_platform_qualifications where capability_id=$1',[result.cap])).rows[0];
    assert.equal(qualification.seconds,600);
    for(const interval of ['1 hour','-1 second'])await assert.rejects(db.query(`insert into private.auction_platform_qualifications
      (capability_id,platform_account_id,recipient_account_id,product_id,platform_product_id,evidence_reference,recipient_transfer_capability,enabled,verified_at,expires_at)
      select capability_id,platform_account_id,recipient_account_id,product_id,platform_product_id,evidence_reference,recipient_transfer_capability,enabled,
      verified_at,verified_at+interval '${interval}' from private.auction_platform_qualifications where capability_id=$1`,[result.cap]),/auction_platform_qualifications_check/);
  } finally {await db.close();}
});

test('all native transfer schedule bodies pass serial SQL preflight, not concurrency proof',{timeout:180000},async()=>{
  const source=readFileSync('scripts/test-auction-transfer-concurrency-postgres.mjs','utf8');
  const start=source.indexOf("  query(readFileSync('tests/fixtures/event-reservation-authority.sql'");
  const end=source.indexOf("  console.log('Auction transfer native concurrency:",start);
  let fragment=source.slice(start,end);
  const raceStart=fragment.indexOf('  async function race('),raceEnd=fragment.indexOf('  const svc=',raceStart);
  assert.ok(start>0&&end>start&&raceStart>0&&raceEnd>raceStart);
  // Execute both bodies in their specified commit order. This intentionally
  // cannot establish pg_blocking_pids/barriers or any native race claim.
  fragment=fragment.slice(0,raceStart)+`async function race(label,holderSql,waiterSql){
    const holder=await query('begin;'+holderSql+'commit;');
    const waiter=await query('begin;'+waiterSql+'commit;');checks++;
    return [values(holder).at(-1),values(waiter).at(-1)];
  }\n`+fragment.slice(raceEnd);
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
  try {
    const execute=new AsyncFunction('query','readFileSync','assert','randomUUID','createHash','delay','literal',asyncTransport(fragment+'\nreturn checks;'));
    assert.equal(await execute(wireQuery(db),readFileSync,assert,randomUUID,createHash,delay,literal),14);
  } finally {await db.close();}
});

for(const runner of ['merch-tracking','merch-return-cases'])test(`native ${runner} actual checkout fixtures replay against current schema`,{timeout:180000},async()=>{
  const source=readFileSync(`scripts/test-${runner}-concurrency-postgres.mjs`,'utf8');
  const start=source.indexOf("  query(readFileSync('tests/fixtures/event-reservation-authority.sql'");
  const end=source.indexOf(runner==='merch-tracking'?"  await race('two orders":"  const opened=await race(",start);
  assert.ok(start>0&&end>start);
  // Stop before real backend schedules; execute every unchanged seed/receipt
  // assertion and inspect the resulting orders without simulating lock races.
  const ast=ts.createSourceFile('runner.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),qualifications=[];
  const find=node=>{
    if(ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='query'
      &&node.expression.arguments[0]?.getText(ast).includes('insert into private.merch_tracking_qualification'))qualifications.push(node.getText(ast));
    ts.forEachChild(node,find);
  };find(ast);assert.equal(qualifications.length,1,'exact native tracking qualification seed');
  const executable=asyncTransport(source.slice(start,end)+'\n'+qualifications[0]+`\nreturn ${runner==='merch-tracking'?'[firstOrder,secondOrder]':'[order]'};`);
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
  try {
    const execute=new AsyncFunction('query','readFileSync','assert','randomUUID','lit','json','parsed',executable);
    const ids=await execute(wireQuery(db),readFileSync,assert,randomUUID,literal,value=>`${literal(JSON.stringify(value))}::jsonb`,value=>JSON.parse(value.split('\n').at(-1)));
    for(const id of ids){
      const order=(await db.query('select payment_status,fulfillment_address_policy_version,return_case_protocol from public.merch_orders where id=$1',[id])).rows[0];
      assert.equal(order.payment_status,'paid');
      assert.ok(order.fulfillment_address_policy_version);
      assert.ok(order.return_case_protocol);
    }
  } finally {await db.close();}
});
