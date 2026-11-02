import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=fs.readFileSync(new URL('../app/profile/[userId].tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('profile.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const screen=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ProfileScreen');
const declaration=screen.body.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='profileSocialFeedItems'));
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const feedModule={exports:{}};vm.runInNewContext(compile(fs.readFileSync(new URL('../_lib/profileSocialFeed.ts',import.meta.url),'utf8')),feedModule);
const discoveryModule={exports:{},require:name=>{assert.equal(name,'./discoveryFeed');return{isDiscoveryFeedItemEligibleForRanking:()=>true};}};
vm.runInNewContext(compile(fs.readFileSync(new URL('../_lib/profileFeedDiscovery.ts',import.meta.url),'utf8')),discoveryModule);
function evaluate(posts,items,mode='own_profile_social_feed'){
  const context={...feedModule.exports,...discoveryModule.exports,userId:'viewer',canViewFullProfile:true,profileSocialFeedMode:mode,profilePosts:posts,creatorVideos:[],profileSocialFeedActor:{userId:'viewer',displayName:'Viewer'},feedPages:{items},
    profileDiscovery:{items:[]},profileSuggestedDiscovery:{items:[]},profileNotificationActivity:{items:[]},profileSocialFeedExtras:{circlePosts:[],followedPosts:[],circleVideos:[],followedVideos:[],notifications:[],actorsByUserId:{},circleUserIds:[],followedChannelUserIds:[]},useMemo:fn=>fn(),exports:{}};
  vm.runInNewContext(compile(declaration.getText(ast)+'\nexports.result=profileSocialFeedItems;'),context);return context.exports.result;
}
const post=id=>({id,userId:'viewer',body:id,visibility:'public',moderationStatus:'active',createdAt:'2026-10-01T00:00:00Z',attachments:[]});
const item=p=>({id:`relationship-profile_post-${p.id}`,type:'my_post',post:p,actor:{userId:'viewer',displayName:'Viewer'}});
test('production own feed reconciliation inserts a newly created or exact-linked post once and removes deleted server items',()=>{
  const old=post('old'),fresh=post('fresh'),linked=post('linked');
  let result=evaluate([old,fresh,linked],[item(old)]);
  assert.deepEqual(Array.from(result,x=>x.post.id),['fresh','linked','old']);
  result=evaluate([fresh,linked],[item(old),item(fresh)]);
  assert.deepEqual(Array.from(result,x=>x.post.id),['linked','fresh']);
  assert.equal(result.filter(x=>x.post.id==='fresh').length,1);
});
test('visitor feed builder does not leak another author from an injected relationship page',()=>{
  const result=evaluate([post('owner'),{...post('other'),userId:'friend'}],[item(post('private'))],'public_profile_activity_feed');
  assert.deepEqual(Array.from(result,x=>x.post.id),['owner']);
});
test('production FlatList data pins exact shared post and gates all cards behind home/privacy',()=>{
  let list;
  const visit=node=>{if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='FlatList')list=node;ts.forEachChild(node,visit);};visit(screen);
  assert.ok(list,'Posts must use actual virtualized FlatList, not nested ScrollView cards');
  const prop=name=>list.attributes.properties.find(p=>p.name?.getText(ast)===name);
  assert.ok(prop('ListHeaderComponent'),'Existing profile chrome is retained in the list header');
  assert.equal(prop('initialNumToRender').initializer.expression.getText(ast),'6');
  const expression=prop('data').initializer.expression.getText(ast);
  const context={activeTab:'home',shouldShowLockedShell:false,sharedPostId:'linked',profileSocialFeedItems:[item(post('recent')),item(post('linked'))]};
  const result=vm.runInNewContext(expression,context);assert.equal(result[0].post.id,'linked');
  assert.equal(vm.runInNewContext(expression,{...context,shouldShowLockedShell:true}).length,0);
  assert.equal(vm.runInNewContext(expression,{...context,activeTab:'about'}).length,0);
});
