import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';

// Reuse the actual native runner's fulfilled purchase fixture. Only its SQL
// transport is adapted to PGlite; this establishes no native concurrency proof.
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
    value===null?'':typeof value==='boolean'?(value?'t':'f'):typeof value==='object'?JSON.stringify(value):String(value)).join('|'))).join('\n').trim();}
  catch(error){
    // Each native query owns a psql process: failed transactions roll back
    // when that connection exits. Preserve that transport property in WASM.
    await db.exec('rollback');throw error;
  }
};

export async function createFeeReportAuctionFixture(db) {
 const source=readFileSync('scripts/test-auction-transfer-concurrency-postgres.mjs','utf8');
 const start=source.indexOf("  query(readFileSync('tests/fixtures/event-reservation-authority.sql'");
 const end=source.indexOf('  let checks=0;',start);
 assert.ok(start>0&&end>start);
 const executable=asyncTransport(source.slice(start,end)+"\nreturn await fixture('FEEEVIDENCE');");
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const literal=value=>`'${String(value).replaceAll("'","''")}'`;
 return new AsyncFunction('query','readFileSync','assert','randomUUID','createHash','delay','literal',executable)(wireQuery(db),readFileSync,assert,randomUUID,createHash,delay,literal);
}
