#!/usr/bin/env python3
from pathlib import Path
p = Path('tests/wave1/paid-watch-party-ticket-admission.test.mjs')
s = p.read_text()
anchor = '''  const from = (table) => {
'''
rpc_block = '''  const rpc = async (fn, args = {}) => {
    if (fn !== "join_watch_party_room_session" && fn !== "heartbeat_watch_party_room_session") {
      return { data: null, error: new Error("unexpected_rpc") };
    }
    const partyId = String(args.p_party_id ?? "").trim().toUpperCase();
    if (partyId !== PARTY_ID) return { data: null, error: new Error("wrong_party") };

    const isHost = currentUserId === HOST_ID;
    const existingRemoved = storedMembership?.membership_state === "removed";
    const isLeaving = fn === "heartbeat_watch_party_room_session" && args.p_membership_state === "left";
    const state = existingRemoved ? "removed" : isLeaving ? "left" : "active";
    const hostRole = isHost && !existingRemoved;
    const next = membershipRow({
      user_id: currentUserId,
      role: hostRole ? "host" : "viewer",
      stage_role: hostRole ? "host" : "listener",
      can_speak: hostRole,
      membership_state: state,
      camera_enabled: hostRole ? args.p_camera_enabled === true : false,
      mic_enabled: hostRole ? args.p_mic_enabled === true : false,
      is_muted: hostRole ? args.p_self_muted === true : false,
      display_name: args.p_display_name ?? null,
      avatar_url: args.p_avatar_url ?? null,
      camera_preview_url: args.p_camera_preview_url ?? null,
      left_at: state === "active" ? null : storedMembership?.left_at ?? new Date().toISOString(),
    });
    storedMembership = next;
    membershipWrites.push(next);
    return { data: [next], error: null };
  };

'''
if 'const rpc = async (fn, args = {}) =>' not in s:
    if anchor not in s: raise RuntimeError('from anchor missing')
    s = s.replace(anchor, rpc_block + anchor, 1)
s = s.replace('"./supabase": { supabase: { auth, from } },', '"./supabase": { supabase: { auth, from, rpc } },')
# Current server-authoritative join no longer lets a newly admitted ordinary viewer
# self-select speaker/camera/mic merely because Premium admission succeeded.
old = '''  assert.equal(joined?.role, "viewer");
  assert.equal(joined?.stageRole, "speaker");
  assert.equal(joined?.canSpeak, true);
  assert.equal(joined?.cameraEnabled, true);
  assert.equal(joined?.micEnabled, true);
  assert.deepEqual(runtime.ticketPartyIds, [PARTY_ID]);
  assert.equal(runtime.getPremiumReads(), 1);
'''
new = '''  assert.equal(joined?.role, "viewer");
  assert.equal(joined?.stageRole, "listener");
  assert.equal(joined?.canSpeak, false);
  assert.equal(joined?.cameraEnabled, false);
  assert.equal(joined?.micEnabled, false);
  assert.deepEqual(runtime.ticketPartyIds, [PARTY_ID]);
  assert.equal(runtime.getPremiumReads(), 1);
'''
if old in s:
    s = s.replace(old, new, 1)
p.write_text(s)
print('Adapted Seat Pass admission harness to current server membership RPC.')
