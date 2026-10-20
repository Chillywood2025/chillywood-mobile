import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const file='app/admin.tsx';
const source=readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function expression(name){
  let found;
  function visit(node){
    if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name) found=node.initializer.getText(ast);
    ts.forEachChild(node,visit);
  }
  visit(ast);assert.ok(found,name);return found;
}
function labelled(label){
  let found;
  function visit(node){
    if(ts.isObjectLiteralExpression(node)&&node.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)==='label'&&ts.isStringLiteral(p.initializer)&&p.initializer.text===label))found=node.getText(ast);
    ts.forEachChild(node,visit);
  }
  visit(ast);assert.ok(found,label);return found;
}
function run(code,context){
  const scope={exports:{},...context};
  vm.runInNewContext(ts.transpileModule(`exports.value=(${code});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);
  return scope.exports.value;
}
const baseline={canReviewSafetyReports:true,safetyReportsLoading:false,safetyReportQueueConnected:true};

test('readable report queue with failed overview never invents a backed zero or success tone',()=>{
  const scope={...baseline,safetyReportQueueSummary:{needsReviewCount:null,criticalHighRiskCount:null}};
  scope.recentReportsNeedsReview=run(expression('recentReportsNeedsReview'),scope);
  scope.recentReportsCriticalHigh=run(expression('recentReportsCriticalHigh'),scope);
  scope.reportOverviewUnavailable=run(expression('reportOverviewUnavailable'),scope);
  assert.equal(scope.recentReportsNeedsReview,null);
  assert.equal(scope.reportOverviewUnavailable,true);
  assert.equal(run(expression('queueTone'),scope),'manual');
  scope.formatHomeCount=(value,loading)=>loading?'Loading':value==null?'Not Connected':String(value);
  scope.reportValue=run(expression('reportValue'),scope);
  const tile=run(labelled('Recent Reports'),scope);
  assert.equal(tile.value,'Unknown');assert.equal(tile.qualifier,'Partial');assert.equal(tile.tone,'manual');
  assert.match(tile.body,/overview counts are unavailable/);
  assert.equal(run(expression('partialVisibility'),{...scope,appConfigNotConnected:false,immutableAuditNotConnected:false,
    reportQueueNotConnected:false,dmcaNotConnected:false,liveOpsNotConnected:false,
    adminV1ReadModel:{premiumActiveCount:0,activeLiveRoomCount:0,activeWatchPartyCount:0,uploadsTodayCount:0}}),true);
});

test('verified zero stays distinct from missing counts and positive counts retain attention',()=>{
  for(const count of [0,4]){
    const scope={...baseline,safetyReportQueueSummary:{needsReviewCount:count,criticalHighRiskCount:0},
      recentReportsNeedsReview:count,recentReportsCriticalHigh:0,reportOverviewUnavailable:false,reportValue:String(count)};
    assert.equal(run(expression('queueTone'),scope),count?'manual':'success');
    assert.equal(run(labelled('Recent Reports'),scope).tone,count?'manual':'success');
  }
  const scope={...baseline,recentReportsNeedsReview:0,recentReportsCriticalHigh:null,reportOverviewUnavailable:true,reportValue:'0'};
  assert.equal(run(labelled('Recent Reports'),scope).tone,'manual');
});

test('Platform Targets counts every loaded page instead of only the latest page summary',()=>{
  const tile=run(labelled('Platform Targets'),{safetyReportQueueConnected:true,
    safetyReportQueueSummary:{platformOwnedTargetCount:0},
    safetyReports:[{id:1,platformOwnedTarget:true},{id:2,platformOwnedTarget:false},{id:3,platformOwnedTarget:true}]});
  assert.equal(tile.value,'2');
});
