import { assertEquals } from "jsr:@std/assert@1";
import {
  readLiveKitParticipantSessionGeneration,
  readVerifiedSupabaseSessionGeneration,
} from "./livekit-session-generation.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_GENERATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const encodeBase64Url = (value: string) =>
  btoa(value).replace(/=/gu, "").replace(/\+/gu, "-").replace(/\//gu, "_");

const bearer = (payload: Record<string, unknown>) =>
  `Bearer ${encodeBase64Url(JSON.stringify({ alg: "none" }))}.${encodeBase64Url(JSON.stringify(payload))}.signature`;

Deno.test("verified Supabase bearer claims expose only an exact UUID session generation", () => {
  assertEquals(
    readVerifiedSupabaseSessionGeneration(bearer({ session_id: SESSION_GENERATION })),
    SESSION_GENERATION,
  );
  assertEquals(readVerifiedSupabaseSessionGeneration(bearer({ session_id: "caller-value" })), null);
  assertEquals(readVerifiedSupabaseSessionGeneration("Bearer malformed"), null);
  assertEquals(readVerifiedSupabaseSessionGeneration(null), null);
});

Deno.test("signed participant metadata is bound to the exact room and participant", () => {
  const metadata = JSON.stringify({
    app: "chillywood-mobile",
    roomName: "PARTY-ONE",
    sessionGeneration: SESSION_GENERATION,
    userId: USER_ID,
  });
  assertEquals(readLiveKitParticipantSessionGeneration(metadata, {
    participantIdentity: USER_ID,
    roomName: "PARTY-ONE",
  }), SESSION_GENERATION);
  assertEquals(readLiveKitParticipantSessionGeneration(metadata, {
    participantIdentity: USER_ID,
    roomName: "PARTY-TWO",
  }), null);
  assertEquals(readLiveKitParticipantSessionGeneration(JSON.stringify({
    ...JSON.parse(metadata),
    userId: "22222222-2222-4222-8222-222222222222",
  }), {
    participantIdentity: USER_ID,
    roomName: "PARTY-ONE",
  }), null);
  assertEquals(readLiveKitParticipantSessionGeneration("caller metadata", {
    participantIdentity: USER_ID,
    roomName: "PARTY-ONE",
  }), null);
});
