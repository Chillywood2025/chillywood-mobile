import assert from 'node:assert/strict';
import test from 'node:test';
import {mount, video} from './platform-public-mounted-harness.mjs';

const emptyCopy = 'No public videos are available yet.';
const oldCopy = 'This Platform has not published videos yet.';
const modes = [
  ['public preview', {userId: 'owner', preview: 'public'}],
  ['Brand draft preview', {userId: 'owner', preview: 'brand-draft'}],
  ['viewer', {userId: 'creator'}],
];

for (const [mode, route] of modes) {
  test(`${mode}: successful empty public read describes availability, not publication history`, async t => {
    const h = await mount(t, {route, videos: []});
    assert.ok(h.text().includes(emptyCopy));
    assert.equal(h.text().includes(oldCopy), false);
    const reads = h.calls.filter(([name]) => name === 'readCreatorVideos');
    assert.equal(reads.length, 1);
    assert.equal(reads[0][1], route.userId);
    assert.equal(reads[0][2].includeDrafts, false);
    assert.equal(reads[0][2].throwOnUnavailable, true);
  });

  test(`${mode}: failed public read stays an error until Retry confirms an empty response`, async t => {
    const h = await mount(t, {route, overrides: {
      readCreatorVideos: async () => { throw new Error('modeled public read unavailable'); },
    }});
    assert.match(h.text(), /Platform could not load/);
    assert.equal(h.text().includes(emptyCopy), false);
    assert.equal(h.text().includes(oldCopy), false);
    h.mocks.readCreatorVideos = async () => [];
    await h.press(h.button('Retry'));
    assert.doesNotMatch(h.text(), /Platform could not load/);
    assert.ok(h.text().includes(emptyCopy));
    assert.equal(h.text().includes(oldCopy), false);
  });

  test(`${mode}: available public content renders without the empty-state claim`, async t => {
    const available = {...video('available'), ownerId: route.userId};
    const h = await mount(t, {route, videos: [available]});
    assert.match(h.text(), /Title available/);
    assert.equal(h.text().includes(emptyCopy), false);
    assert.equal(h.text().includes(oldCopy), false);
    assert.ok(h.find(node => node.props.testID === 'platform-content-open-button'));
  });
}
