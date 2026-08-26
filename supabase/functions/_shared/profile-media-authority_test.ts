import {
  canonicalProfileMediaUrl,
  isSafeProfileMediaObjectKey,
  profileMediaDeliveryResolutionAllows,
  profileRowAuthorizesExactObject,
} from "./profile-media-authority.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const origin = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const owner = "11111111-1111-4111-8111-111111111111";
const key = `${owner}/avatar/fresh.jpg`;
const canonical = canonicalProfileMediaUrl(origin, owner, key);

Deno.test("profile media accepts exact owner and official object identities", () => {
  assert(isSafeProfileMediaObjectKey(owner, key), "owner key should be valid");
  assert(
    isSafeProfileMediaObjectKey("platform_rachi_official", "official/rachi/avatar/current.png"),
    "official Rachi key should be valid",
  );
  assert(!isSafeProfileMediaObjectKey(owner, "22222222-2222-4222-8222-222222222222/avatar/stolen.jpg"), "cross-owner key must fail");
  assert(!isSafeProfileMediaObjectKey(owner, `${owner}/avatar/../stolen.jpg`), "traversal must fail");
});

Deno.test("only the exact current Supabase proxy URL authorizes delivery", () => {
  assert(profileRowAuthorizesExactObject({
    avatarUrl: canonical,
    backgroundUrl: null,
    objectKey: key,
    ownerUserId: owner,
    supabaseUrl: origin,
  }), "exact canonical row should authorize");
  assert(!profileRowAuthorizesExactObject({
    avatarUrl: canonical.replace(origin, "https://attacker.example"),
    backgroundUrl: null,
    objectKey: key,
    ownerUserId: owner,
    supabaseUrl: origin,
  }), "hostile origin must not authorize");
  assert(!profileRowAuthorizesExactObject({
    avatarUrl: `${canonical}&objectKey=${owner}/avatar/other.jpg`,
    backgroundUrl: null,
    objectKey: key,
    ownerUserId: owner,
    supabaseUrl: origin,
  }), "ambiguous query must not authorize");
});

Deno.test("profile delivery accepts only an exact authoritative clean resolution", () => {
  const exact = {
    authoritative: true,
    allowed: true,
    reason: "profile_media_exact_clean",
    ownerUserId: owner,
    objectKey: key,
    mediaKind: "avatar",
    scanStatus: "clean",
  };
  assert(profileMediaDeliveryResolutionAllows({ value: exact, ownerUserId: owner, objectKey: key }), "exact clean resolution should authorize");
  assert(!profileMediaDeliveryResolutionAllows({ value: { ...exact, scanStatus: "pending_scan" }, ownerUserId: owner, objectKey: key }), "pending scan must fail");
  assert(!profileMediaDeliveryResolutionAllows({ value: { ...exact, authoritative: false }, ownerUserId: owner, objectKey: key }), "non-authoritative resolution must fail");
  assert(!profileMediaDeliveryResolutionAllows({ value: exact, ownerUserId: owner, objectKey: `${owner}/avatar/other.jpg` }), "wrong object must fail");
  assert(!profileMediaDeliveryResolutionAllows({ value: { allowed: true }, ownerUserId: owner, objectKey: key }), "malformed allow must fail");
});
