import assert from "node:assert/strict";
import test from "node:test";
import { loadStubbed } from "./customer-experience-adversarial-helpers.mjs";

const errors = loadStubbed("_lib/userFacingErrors.ts");
const expectedMessage = "Too many attempts. Wait a few minutes, then try again.";
const userId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const binding = { state: "ACTIVE", userId, accountId: userId, restoreOnly: false };

function fixture({ stage = "invite", message = "rate_limited" } = {}) {
  const calls = { begin: 0, dispatch: 0, cleanup: 0, create: 0 };
  const thread = { id: "thread", participant_pair_key: `${userId}::${otherId}`, created_by: userId,
    members: [userId, otherId].map(user_id => ({ thread_id: "thread", user_id, display_name: "Test" })) };
  const api = loadStubbed("_lib/chat.ts", {
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => binding,
      sameAccountSessionAuthority: (a, b) => a === b },
    "./supabase": { supabase: { from: table => {
      const query = { select: () => query, eq: () => query, in: () => query,
        returns: () => query, maybeSingle: async () => ({ data: thread, error: null }),
        then: resolve => Promise.resolve({ data: table === "user_profiles" ? [] : thread, error: null }).then(resolve) };
      return query;
    } } },
    "./communication": {
      createCommunicationRoom: async () => { calls.create++; return stage === "room" ? { error: { message } } : { roomId: "ROOM" }; },
      endCommunicationRoom: async () => { calls.cleanup++; },
    },
    "./chillyChatCalls": {
      beginChillyChatCall: async () => { calls.begin++; throw { code: "P0001", message }; },
      dispatchChillyChatCallPush: async () => { calls.dispatch++; },
    },
    "./userFacingErrors": errors,
  });
  return { api, calls };
}

for (const stage of ["room", "invite"]) {
  test(`call ${stage} rate limit preserves useful copy without retrying or dispatching`, async () => {
    const { api, calls } = fixture({ stage });
    await assert.rejects(api.startChatThreadCall("thread", "voice"), error => {
      assert.equal(errors.getUserFacingErrorMessage(error, "generic failure"), expectedMessage);
      return true;
    });
    assert.equal(calls.create, 1);
    assert.equal(calls.begin, stage === "room" ? 0 : 1);
    assert.equal(calls.cleanup, stage === "room" ? 0 : 1, "unused room cleanup is retained");
    assert.equal(calls.dispatch, 0);
  });
}
test("unknown invite backend text remains private and cannot become rate-limit success", async () => {
  const { api, calls } = fixture({ message: "private_internal_failure" });
  await assert.rejects(api.startChatThreadCall("thread", "video"), error => {
    assert.equal(error.message, "Unable to start Chi'lly Chat call. The receiver invite could not be saved.");
    return true;
  });
  assert.equal(calls.cleanup, 1);
  assert.equal(calls.dispatch, 0);
});
