import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStudioFunctions } from './helpers/studio-source-harness.mjs';

// Execute the production client function; auth and transport are synthetic.
// This proves fallback classification, not deployed-client/provider behavior.
function fixture(response) {
  const { callMediaStorageFunction } = loadStudioFunctions('_lib/mediaStorage.ts', ['callMediaStorageFunction'], {
    getSignedInAccessToken: async () => 'synthetic',
    MEDIA_STORAGE_FUNCTION_URL: 'https://fixture.invalid',
    MEDIA_STORAGE_REQUEST_TIMEOUT_MS: 1,
    fetchWithTimeout: async () => {
      if (response instanceof Error) throw response;
      return response;
    },
  });
  return (action = 'delete_content') => callMediaStorageFunction({ action });
}
const reply = (status, error) => new Response(JSON.stringify({ error }), { status });

test('only explicit 400 invalid_action permits legacy content-delete fallback', async () => {
  assert.equal((await fixture(reply(400, 'invalid_action'))()).retentionHandled, false);
});

for (const status of [400, 401, 403, 409, 500]) {
  for (const error of ['not_allowed', 'invalid_action']) {
    if (status === 400 && error === 'invalid_action') continue;
    test(`${status} ${error} does not permit compatibility fallback`, async () => {
      await assert.rejects(fixture(reply(status, error)));
    });
  }
}

for (const failure of ['network', 'timeout', 'invalid_json', 'null_payload']) {
  test(`${failure} cannot be interpreted as an older gateway`, async () => {
    const response = failure === 'network' || failure === 'timeout'
      ? new Error(`synthetic_${failure}`)
      : new Response(failure === 'invalid_json' ? 'invalid-json' : 'null', { status: 400 });
    await assert.rejects(fixture(response));
  });
}

test('invalid_action does not make object deletion appear successful', async () => {
  await assert.rejects(() => fixture(reply(400, 'invalid_action'))('delete_object'));
});
