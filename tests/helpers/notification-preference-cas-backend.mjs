import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const copy = value => JSON.parse(JSON.stringify(value));
const patchIdentity = patch => JSON.stringify(Object.fromEntries(Object.entries(patch).sort(([left], [right]) => left.localeCompare(right))));

// Database defaults, not a fallback for malformed/missing server responses.
// Transport fault fixtures must explicitly return the envelope they intend.
export const preferenceRow = (patch = {}, userId = 'owned-user', revision = '0') => ({
  user_id: userId, revision, incarnation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', social_activity_enabled: true, circle_activity_enabled: true,
  messages_enabled: true, view_summary_enabled: true, view_summary_push_enabled: false,
  event_updates_enabled: true, seat_activity_enabled: true, account_activity_enabled: true,
  followed_creator_live_enabled: true, circle_friend_live_enabled: true, event_starts_soon_enabled: true,
  public_upload_enabled: true, replay_later_enabled: true, creator_money_purchases_enabled: true,
  creator_money_sales_enabled: true, chilly_chat_calls_enabled: true, chilly_chat_call_sound_key: 'chilly_ring',
  chilly_chat_call_vibrate_enabled: true, chilly_chat_call_custom_in_app_sound_uri: null,
  push_enabled: true, in_app_enabled: true, created_at: '2026-10-21T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z', ...patch,
});
export const preferenceRead = (patch = {}, userId = 'owned-user', revision = '0') => {
  const preferences = preferenceRow(patch, userId, revision);
  return { data: { revision: preferences.revision, incarnation: preferences.incarnation, preferences }, error: null };
};
export const holdPreferenceWrite = gate => async (_request, _row, commit) => {
  const result = await gate.promise;
  return result === undefined ? commit() : result;
};

// The CAS decision occurs only inside commit(), after any transport barrier.
// Sharing this backend across mounted harnesses shares no React/module state.
export function createPreferenceBackend() {
  const rows = new Map(), receipts = new Map(), commits = [];
  const ensure = userId => {
    assert.ok(userId, 'authenticated preference subject required');
    if (!rows.has(userId)) rows.set(userId, preferenceRow({ incarnation: randomUUID() }, userId));
    const row = rows.get(userId);
    assert.equal(row.user_id, userId, 'fixture rows must contain the exact owner');
    assert.match(row.revision, /^(0|[1-9]\d*)$/, 'fixture revision must be decimal text');
    return row;
  };
  const read = userId => {
    const row = ensure(userId);
    return { data: copy({ revision: row.revision, incarnation: row.incarnation, preferences: row }), error: null };
  };
  const mutate = (userId, args) => {
    assert.deepEqual(Object.keys(args).sort(), ['p_expected_incarnation', 'p_expected_revision', 'p_operation_id', 'p_patch']);
    assert.match(args.p_operation_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.match(args.p_expected_revision, /^(0|[1-9]\d*)$/);
    const patch = args.p_patch;
    assert.ok(patch && typeof patch === 'object' && !Array.isArray(patch));
    const allowed = new Set(Object.keys(preferenceRow()).filter(key => !['user_id', 'revision', 'incarnation', 'created_at', 'updated_at'].includes(key)));
    assert.ok(Object.keys(patch).every(key => allowed.has(key)), 'only preference fields may be patched');
    const key = `${userId}:${args.p_operation_id}`, previous = receipts.get(key);
    const row = ensure(userId);
    if (previous) {
      if (previous.expectedRevision !== args.p_expected_revision || previous.expectedIncarnation !== args.p_expected_incarnation || patchIdentity(previous.patch) !== patchIdentity(patch)) {
        return { data: null, error: { code: '22023', message: 'operation id was already used with different input' } };
      }
      if (row.incarnation === previous.receipt.incarnation && row.revision === previous.receipt.revision) {
        return { data: copy(previous.receipt), error: null };
      }
      return { data: { status: 'conflict', operationId: args.p_operation_id,
        expectedRevision: args.p_expected_revision, expectedIncarnation: args.p_expected_incarnation,
        incarnation: row.incarnation, revision: row.revision, preferences: copy(row) }, error: null };
    }
    const matches = row.revision === args.p_expected_revision && row.incarnation === args.p_expected_incarnation;
    const saved = matches ? { ...row, ...copy(patch), revision: String(BigInt(row.revision) + 1n) } : row;
    if (matches) rows.set(userId, saved);
    const receipt = { status: matches ? 'applied' : 'conflict', operationId: args.p_operation_id,
      expectedRevision: args.p_expected_revision, expectedIncarnation: args.p_expected_incarnation,
      revision: saved.revision, incarnation: saved.incarnation, preferences: copy(saved) };
    // The production RPC persists both accepted and conflict receipts.
    receipts.set(key, { expectedRevision: args.p_expected_revision, expectedIncarnation: args.p_expected_incarnation, patch: copy(patch), receipt: copy(receipt) });
    commits.push({ userId, args: copy(args), receipt: copy(receipt) });
    return { data: receipt, error: null };
  };
  return { rows, receipts, commits, ensure, read, mutate };
}
