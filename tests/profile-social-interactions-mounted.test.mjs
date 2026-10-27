import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const require=createRequire(import.meta.url),React=require('react'),ts=require('typescript');
const {createRoot}=require('react-dom/client');
let source=fs.readFileSync(new URL('../app/profile/[userId].tsx',import.meta.url),'utf8');
// Opt-in negative controls remove only the production race barrier, never
// replace the implementation with a parallel test model.
if(process.env.PROFILE_RACE_MUTANT==='comments')source=source.replace(/      if \(\(commentRevisionsRef.current.get\(key\) \?\? 0\) !== revision\) \{[\s\S]*?\n      \}/g,'');
if(process.env.PROFILE_RACE_MUTANT==='engagement')source=source.replace(/^          if \(revisions.get\(postId\).*return;\n/m,'');
const ast=ts.createSourceFile('profile.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const screen=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ProfileScreen');
const names=['renderProfilePostCard','renderProfileSocialFeedItem','onToggleProfilePostLike','onToggleProfilePostComments','loadProfilePostComments','onShareProfilePost','onPressReportProfilePost','onSaveAbout','onSubmitProfilePostComment','refreshProfilePostEngagement','onSubmitProfilePost','onDeleteProfilePost','onDeleteProfilePostCommentPress','onSelectProfileAttachment','attachProfilePostFile','attachProfilePostCommentFile'];
const selected=screen.body.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.includes(d.name.getText(ast))));
const engagementEffect=screen.body.statements.find(n=>ts.isExpressionStatement(n)&&n.getText(ast).startsWith('useEffect(')&&n.getText(ast).includes('readProfilePostEngagementStates'));
const engagementCode=ts.transpileModule(engagementEffect.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
assert.equal(selected.length,names.length);
const code=ts.transpileModule(selected.map(n=>n.getText(ast)).join('\n')+`\nObject.assign(exports,{${names.join(',')}});`,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const nodes=value=>!value||typeof value!=='object'?[]:Array.isArray(value)?value.flatMap(nodes):[value,...nodes(value.props?.children)];
const text=value=>value==null?'':typeof value==='string'||typeof value==='number'?String(value):Array.isArray(value)?value.map(text).join(''):value.props?.text??text(value.props?.children);
const post={id:'post-1',userId:'friend',body:'hello',visibility:'public',moderationStatus:'active',attachments:[]};
async function mount(t){
  const calls=[],comments=[];let tree,current=true,saveError=null;
  const context=vm.createContext({exports:{},React,styles:new Proxy({},{get:()=>({})}),
    View:'View',TouchableOpacity:'TouchableOpacity',AppText:'AppText',Text:'Text',TextInput:'TextInput',MaterialIcons:'Icon',LinkedText:'LinkedText',SocialAttachmentCard:'Attachment',ActivityIndicator:'Spinner',ConversationTimestamp:'Timestamp',
    currentUserId:'viewer',isSelfProfile:true,userId:'viewer',isOfficialProfile:false,profile:{displayName:'Viewer'},profilePostUiById:{'post-1':{engagementReady:true,engagement:{likedByViewer:false,likeCount:0,commentCount:0}}},profilePostDeletingId:null,socialIdentity:'viewer:one',socialActionKeysRef:{current:new Set()},commentRevisionsRef:{current:new Map()},engagementRevisionsRef:{current:new Map()},
    isSocialIdentityCurrent:()=>current,formatEngagementCount:(n,label)=>n?`${n} ${label}`:'',formatProfilePostDate:()=>'',isProfilePostPubliclyShareable:()=>true,isProfilePostEngageable:()=>true,shouldShowOwnerDraftMarker:()=>false,
    PROFILE_POST_COMMENT_BODY_LIMIT:2000,conversationCreatedAt:()=>null,renderComposerAvatar:()=>null,openProfileSocialActorProfile:actor=>calls.push(['profile',actor]),
    onDeleteProfilePost:()=>calls.push(['delete']),onDeleteProfilePostCommentPress:noop,onPressReportProfilePostComment:noop,clearProfilePostCommentReply:noop,onPickProfilePostCommentAttachment:noop,onSubmitProfilePostComment:noop,
    buildProfileDeepLink:id=>`chillywoodmobile://profile/${id}`,Share:{share:async value=>calls.push(['share',value])},Alert:{alert:(...args)=>calls.push(['alert',...args])},
    setProfilePostLike:async(id,liked)=>{calls.push(['like',id,liked]);return{likedByViewer:liked,likeCount:1,commentCount:0};},
    appConfig:{runtimeControls:{comments_enabled:true,attachments_enabled:true,profile_posting_enabled:true}},getUserFacingErrorMessage:(_error,fallback)=>fallback,SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE:'too large',
    PROFILE_POST_BODY_LIMIT:2000,profilePostBusy:false,profilePostDraft:'New post',profilePostAttachmentFile:null,setProfilePostBusy:noop,setProfilePostsNotice:value=>calls.push(['postNotice',value]),setProfilePosts:updater=>calls.push(['posts',updater([])]),setProfilePostUiById:noop,setProfilePostDraft:noop,setProfilePostAttachmentFile:noop,setProfilePostsReady:noop,
    createProfilePostComment:async input=>{calls.push(['createComment',input]);return{id:'new-comment',userId:'viewer',body:input.body,attachments:[]};},readProfilePostEngagementState:async()=>{throw new Error('counts offline');},
    deleteProfilePost:async(...args)=>calls.push(['deletePost',...args]),deleteProfilePostComment:async(...args)=>calls.push(['deleteComment',...args]),setProfilePostDeletingId:noop,
    profileAttachmentSheetTarget:{surface:'post',identity:'viewer:one'},setProfileAttachmentSheetTarget:noop,pickSocialAttachmentFile:async()=>({uri:'file:test'}),
    readProfilePostCommentsPage:async(id,options)=>{calls.push(['comments',id,options]);const result=comments.shift();if(result instanceof Error)throw result;return result;},
    trackModerationActionUsed:noop,setProfilePostReportTarget:value=>calls.push(['report',value]),setProfilePostCommentReportTarget:noop,setProfileMediaReportTarget:noop,setReportVisible:noop,
    aboutBusy:false,aboutDraft:'Updated About',channelAccessProfile:{displayName:'Viewer'},authority:{userId:'viewer',sessionGeneration:'one'},
    saveUserProfileAbout:async(...args)=>{calls.push(['save',...args]);if(saveError)throw saveError;return {tagline:args[0],profileAvatarUrl:'newest-avatar'};},setAboutBusy:noop,setAboutNotice:value=>calls.push(['notice',value]),setAboutDraft:noop,setChannelAccessProfile:value=>calls.push(['profileSaved',value]),
  });
  context.updateProfilePostUiState=(id,updater)=>{if(current)context.profilePostUiById[id]=updater(context.profilePostUiById[id]??{});};
  vm.runInContext(code,context);
  let item={id:'circle:post-1',type:'chilly_circle_post',post,actor:{userId:'friend',displayName:'Friend',handle:'friend'}};
  function Host(){tree=context.exports.renderProfileSocialFeedItem(item);return null;}
  const root=createRoot(container());const render=()=>React.act(async()=>root.render(React.createElement(Host)));
  t.after(()=>React.act(async()=>root.unmount()));await render();
  return{context,calls,comments,render,tree:()=>tree,select:label=>nodes(tree).find(n=>n.type==='TouchableOpacity'&&text(n)===label),
    runEngagementEffect:()=>React.act(async()=>root.render(React.createElement(function EffectHost(){context.useEffect=React.useEffect;vm.runInContext(engagementCode,context);return null;}))),
    item:async value=>{item={...item,...value};await render();},current:value=>{current=value;},saveError:value=>{saveError=value;}};
}
test('mounted Circle and followed posts expose full interactions with actor identity, not owner delete',async t=>{
  const m=await mount(t);assert.match(text(m.tree()),/Friend/);assert.ok(m.select('Like'));assert.ok(m.select('Comment'));assert.ok(m.select('Share'));assert.ok(m.select('Report'));assert.equal(m.select('Delete'),undefined);
  await m.select('Like').props.onPress();await new Promise(resolve=>setImmediate(resolve));await m.render();assert.equal(m.calls[0][0],'like');assert.ok(m.select('Liked · 1 like'));
  await m.select('Share').props.onPress();await new Promise(resolve=>setImmediate(resolve));assert.match(m.calls.find(c=>c[0]==='share')[1].message,/profile\/friend\?postId=post-1/);
  m.select('Report').props.onPress();assert.equal(m.calls.find(c=>c[0]==='report')[1].id,'post-1');
  await m.item({type:'followed_user_post'});assert.ok(m.select('Share'));assert.ok(m.select('Report'));
});
test('mounted comments use cursor load more and retain visible data on retry failures without false empty copy',async t=>{
  const m=await mount(t);m.comments.push({items:[{id:'c1',userId:'friend',body:'first',attachments:[]}],nextCursor:'next',hasMore:true});
  m.select('Comment').props.onPress();await new Promise(resolve=>setImmediate(resolve));await m.render();assert.match(text(m.tree()),/first/);
  m.comments.push(new Error('offline'));m.select('Load more comments').props.onPress();await new Promise(resolve=>setImmediate(resolve));await m.render();
  assert.match(text(m.tree()),/first/);assert.match(text(m.tree()),/Unable to load comments/);assert.doesNotMatch(text(m.tree()),/No comments yet/);
  m.comments.push({items:[{id:'c1',userId:'friend',body:'first',attachments:[]},{id:'c2',userId:'friend',body:'second',attachments:[]}],nextCursor:null,hasMore:false});
  m.select('Retry comments').props.onPress();await new Promise(resolve=>setImmediate(resolve));await m.render();
  assert.equal(m.context.profilePostUiById['post-1'].comments.length,2);assert.equal(m.calls.filter(c=>c[0]==='comments')[2][2].cursor,'next');
});
test('About only publishes after acknowledged remote save, keeps failed edit retryable and suppresses stale completion',async t=>{
  const m=await mount(t);m.saveError(new Error('offline'));await m.context.exports.onSaveAbout();
  assert.equal(m.calls.some(c=>c[0]==='profileSaved'),false);assert.match(m.calls.at(-1)[1],/Unable/);
  m.saveError(null);await m.context.exports.onSaveAbout();assert.equal(m.calls.find(c=>c[0]==='save')[2],'viewer');assert.ok(m.calls.some(c=>c[0]==='profileSaved'));
  const count=m.calls.filter(c=>c[0]==='profileSaved').length;m.current(false);await m.context.exports.onSaveAbout();assert.equal(m.calls.filter(c=>c[0]==='profileSaved').length,count);
});

test('same-turn like taps are single flight and a stale completion cannot publish engagement',async t=>{
  const m=await mount(t);let resolve,calls=0;
  m.context.setProfilePostLike=()=>{calls++;return new Promise(yes=>{resolve=yes;});};
  const first=m.context.exports.onToggleProfilePostLike(post);const second=m.context.exports.onToggleProfilePostLike(post);
  assert.equal(calls,1);m.current(false);resolve({likedByViewer:true,likeCount:99});await Promise.all([first,second]);
  assert.equal(m.context.profilePostUiById['post-1'].engagement.likedByViewer,false);
});
test('About same-turn duplicates save once and account change during acknowledged save suppresses success',async t=>{
  const m=await mount(t);let resolve,calls=0;
  m.context.saveUserProfileAbout=()=>{calls++;return new Promise(yes=>{resolve=yes;});};
  const first=m.context.exports.onSaveAbout();const second=m.context.exports.onSaveAbout();assert.equal(calls,1);
  m.current(false);resolve({tagline:'old account'});await Promise.all([first,second]);
  assert.equal(m.calls.some(c=>c[0]==='profileSaved'),false);assert.equal(m.calls.some(c=>c[0]==='notice'&&c[1]==='About updated.'),false);
});
test('failed engagement cannot optimistically toggle an unknown prior like',async t=>{
  const m=await mount(t);m.context.profilePostUiById['post-1']={engagementReady:false};await m.render();
  assert.equal(m.select('Like').props.disabled,true);await m.context.exports.onToggleProfilePostLike(post);
  assert.equal(m.calls.some(c=>c[0]==='like'),false);assert.match(m.context.profilePostUiById['post-1'].commentNotice,/unavailable/);
});
test('successful comment with failed count refresh stays posted, clears composer and does not invite duplicate resubmission',async t=>{
  const m=await mount(t);m.context.profilePostUiById['post-1'].commentDraft='My comment';
  const first=m.context.exports.onSubmitProfilePostComment(post);const second=m.context.exports.onSubmitProfilePostComment(post);await Promise.all([first,second]);
  assert.equal(m.calls.filter(c=>c[0]==='createComment').length,1);
  const state=m.context.profilePostUiById['post-1'];assert.equal(state.comments[0].body,'My comment');assert.equal(state.commentDraft,'');
  assert.match(state.commentNotice,/Comment posted/);assert.doesNotMatch(state.commentNotice,/Unable to post/);assert.equal(state.commentBusy,false);
});
test('same-turn personal post submits create one row and a stale account cannot publish the returned post',async t=>{
  const m=await mount(t);let resolve,calls=0;
  m.context.createProfilePost=()=>{calls++;return new Promise(yes=>{resolve=yes;});};
  const first=m.context.exports.onSubmitProfilePost();const second=m.context.exports.onSubmitProfilePost();assert.equal(calls,1);
  m.current(false);resolve({...post,userId:'viewer'});await Promise.all([first,second]);assert.equal(m.calls.some(c=>c[0]==='posts'),false);
});
test('held delete confirmations cannot execute for a replacement account',async t=>{
  const m=await mount(t);m.context.exports.onDeleteProfilePost({...post,userId:'viewer'});
  m.context.exports.onDeleteProfilePostCommentPress(post,{id:'comment',userId:'viewer'});
  const alerts=m.calls.filter(c=>c[0]==='alert');assert.equal(alerts.length,2);m.current(false);
  for(const alert of alerts)alert[3].find(button=>button.style==='destructive').onPress();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(m.calls.some(c=>c[0]==='deletePost'||c[0]==='deleteComment'),false);
});
test('held attachment sheet action and pending gallery result cannot attach into a replacement account',async t=>{
  const m=await mount(t);let resolve,picks=0,attachments=0;
  m.context.pickSocialAttachmentFile=()=>{picks++;return new Promise(yes=>{resolve=yes;});};m.context.setProfilePostAttachmentFile=()=>{attachments++;};
  m.context.exports.onSelectProfileAttachment('photos');assert.equal(picks,1);m.current(false);
  resolve({uri:'file:old-account'});await new Promise(done=>setImmediate(done));assert.equal(attachments,0);
  m.context.exports.onSelectProfileAttachment('photos');assert.equal(picks,1);
  m.current(true);m.context.socialIdentity='viewer:two';m.context.exports.onSelectProfileAttachment('photos');assert.equal(picks,1,'new handler also rejects a retained old target');
});
test('an older comment read cannot erase an acknowledged new comment',async t=>{
  const m=await mount(t);let resolve;m.context.readProfilePostCommentsPage=()=>new Promise(yes=>{resolve=yes;});
  const read=m.context.exports.loadProfilePostComments(post.id);m.context.profilePostUiById[post.id].commentDraft='new while loading';
  await m.context.exports.onSubmitProfilePostComment(post);resolve({items:[],nextCursor:null,hasMore:false});await read;
  const state=m.context.profilePostUiById[post.id];assert.equal(state.comments[0].body,'new while loading');assert.equal(state.commentsReady,true);assert.equal(state.commentsLoading,false);assert.equal(state.commentsHasMore,true);
});
test('an older comment read cannot resurrect an acknowledged deletion',async t=>{
  const m=await mount(t);const comment={id:'deleted',userId:'viewer',body:'old',attachments:[]};m.context.profilePostUiById[post.id].comments=[comment];
  let resolve;m.context.readProfilePostCommentsPage=()=>new Promise(yes=>{resolve=yes;});const read=m.context.exports.loadProfilePostComments(post.id);
  m.context.exports.onDeleteProfilePostCommentPress(post,comment);m.calls.find(c=>c[0]==='alert')[3].find(button=>button.style==='destructive').onPress();
  await new Promise(done=>setImmediate(done));resolve({items:[comment],nextCursor:null,hasMore:false});await read;assert.equal(m.context.profilePostUiById[post.id].comments.length,0);assert.match(m.context.profilePostUiById[post.id].commentNotice,/Comment deleted/);
});
test('mounted production engagement effect cannot overwrite an acknowledged like with an older batch',async t=>{
  const m=await mount(t);let resolve;
  Object.assign(m.context,{feedPages:{refreshRevision:1},engagementReads:{current:{scope:'',ids:new Set()}},profilePosts:[post],profilePostIdsKey:post.id,
    readProfilePostEngagementStates:()=>new Promise(yes=>{resolve=yes;}),setProfilePostUiById:updater=>{m.context.profilePostUiById=updater(m.context.profilePostUiById);}});
  await m.runEngagementEffect();await m.context.exports.onToggleProfilePostLike(post);
  assert.equal(m.context.profilePostUiById[post.id].engagement.likedByViewer,true);
  await React.act(async()=>{resolve({[post.id]:{likedByViewer:false,likeCount:0,commentCount:0}});});
  assert.equal(m.context.profilePostUiById[post.id].engagement.likedByViewer,true);assert.equal(m.context.profilePostUiById[post.id].engagement.likeCount,1);
});
test('stale rejected comment read after deletion releases loading and exposes a restartable cursor',async t=>{
  const m=await mount(t);const comment={id:'deleted',userId:'viewer',body:'old',attachments:[]};m.context.profilePostUiById[post.id].comments=[comment];
  let reject;m.context.readProfilePostCommentsPage=()=>new Promise((_yes,no)=>{reject=no;});const read=m.context.exports.loadProfilePostComments(post.id);
  m.context.exports.onDeleteProfilePostCommentPress(post,comment);m.calls.find(c=>c[0]==='alert')[3].find(button=>button.style==='destructive').onPress();await new Promise(done=>setImmediate(done));
  reject(new Error('offline'));await read;const state=m.context.profilePostUiById[post.id];assert.equal(state.commentsReady,true);assert.equal(state.commentsLoading,false);assert.equal(state.commentsHasMore,true);assert.equal(state.commentsCursor,null);
});
