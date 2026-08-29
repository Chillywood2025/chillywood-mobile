import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const javascript = ts.transpileModule(readFileSync("_lib/profileMediaImageAuthority.ts", "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", "require", javascript)(module.exports, module, () => ({}));
const {
  bindProfileMediaImageSource,
  isExactProjectProfileMediaUrl,
  sourceContainsExactProjectProfileMediaUrl,
} = module.exports;

const PROJECT_URL = "https://project-ref.supabase.co";
const PRIVATE_IMAGE = `${PROJECT_URL}/functions/v1/profile-media-public?ownerUserId=owner&objectKey=owner/avatar/a.jpg`;

test("only the exact project profile-media function URL is authority-bound", () => {
  assert.equal(isExactProjectProfileMediaUrl(PRIVATE_IMAGE, PROJECT_URL), true);
  for (const uri of [
    "https://evil.example/functions/v1/profile-media-public?ownerUserId=owner&objectKey=owner/avatar/a.jpg",
    `${PROJECT_URL}.evil.example/functions/v1/profile-media-public?ownerUserId=owner&objectKey=owner/avatar/a.jpg`,
    `${PROJECT_URL}/functions/v1/profile-media-public/extra?ownerUserId=owner&objectKey=owner/avatar/a.jpg`,
    `${PROJECT_URL}/functions/v1/other?next=/functions/v1/profile-media-public`,
    `https://attacker@project-ref.supabase.co/functions/v1/profile-media-public`,
    "not-a-url",
  ]) {
    assert.equal(isExactProjectProfileMediaUrl(uri, PROJECT_URL), false, uri);
  }
});

test("an active session supplies the exact bearer and caller Authorization cannot override it", () => {
  const result = bindProfileMediaImageSource({
    uri: PRIVATE_IMAGE,
    cache: "force-cache",
    headers: {
      authorization: "Bearer attacker",
      "X-Image-Hint": "profile",
    },
  }, {
    accessToken: "authoritative-token",
    authorityStatus: "active",
    projectUrl: PROJECT_URL,
  });

  assert.deepEqual(result, {
    uri: PRIVATE_IMAGE,
    cache: "reload",
    headers: {
      "X-Image-Hint": "profile",
      Authorization: "Bearer authoritative-token",
    },
  });
  assert.equal(new URL(result.uri).searchParams.has("access_token"), false);
  assert.equal(result.uri.includes("authoritative-token"), false);
});

test("inactive, restricted, recovery, restore, and unknown sessions never send a bearer", () => {
  for (const authorityStatus of ["signed_out", "restricted", "recovery_only", "restore_only", "unknown", "loading"]) {
    const result = bindProfileMediaImageSource({
      uri: PRIVATE_IMAGE,
      headers: { AUTHORIZATION: "Bearer caller", Accept: "image/webp" },
    }, {
      accessToken: "must-not-leak",
      authorityStatus,
      projectUrl: PROJECT_URL,
    });
    assert.deepEqual(result.headers, { Accept: "image/webp" }, authorityStatus);
  }
});

test("missing or malformed active tokens remain anonymous and public images can still load", () => {
  for (const accessToken of [null, "", "  ", "token\r\nInjected: true"]) {
    const result = bindProfileMediaImageSource({ uri: PRIVATE_IMAGE }, {
      accessToken,
      authorityStatus: "active",
      projectUrl: PROJECT_URL,
    });
    assert.equal(result.headers, undefined);
  }
});

test("non-profile sources and local assets are preserved exactly", () => {
  const remote = { uri: "https://cdn.example/image.jpg", headers: { Authorization: "Bearer cdn-token" } };
  assert.equal(bindProfileMediaImageSource(remote, {
    accessToken: "session-token",
    authorityStatus: "active",
    projectUrl: PROJECT_URL,
  }), remote);
  assert.equal(bindProfileMediaImageSource(42, {
    accessToken: "session-token",
    authorityStatus: "active",
    projectUrl: PROJECT_URL,
  }), 42);
});

test("multi-source images bind only exact profile-media candidates", () => {
  const other = { uri: "https://cdn.example/fallback.jpg" };
  const result = bindProfileMediaImageSource([{ uri: PRIVATE_IMAGE }, other], {
    accessToken: "session-token",
    authorityStatus: "active",
    projectUrl: PROJECT_URL,
  });
  assert.deepEqual(result, [
    { uri: PRIVATE_IMAGE, cache: "reload", headers: { Authorization: "Bearer session-token" } },
    other,
  ]);
  assert.equal(sourceContainsExactProjectProfileMediaUrl(result, PROJECT_URL), true);
  assert.equal(sourceContainsExactProjectProfileMediaUrl([other], PROJECT_URL), false);
  assert.equal(sourceContainsExactProjectProfileMediaUrl(42, PROJECT_URL), false);
});

test("same-user token refresh replaces the protected image bearer binding", () => {
  const before = bindProfileMediaImageSource({ uri: PRIVATE_IMAGE }, {
    accessToken: "same-user-token-before-refresh",
    authorityStatus: "active",
    projectUrl: PROJECT_URL,
  });
  const after = bindProfileMediaImageSource({ uri: PRIVATE_IMAGE }, {
    accessToken: "same-user-token-after-refresh",
    authorityStatus: "active",
    projectUrl: PROJECT_URL,
  });

  assert.deepEqual(before.headers, { Authorization: "Bearer same-user-token-before-refresh" });
  assert.deepEqual(after.headers, { Authorization: "Bearer same-user-token-after-refresh" });
  assert.equal(after.uri, before.uri);
});

test("the shared component rebinds when a same-user access token refreshes", () => {
  const component = readFileSync("components/ui/ProfileMediaImage.tsx", "utf8");
  assert.match(component, /const accessToken = hasExactActiveAuthority/);
  assert.match(component, /\[accessToken, authorityStatus, source\]/);
  assert.match(component, /authority\.restoreOnly === false/);
  assert.match(component, /authority\.userId === sessionContext\.session\?\.user\.id/);
  assert.match(component, /authority\.accountId === sessionContext\.session\?\.user\.id/);
});

test("Settings previews use saved active URLs and replacement/removal refreshes local profile state", () => {
  const settings = readFileSync("app/settings.tsx", "utf8");
  assert.match(settings, /const activeProfilePhotoUrl = isProfileMediaActive\(myProfile\?\.profileAvatarMediaStatus\)[\s\S]*?myProfile\?\.avatarUrl/);
  assert.match(settings, /const activeProfileBackgroundUrl = isProfileMediaActive\(myProfile\?\.profileBackgroundMediaStatus\)[\s\S]*?myProfile\?\.profileBackgroundUrl/);
  assert.match(settings, /source=\{\{ uri: activeProfilePhotoUrl \}\}/);
  assert.match(settings, /source=\{\{ uri: activeProfileBackgroundUrl \}\}/);
  assert.match(settings, /const nextProfile = await uploadProfileMedia[\s\S]*?setMyProfile\(nextProfile\)/);
  assert.match(settings, /const nextProfile = await removeProfileMedia\(kind\);[\s\S]*?setMyProfile\(nextProfile\)/);
});

test("persisted profile-media URLs never contain bearer credentials", () => {
  const profileMedia = readFileSync("_lib/profileMedia.ts", "utf8");
  assert.equal(PRIVATE_IMAGE.includes("access_token"), false);
  assert.doesNotMatch(profileMedia, /[?&](?:access_token|token)=/i);
  assert.match(profileMedia, /buildProfileMediaReadUrl[\s\S]*?ownerUserId=.*?objectKey=/);
});
