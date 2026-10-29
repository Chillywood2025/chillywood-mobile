import assert from 'node:assert/strict';
import test from 'node:test';
import {mount} from './platform-studio-mounted-harness.mjs';

test('real Studio Ways to Earn exposes one merch management destination',async t=>{
  const h=await mount(t,{route:{tab:'monetization',focus:'ways_to_earn'}});
  assert.match(h.text(),/Merch Shop/);
  const button=h.all().find(n=>n.type==='TouchableOpacity' && n.props.testID==='studio-merch-shop-button');
  assert.ok(button,'Merch Shop has a visible labeled action');
  await h.press(button);
  assert.equal(h.routes.at(-1),'/merch/studio');
});
