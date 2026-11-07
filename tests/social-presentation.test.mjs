import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText,
    { exports, require: name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; } });
  return exports;
}
const counts = load('_lib/socialCountPresentation.ts');
const native = { StyleSheet: { create: x => x }, ...Object.fromEntries(['ActivityIndicator','Text','TouchableOpacity','View'].map(x => [x,x])) };
const visual = { CHILLYWOOD_VISUAL: { accentCrimson: '#F34B74', textPrimary: '#FFFFFF' }, ChillywoodPrimaryActionFill: 'Gradient' };
const walk = (tree, predicate) => Array.isArray(tree) ? tree.flatMap(x => walk(x,predicate)) : tree && typeof tree === 'object' ? [...(predicate(tree)?[tree]:[]),...walk(tree.props?.children,predicate)] : [];
const bar = load('components/social/engagement-bar.tsx', { react: React, 'react-native': native, '@expo/vector-icons/MaterialIcons': 'Icon', '../../_lib/socialCountPresentation': counts, '../ui/chillywood-visual-system': visual });

test('honest compact counts preserve zero and never round up a milestone', () => {
  assert.equal(counts.formatSocialCount(0),'0');
  assert.equal(counts.formatSocialCount(999),'999');
  assert.equal(counts.formatSocialCount(1999),'1.9K');
  assert.equal(counts.formatSocialCount(999999),'999.9K');
  assert.equal(counts.formatSocialCount(1000000),'1M');
  for(const unknown of [null,undefined,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]) assert.equal(counts.formatSocialCount(unknown),'—');
  assert.match(counts.socialCountAccessibilityLabel('Likes',null),/unavailable/);
  assert.equal(counts.socialCountAccessibilityLabel('Likes',1280),'1,280 Likes');
});
test('real engagement dock binds actions, selected/busy states and unknown counts', () => {
  let liked=0,commented=0,shared=0,reposted=0;
  const tree=bar.EngagementBar({likes:15,comments:0,shares:null,liked:true,onLike:()=>liked++,onComments:()=>commented++,onRepost:()=>reposted++,onShare:()=>shared++});
  const buttons=walk(tree,n=>n.type==='TouchableOpacity');
  assert.equal(buttons.length,4);
  buttons.forEach(x=>x.props.onPress());
  assert.deepEqual([liked,commented,reposted,shared],[1,1,1,1]);
  assert.equal(buttons[0].props.accessibilityState.selected,true);
  assert.match(buttons[2].props.accessibilityLabel,/count unavailable/);
  assert.equal(buttons[3].props.accessibilityLabel,'Send content using the share sheet');
  const busy=walk(bar.EngagementBar({busy:true,onLike:()=>{}}),n=>n.props?.testID==='social-like')[0];
  assert.equal(busy.props.disabled,true);
  const error=bar.EngagementBar({error:'network',onRetry:()=>shared++});
  assert.equal(walk(error,n=>n.props?.accessibilityLabel==='Retry engagement counts').length,1);
});
test('live card is metadata-only, uses original shared visual components and routes only on explicit tap', () => {
  const feed = load('_lib/discoveryFeed.ts', {'./supabase':{supabase:{}},'./discoveryRankingSignals':{}});
  const {LiveDiscoveryCard}=load('components/live/live-discovery-card.tsx', {react:React,'react-native':native,'@expo/vector-icons/MaterialIcons':'Icon','../../_lib/discoveryFeed':feed,'../ui/StableImage':{StableImage:'StableImage'},'../ui/chillywood-visual-system':visual});
  let opens=0;
  const tree=LiveDiscoveryCard({item:{id:'live-1',title:'Chicago live',item_type:'live_room',live_state:'live',access_type:'public_free',visibility:'public'},onOpen:()=>opens++});
  assert.equal(opens,0);
  assert.equal(walk(tree,n=>n.type==='Gradient').length,1);
  assert.match(tree.props.accessibilityLabel,/Chicago live/);
  assert.equal(walk(tree,n=>n.type==='Video').length,0);
  tree.props.onPress();assert.equal(opens,1);
});

test('room social labels distinguish recent discussion and actual member roster from invented audience totals', () => {
  const source=fs.readFileSync('app/watch-party/live-stage/[partyId].tsx','utf8');
  assert.match(source,/const viewerCount = displayParticipants.length;/);
  assert.match(source,/recent comments/);
  assert.match(source,/people in room/);
  assert.doesNotMatch(source,/const viewerCount = Math.max\(1,/);
});

test('comment likes expose real state, retry and no private room-message metric', () => {
  let toggles=0,retries=0;
  const state={likeCount:null,liked:false,canLike:false,busy:false,error:'offline',toggleLike:()=>toggles++,refresh:()=>retries++};
  const {CommentLikeButton}=load('components/social/comment-like-button.tsx', {
    react:React,'react-native':native,'@expo/vector-icons/MaterialIcons':'Icon',
    '@react-navigation/native':{useIsFocused:()=>true},
    '../../hooks/use-comment-like':{useCommentLike:()=>state},
    '../../_lib/socialCountPresentation':counts,'../ui/chillywood-visual-system':visual,
  });
  const tree=CommentLikeButton({kind:'creator_video_comment',id:'comment-1'});
  const like=walk(tree,n=>n.props?.testID==='comment-like')[0];
  assert.equal(like.props.disabled,true);
  assert.match(like.props.accessibilityLabel,/unavailable/);
  walk(tree,n=>n.props?.accessibilityLabel==='Retry comment likes')[0].props.onPress();
  assert.equal(retries,1);
  Object.assign(state,{likeCount:3,liked:true,canLike:true,error:null});
  const ready=walk(CommentLikeButton({kind:'profile_post_comment',id:'reply-1'}),n=>n.props?.testID==='comment-like')[0];
  assert.equal(ready.props.accessibilityState.selected,true);
  ready.props.onPress();assert.equal(toggles,1);
});
