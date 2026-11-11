import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const module={exports:{}};
new Function('exports','module',ts.transpileModule(readFileSync('supabase/functions/_shared/media-download-authority.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(module.exports,module);
test('native production grants cannot escape immutable range delivery; unrelated access is unchanged',()=>{
 const allowed=module.exports.creatorContentResolutionAllowed;
 assert.equal(allowed({allowed:true,requiresPurchase:false,reason:'active_grant',nativeProductionDeliveryOnly:true}),false);
 for(const reason of ['owner','free_content','purchase_grant','active_grant','sandbox_grant','vip_active','active_creator_subscription'])
  assert.equal(allowed({allowed:true,requiresPurchase:false,reason}),true,reason);
 assert.equal(allowed({allowed:false,requiresPurchase:false,reason:'active_grant'}),false);
});
