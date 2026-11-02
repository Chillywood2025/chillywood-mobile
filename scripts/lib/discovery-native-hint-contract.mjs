import assert from 'node:assert/strict';

const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function assertDiscoveryHintPayload(payload,rawIds=[]) {
  assert.ok(payload&&typeof payload==='object'&&!Array.isArray(payload),'hint payload is an object');
  assert.deepEqual(Object.keys(payload).sort(),['id','keys'],'only delivery nonce and opaque projection keys may cross the channel');
  assert.match(payload.id,UUID_V4,'independent random delivery nonce');
  assert.ok(Array.isArray(payload.keys)&&payload.keys.length>=1&&payload.keys.length<=256,'nonempty bounded affected-key footprint');
  assert.equal(new Set(payload.keys).size,payload.keys.length,'affected keys are unique');
  for(const key of payload.keys) {
    assert.match(key,UUID_V4,'affected key is an independent random UUID');
    assert.ok(!rawIds.includes(key),'hint key is not a raw room, source, title, user or session identity');
    assert.notEqual(key,payload.id,'stable projection key is not the transient delivery nonce');
  }
}
