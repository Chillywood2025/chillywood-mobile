import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, deferred, preferenceRead } from './helpers/notification-settings-mounted-harness.mjs';
const walk = (tree, predicate) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(node => walk(node, predicate))
  : [...(predicate(tree) ? [tree] : []), ...walk(tree.props?.children, predicate)];

test('guarded manual Refresh really owns mounted busy controls through transport settlement', async t => {
  const held = deferred(), m = await mount(t);
  m.state.read = () => held.promise;
  const button = m.button('Refresh'), reads = m.state.reads.length;
  await m.act(() => { button.onPress(); button.onPress(); });
  assert.equal(m.state.reads.length, reads + 1, 'synchronous operation latch rejects same-turn duplicate taps');
  const busy = walk(m.section(), node => node.type === 'TouchableOpacity'
    && walk(node, child => child.type === 'ActivityIndicator').length === 1);
  assert.equal(busy.length, 1, 'Refresh label is replaced by its actual busy spinner');
  assert.equal(busy[0].props.disabled, true, 'the real Refresh control consumes the busy state');
  assert.equal(m.toggle('Messages').disabled, true, 'shared preference actions cannot overlap manual readback');
  await m.act(() => held.resolve(preferenceRead()));
  assert.equal(m.button('Refresh').disabled, false, 'settlement releases actual controls');
  assert.equal(m.toggle('Messages').disabled, false);
});
