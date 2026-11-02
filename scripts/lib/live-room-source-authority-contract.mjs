import assert from 'node:assert/strict';
import ts from 'typescript';
const parse=source=>ts.createSourceFile('candidate.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const find=(root,predicate)=>{const found=[];function visit(node){if(predicate(node))found.push(node);ts.forEachChild(node,visit);}visit(root);return found;};
const method=(node,name)=>ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text===name;
const text=node=>node&&ts.isStringLiteral(node)?node.text:null;
export function assertLiveKitAuthoritativeRoomSelect(source) {
  const declarations=find(parse(source),n=>ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text==='watchPartyRoom');
  assert.equal(declarations.length,1,'one authoritative watchPartyRoom query');
  let node=declarations[0].initializer;
  assert.ok(node&&ts.isAwaitExpression(node),'room authority is awaited');node=node.expression;
  assert.ok(method(node,'maybeSingle')&&node.arguments.length===0,'one exact room result');node=node.expression.expression;
  assert.ok(method(node,'eq')&&text(node.arguments[0])==='party_id'&&ts.isIdentifier(node.arguments[1])&&node.arguments[1].text==='roomName','query binds exact requested room');node=node.expression.expression;
  assert.ok(method(node,'select')&&node.arguments.length===1&&text(node.arguments[0]),'literal authoritative room column selection');
  const columns=text(node.arguments[0]).split(',').map(s=>s.trim());
  for(const field of ['party_id','host_user_id','room_type','content_access_rule','is_active','started_at','updated_at','last_activity_at','room_generation','host_settings_revision','discovery_paused'])
    assert.ok(columns.includes(field),`authoritative room column ${field}`);
  assert.ok(!columns.includes('*'),'no accidental wildcard room disclosure');node=node.expression.expression;
  assert.ok(method(node,'from')&&text(node.arguments[0])==='watch_party_rooms'&&ts.isIdentifier(node.expression.expression)&&node.expression.expression.text==='adminClient','exact service-side source table');
}
export function assertPublicRoomCountAuthority({home,explore,title,helper}) {
  for(const [name,source] of Object.entries({home,explore,title})) {
    assert.equal(find(parse(source),n=>method(n,'from')&&['watch_party_rooms','watch_party_room_memberships','watch_party_room_messages'].includes(text(n.arguments[0]))).length,0,`${name}: no raw private room count/read`);
  }
  for(const [name,source] of Object.entries({explore,title}))
    assert.ok(find(parse(source),n=>ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='usePublicPartyRoomCounts').length>0,`${name}: mounted canonical count hook`);
  const calls=find(parse(helper),n=>method(n,'rpc')&&text(n.arguments[0])==='read_public_party_room_counts');
  assert.equal(calls.length,1,'one canonical public Party count RPC');
  const args=calls[0].arguments[1];
  assert.ok(args&&ts.isObjectLiteralExpression(args)&&args.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText()==='p_title_ids'&&p.initializer.getText()==='batch'),'counts bind bounded title batch');
  assert.ok(ts.isPropertyAccessExpression(calls[0].parent)&&calls[0].parent.name.text==='abortSignal'
    &&ts.isCallExpression(calls[0].parent.parent)&&calls[0].parent.parent.arguments[0]?.getText()==='signal','canonical count read retains cancellation');
}
