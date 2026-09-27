import assert from "node:assert/strict";
import test from "node:test";
import { loadStubbed } from "./customer-experience-adversarial-helpers.mjs";

const valid = {
  id: "invite", thread_id: "thread", caller_user_id: "caller", callee_user_id: "callee",
  call_type: "voice", chat_call_media_provider: "legacy_webrtc", status: "ringing",
  created_at: "2026-09-27T17:00:00.000Z", expires_at: "2026-09-27T17:01:30.000Z",
};

function apiFor(row) {
  const query = {
    select() { return this; }, eq() { return this; }, returns() { return this; },
    async maybeSingle() { return { data: row, error: null }; },
  };
  return loadStubbed("_lib/chillyChatCalls.ts", {
    "./supabase": { supabase: { from: () => query } },
    "./accountSessionAuthority": {},
    "./accountBoundSupabaseMutation": {},
    "./chillyChatCallDispatchSchema": {},
  });
}

for (const field of ["expires_at", "created_at"]) {
  for (const [name, value] of [["missing", undefined], ["empty", ""], ["invalid", "not-a-date"]]) {
    test(`invite read rejects ${name} ${field} without inventing a new ringing lifetime`, async () => {
      const api = apiFor({ ...valid, [field]: value });
      assert.equal(await api.readChillyChatCallInvite(valid.id), null);
    });
  }
}

test("invite reads preserve the exact server deadline, including an expired ringing invite", async () => {
  const result = await apiFor(valid).readChillyChatCallInvite(valid.id);
  assert.equal(result.expiresAt, valid.expires_at);
  assert.equal(result.createdAt, valid.created_at);
  assert.equal(result.mediaProvider, "legacy_webrtc");
});

test("accepted calls retain their original ringing deadline without becoming unparseable", async () => {
  const result = await apiFor({ ...valid, status: "accepted" }).readChillyChatCallInvite(valid.id);
  assert.equal(result.status, "accepted");
  assert.equal(result.expiresAt, valid.expires_at);
});
