import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accountAuthority,
  accountStorage,
  createBlockingMemoryStorage,
  createMemoryStorage,
  loadStubbed,
  read,
} from "./customer-experience-adversarial-helpers.mjs";

import {
  MAX_EXTERNAL_NAVIGATION_INPUT_LENGTH,
  sanitizeExternalNavigationInput,
} from "../_lib/externalNavigationInputSafety.mjs";
import { invokeAccountBoundSupabaseRpc } from "../_lib/accountBoundSupabaseRpc.mjs";

test("malformed or oversized external routes fail closed before navigation query decoding", () => {
  const valid = "chillywoodmobile://event/123?source=notification&title=Chi%27llywood";
  assert.equal(sanitizeExternalNavigationInput(valid), valid);
  assert.equal(sanitizeExternalNavigationInput("chillywoodmobile://event/123?bad=%E0%A4%A"), null);
  assert.equal(sanitizeExternalNavigationInput(`/${"a".repeat(MAX_EXTERNAL_NAVIGATION_INPUT_LENGTH)}`), null);
  assert.equal(sanitizeExternalNavigationInput("/event/123\u0000hidden"), null);

  const nativeIntent = read("app/+native-intent.tsx");
  const appLinks = read("_lib/appLinks.ts");
  assert.match(nativeIntent, /const safePath = sanitizeExternalNavigationInput\(path\) \?\? "\/"/u);
  assert.match(nativeIntent, /redirectEarlyAndroidNativeCallSystemPath\(safePath\)/u);
  assert.match(nativeIntent, /sanitizeExternalIosNativeCallPath\(safePath\)/u);
  assert.match(appLinks, /try \{\s*decodeURIComponent\(raw\);\s*\} catch \{\s*return null;/u);
});

test("unowned legacy customer state is ignored and scoped state remains isolated across A -> B -> A", async () => {
  const baseKey = "@chillywood/my-list";
  const storage = createMemoryStorage({
    [baseKey]: JSON.stringify({ "video-a": { id: "video-a", savedAt: 10 } }),
  });

  const accountA = await accountStorage.readAccountScopedJsonValue(storage, baseKey, "account-a", {});
  assert.deepEqual(accountA, {});
  await accountStorage.writeAccountScopedJsonValue(
    storage,
    baseKey,
    "account-a",
    { "video-a": { id: "video-a", savedAt: 10 } },
  );
  assert.deepEqual(
    await accountStorage.readAccountScopedJsonValue(storage, baseKey, "account-b", {}),
    {},
  );

  await accountStorage.writeAccountScopedJsonValue(
    storage,
    baseKey,
    "account-b",
    { "video-b": { id: "video-b", savedAt: 20 } },
  );
  assert.deepEqual(
    Object.keys(await accountStorage.readAccountScopedJsonValue(storage, baseKey, "account-b", {})),
    ["video-b"],
  );
  assert.deepEqual(
    Object.keys(await accountStorage.readAccountScopedJsonValue(storage, baseKey, "account-a", {})),
    ["video-a"],
  );
});

test("unowned legacy cache cannot project prior-account state into any account or signed-out state", async () => {
  const baseKey = "@chillywood/watch-progress";
  const storage = createMemoryStorage({ [baseKey]: JSON.stringify({ "title-a": { positionMillis: 50 } }) });
  const [accountA, accountB, signedOut] = await Promise.all([
    accountStorage.readAccountScopedJsonValue(storage, baseKey, "account-a", {}),
    accountStorage.readAccountScopedJsonValue(storage, baseKey, "account-b", {}),
    accountStorage.readAccountScopedJsonValue(storage, baseKey, null, {}),
  ]);
  assert.deepEqual(accountA, {});
  assert.deepEqual(accountB, {});
  assert.deepEqual(signedOut, {});
});

test("navigation identity is stable for harmless same-session refresh and changes for account replacement", () => {
  const accountA = {
    userId: "account-a",
    accountId: "account-a",
    sessionGeneration: "generation-a",
    state: "ACTIVE",
    restoreOnly: false,
  };
  assert.equal(
    accountAuthority.getAccountNavigationTreeKey(accountA),
    accountAuthority.getAccountNavigationTreeKey({ ...accountA }),
  );
  assert.notEqual(
    accountAuthority.getAccountNavigationTreeKey(accountA),
    accountAuthority.getAccountNavigationTreeKey({
      ...accountA,
      userId: "account-b",
      accountId: "account-b",
      sessionGeneration: "generation-b",
    }),
  );
});

test("account-bound RPC transport keeps the initiating token and platform across delayed A -> B dispatch", async () => {
  let activeToken = "token-account-a";
  let requestHeaders;
  let releaseRequest;
  let markRequestReached;
  const requestReached = new Promise((resolve) => { markRequestReached = resolve; });
  const requestReleased = new Promise((resolve) => { releaseRequest = resolve; });
  const pending = invokeAccountBoundSupabaseRpc({
    supabaseUrl: "https://example.supabase.co",
    anonKey: "anon-public-key",
    accessToken: activeToken,
    clientPlatform: "android",
    functionName: "get_or_create_direct_chat_thread",
    args: { p_target_user_id: "account-c" },
    fetchImpl: async (_url, options) => {
      requestHeaders = options.headers;
      markRequestReached();
      await requestReleased;
      return { ok: true, status: 200, json: async () => [{ thread_id: "thread-a-c" }] };
    },
  });
  await requestReached;
  activeToken = "token-account-b";
  releaseRequest();
  assert.deepEqual(await pending, { data: [{ thread_id: "thread-a-c" }], error: null });
  assert.equal(requestHeaders.Authorization, "Bearer token-account-a");
  assert.equal(requestHeaders["x-chillywood-platform"], "android");
  assert.notEqual(requestHeaders.Authorization, `Bearer ${activeToken}`);

  const chatSource = read("_lib/chat.ts");
  const accountBoundMutationSource = read("_lib/accountBoundSupabaseMutation.ts");
  assert.match(chatSource, /captureChatMutationAuthority/u);
  assert.match(accountBoundMutationSource, /parseAccountSessionAuthorityReadback\(readback\.data\)/u);
  for (const rpcName of [
    "get_or_create_direct_chat_thread",
    "hide_chat_thread_from_inbox",
    "unhide_chat_thread_for_me",
  ]) {
    assert.match(chatSource, new RegExp(`invokeBoundChatRpc[\\s\\S]{0,180}"${rpcName}"`, "u"));
  }
});

test("actor-implicit customer and operator mutations use immutable account-bound dispatch", () => {
  const fullyBound = [
    ["_lib/accountDeletionRequests.ts", ["schedule_account_deletion"]],
    ["_lib/betaProgram.tsx", ["activate_beta_membership", "acknowledge_beta_onboarding"]],
    ["_lib/chillyChatCalls.ts", ["begin_chilly_chat_call"]],
    ["_lib/contentRights.ts", ["record_content_rights_disclosure"]],
    ["_lib/friendGraph.ts", ["request_friendship", "respond_to_friendship"]],
    ["_lib/usernameHandles.ts", ["update_my_username"]],
    ["_lib/creatorMonetization.ts", ["set_creator_content_price", "create_creator_product_listing", "request_creator_payout"]],
    ["_lib/creatorMonetizationSetup.ts", ["save_creator_sandbox_monetization_config", "create_money_purchase_intent"]],
    ["_lib/creatorTips.ts", ["upsert_my_creator_tip_settings", "create_money_purchase_intent"]],
    ["_lib/liveWatchPartyMoney.ts", ["request_my_live_watch_party_seat", "review_live_watch_party_seat_request", "create_live_watch_party_purchase_intent"]],
    ["_lib/moderation.ts", ["admin_grant_platform_role_by_email", "apply_admin_report_target_action"]],
  ];
  for (const [path, rpcNames] of fullyBound) {
    const source = read(path);
    assert.match(
      source,
      /(?:runCurrentAccountBoundSupabaseMutationRpc|invokeAccountBoundSupabaseMutationRpc|invokeCreatorMoneyPurchaseSubjectRpc)/u,
      `${path} must use immutable account-bound RPC dispatch`,
    );
    for (const rpcName of rpcNames) assert.match(source, new RegExp(`"${rpcName}"`, "u"));
  }

  const accountDeletionSource = read("_lib/accountDeletionRequests.ts");
  const mutationHelper = read("_lib/accountBoundSupabaseMutation.ts");
  assert.match(accountDeletionSource, /runAccountRestorationBoundSupabaseMutationRpc<unknown>\(\)/u);
  assert.match(mutationHelper, /"restore_scheduled_account_deletion"/u);
  assert.doesNotMatch(
    accountDeletionSource,
    /runCurrentAccountBoundSupabaseMutationRpc<unknown>\(\s*"restore_scheduled_account_deletion"/u,
  );

  const exactSessionHelper = read("_lib/accountBoundSupabaseMutation.ts");
  const exactSessionSql = read("supabase/migrations/202608250001_chilly_chat_room_authority_closure.sql");
  for (const rpcName of [
    "heartbeat_watch_party_room_session",
    "join_communication_room_session",
    "join_watch_party_room_session",
    "set_watch_party_participant_authority",
  ]) {
    assert.equal(
      exactSessionHelper.includes(`| "${rpcName}"`),
      true,
      `${rpcName} must stay on the exact-session RPC whitelist`,
    );
    const functionStart = exactSessionSql.indexOf(`create or replace function public."${rpcName}"`);
    assert.ok(functionStart >= 0, `${rpcName} must remain defined`);
    assert.match(
      exactSessionSql.slice(functionStart, functionStart + 7_000),
      /whole_app_exact_current_session_authority_internal"?\(\)/u,
      `${rpcName} must reject a stale server session before mutation`,
    );
  }
});

test("scheduled-deletion restoration is the only restore-only mutation escape and stays exact-session bound", async () => {
  const authority = {
    userId: "11111111-1111-4111-8111-111111111111",
    accountId: "11111111-1111-4111-8111-111111111111",
    sessionGeneration: "restore-session",
    state: "ACTIVE",
    restoreOnly: true,
  };
  const calls = [];
  const helper = loadStubbed("_lib/accountBoundSupabaseMutation.ts", {
    "./accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: () => authority,
      parseAccountSessionAuthorityReadback: (value) => value,
      sameAccountSessionAuthority: (left, right) => !!left && !!right
        && left.userId === right.userId
        && left.accountId === right.accountId
        && left.sessionGeneration === right.sessionGeneration
        && left.restoreOnly === right.restoreOnly,
    },
    "./accountBoundSupabaseRpc.mjs": {
      invokeAccountBoundSupabaseRpc: async (input) => {
        calls.push(input);
        return input.functionName === "wave1_session_authority_readback"
          ? { data: authority, error: null }
          : { data: { restored: true }, error: null };
      },
    },
    "./entitlementAuthority": { withAuthorityReadDeadline: async (operation) => await operation },
    "./supabase": {
      SUPABASE_ANON_KEY: "anon",
      SUPABASE_URL: "https://example.supabase.co",
      supabase: {
        auth: {
          getSession: async () => ({
            data: { session: { access_token: "frozen-restore-token", user: { id: authority.userId } } },
          }),
        },
      },
    },
    "react-native": { Platform: { OS: "ios" } },
  });

  await assert.rejects(
    helper.runCurrentAccountBoundSupabaseMutationRpc("schedule_account_deletion"),
    /signed-in account changed/u,
  );
  const restored = await helper.runAccountRestorationBoundSupabaseMutationRpc();
  assert.equal(restored.data.restored, true);
  assert.deepEqual(calls.map((call) => call.functionName), [
    "wave1_session_authority_readback",
    "restore_scheduled_account_deletion",
  ]);
  assert.ok(calls.every((call) => call.accessToken === "frozen-restore-token"));
  assert.equal(
    helper.isAccountBoundSupabaseMutationOutcomeAmbiguous({ message: "account_bound_rpc_timeout" }),
    true,
  );
  assert.equal(
    helper.isAccountBoundSupabaseMutationOutcomeAmbiguous({ message: "account_bound_rpc_unavailable" }),
    true,
  );
  assert.equal(
    helper.isAccountBoundSupabaseMutationOutcomeAmbiguous({ message: "permission_denied" }),
    false,
  );

  const migration = read("supabase/migrations/20260912235900_account_deletion_restore_exact_session_closure.sql");
  assert.match(migration, /auth\."sessions"/u);
  assert.match(migration, /session_row\."not_after" > now\(\)/u);
  assert.match(migration, /wave1_session_authority_readback/u);
  assert.doesNotMatch(migration, /restoreOnly'\)::boolean[^\n]*false/u);
});

test("Official Rachi picker cannot transfer an account-A gesture to privileged account B", async () => {
  const accountA = {
    userId: "11111111-1111-4111-8111-111111111111",
    accountId: "11111111-1111-4111-8111-111111111111",
    sessionGeneration: "operator-a",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const accountB = {
    userId: "22222222-2222-4222-8222-222222222222",
    accountId: "22222222-2222-4222-8222-222222222222",
    sessionGeneration: "operator-b",
    state: "ACTIVE",
    restoreOnly: false,
  };
  let current = accountA;
  let releasePicker;
  const picker = new Promise((resolve) => { releasePicker = resolve; });
  let captureCalls = 0;
  const api = loadStubbed("_lib/officialRachi.ts", {
    "expo-file-system": { File: class {} },
    "expo-file-system/legacy": {},
    "./officialAccounts": { RACHI_OFFICIAL_ACCOUNT: { userId: accountA.userId } },
    "./profileMedia": {
      pickProfileMediaImage: async () => await picker,
      PROFILE_AVATAR_MAX_BYTES: 10_000_000,
      PROFILE_MEDIA_BUCKET: "profile-media",
    },
    "./accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: () => current,
      sameAccountSessionAuthority: (left, right) => !!left && !!right
        && left.userId === right.userId
        && left.accountId === right.accountId
        && left.sessionGeneration === right.sessionGeneration
        && left.restoreOnly === right.restoreOnly,
    },
    "./accountBoundSupabaseMutation": {
      captureAccountBoundSupabaseMutationSubject: async () => { captureCalls += 1; return {}; },
    },
    "./supabase": { SUPABASE_ANON_KEY: "anon", SUPABASE_URL: "https://example.supabase.co", supabase: {} },
  });

  const pending = api.chooseOfficialRachiProfileImageFromGallery();
  current = accountB;
  releasePicker({ uri: "file:///selected.jpg", mimeType: "image/jpeg", size: 100 });
  await assert.rejects(pending, /operator account changed/u);
  assert.equal(captureCalls, 0);

  const source = read("_lib/officialRachi.ts");
  assert.match(source, /Authorization: `Bearer \$\{subject\.accessToken\}`/u);
  assert.match(source, /updateOfficialRachiProfileImageWithSubject\(subject/u);
  assert.doesNotMatch(source, /supabase\.storage\.from\(PROFILE_MEDIA_BUCKET\)\.remove/u);
});

test("Official Rachi retains an uploaded image while an ambiguous profile RPC is reconciled", async () => {
  const authority = {
    userId: "11111111-1111-4111-8111-111111111111",
    accountId: "11111111-1111-4111-8111-111111111111",
    sessionGeneration: "operator-a",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const subject = { accessToken: "operator-a-token", authority };
  let rpcError = { message: "account_bound_rpc_timeout" };
  let deleteRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    deleteRequests += 1;
    return { ok: true };
  };

  try {
    const api = loadStubbed("_lib/officialRachi.ts", {
      "expo-file-system": { File: class { constructor(uri) { this.uri = uri; } } },
      "expo-file-system/legacy": {},
      "./officialAccounts": { RACHI_OFFICIAL_ACCOUNT: { userId: authority.userId } },
      "./creatorVideos": {},
      "./profilePosts": {},
      "./profileMedia": {
        pickProfileMediaImage: async () => ({ uri: "file:///selected.jpg", mimeType: "image/jpeg", size: 100 }),
        PROFILE_AVATAR_MAX_BYTES: 10_000_000,
        PROFILE_MEDIA_BUCKET: "profile-media",
      },
      "./accountSessionAuthority": {
        getCurrentAccountSessionAuthoritySnapshot: () => authority,
        sameAccountSessionAuthority: (left, right) => left?.sessionGeneration === right?.sessionGeneration,
      },
      "./accountBoundSupabaseMutation": {
        assertAccountBoundSupabaseMutationSubjectCurrent: () => {},
        captureAccountBoundSupabaseMutationSubject: async () => subject,
        invokeAccountBoundSupabaseMutationRpc: async () => ({ data: null, error: rpcError }),
        isAccountBoundSupabaseMutationOutcomeAmbiguous: (error) => [
          "account_bound_rpc_timeout",
          "account_bound_rpc_unavailable",
        ].includes(error?.message),
      },
      "./supabase": {
        SUPABASE_ANON_KEY: "anon",
        SUPABASE_URL: "https://example.supabase.co",
        supabase: {
          storage: {
            from: () => ({ upload: async () => ({ error: null }) }),
          },
        },
      },
      "./userData": {
        readUserProfileByUserId: async () => ({ avatarUrl: "https://example.test/previous.jpg" }),
      },
    });

    await assert.rejects(
      api.chooseOfficialRachiProfileImageFromGallery(),
      /still being verified/u,
    );
    assert.equal(deleteRequests, 0, "an unknown commit outcome must retain the uploaded object");

    rpcError = { message: "permission_denied" };
    await assert.rejects(
      api.chooseOfficialRachiProfileImageFromGallery(),
      (error) => error?.message === "permission_denied",
    );
    assert.equal(deleteRequests, 1, "a definitive rejection may remove its unreferenced upload");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creator sandbox setup cannot transfer account-A input to account B during eligibility", async () => {
  const accountA = {
    userId: "11111111-1111-4111-8111-111111111111",
    accountId: "11111111-1111-4111-8111-111111111111",
    sessionGeneration: "creator-a",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const accountB = {
    userId: "22222222-2222-4222-8222-222222222222",
    accountId: "22222222-2222-4222-8222-222222222222",
    sessionGeneration: "creator-b",
    state: "ACTIVE",
    restoreOnly: false,
  };
  let current = accountA;
  let releaseEligibility;
  const eligibility = new Promise((resolve) => { releaseEligibility = resolve; });
  let captureCalls = 0;
  let mutationCalls = 0;
  const api = loadStubbed("_lib/creatorMonetizationSetup.ts", {
    "react-native": { Linking: {}, Platform: { OS: "android" } },
    "./supabase": {
      SUPABASE_URL: "https://example.supabase.co",
      supabase: {
        rpc: async (name) => {
          assert.equal(name, "wave1_creator_eligibility_readback");
          await eligibility;
          return { data: accountA, error: null };
        },
      },
    },
    "./accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: () => current,
      readCurrentAccountSessionAuthority: async () => current,
      sameAccountSessionAuthority: (left, right) => !!left && !!right
        && left.userId === right.userId
        && left.accountId === right.accountId
        && left.sessionGeneration === right.sessionGeneration
        && left.restoreOnly === right.restoreOnly,
    },
    "./creatorEligibility": {
      canCreateCreatorMoneyExposure: (value) => value?.canCreateMoneyExposure === true,
      parseCreatorEligibilityReadback: (value) => ({
        ...(value ?? {}),
        canCreateMoneyExposure: value?.userId === accountA.userId,
      }),
    },
    "./entitlementAuthority": { withAuthorityReadDeadline: async (operation) => await operation },
    "./accountBoundSupabaseMutation": {
      captureAccountBoundSupabaseMutationSubject: async () => {
        captureCalls += 1;
        return { authority: current, accessToken: "unexpected" };
      },
      invokeAccountBoundSupabaseMutationRpc: async () => {
        mutationCalls += 1;
        return { data: {}, error: null };
      },
    },
  });

  const pending = api.saveCreatorSandboxMonetizationConfig({
    displayName: "Creator A tip",
    productKey: "creator_tip_sandbox_099",
    sourceId: accountA.userId,
    sourceType: "creator_tip",
  });
  current = accountB;
  releaseEligibility();
  await assert.rejects(pending, /verification is complete|account changed/u);
  assert.equal(captureCalls, 0);
  assert.equal(mutationCalls, 0);

  const migration = read("supabase/migrations/20260912235910_preproduction_adversarial_product_integrity_closure.sql");
  assert.match(migration, /creator_sandbox_source_owned_by_current_user_internal/u);
  assert.match(migration, /video\."owner_id" = auth\.uid\(\)/u);
  assert.match(migration, /event_row\."host_user_id" = auth\.uid\(\)/u);
  assert.match(migration, /creator_sandbox_source_not_owned/u);
});

test("Official Rachi ambiguous retries reuse one server-idempotent operation key", async () => {
  const authority = {
    userId: "11111111-1111-4111-8111-111111111111",
    accountId: "11111111-1111-4111-8111-111111111111",
    sessionGeneration: "operator-a",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const rpcArgs = [];
  let attempt = 0;
  const api = loadStubbed("_lib/officialRachi.ts", {
    "expo-file-system": { File: class {} },
    "expo-file-system/legacy": {},
    "./officialAccounts": { RACHI_OFFICIAL_ACCOUNT: { userId: "platform_rachi_official" } },
    "./profileMedia": { PROFILE_AVATAR_MAX_BYTES: 10_000_000, PROFILE_MEDIA_BUCKET: "profile-media" },
    "./accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: () => authority,
      sameAccountSessionAuthority: (left, right) => left?.sessionGeneration === right?.sessionGeneration,
    },
    "./accountBoundSupabaseMutation": {
      captureAccountBoundSupabaseMutationSubject: async () => ({ authority, accessToken: "operator-a-token" }),
      invokeAccountBoundSupabaseMutationRpc: async (_subject, name, args) => {
        assert.equal(name, "admin_create_official_rachi_post");
        rpcArgs.push(args);
        attempt += 1;
        return attempt === 1
          ? { data: null, error: { message: "account_bound_rpc_timeout" } }
          : {
            data: {
              id: "33333333-3333-4333-8333-333333333333",
              userId: "platform_rachi_official",
              body: args.p_body,
              createdAt: "2026-09-13T00:00:00.000Z",
            },
            error: null,
          };
      },
      isAccountBoundSupabaseMutationOutcomeAmbiguous: (error) => error?.message === "account_bound_rpc_timeout",
    },
    "./supabase": { SUPABASE_ANON_KEY: "anon", SUPABASE_URL: "https://example.supabase.co", supabase: {} },
  });

  const operationKey = api.createOfficialRachiPostOperationKey();
  assert.match(operationKey, /^rachi-post:[0-9a-f]{32}$/u);
  const input = { body: "One exact update", operationKey, reason: "Publish customer update" };
  await assert.rejects(api.createOfficialRachiPost(input), /still being verified/u);
  const replay = await api.createOfficialRachiPost(input);
  assert.equal(replay.id, "33333333-3333-4333-8333-333333333333");
  assert.equal(rpcArgs.length, 2);
  assert.equal(rpcArgs[0].p_operation_key, operationKey);
  assert.equal(rpcArgs[1].p_operation_key, operationKey);

  const migration = read("supabase/migrations/20260912235910_preproduction_adversarial_product_integrity_closure.sql");
  assert.match(migration, /pg_advisory_xact_lock/u);
  assert.match(migration, /audit\."metadata"->>'operation_key' = safe_operation_key/u);
  assert.match(migration, /'idempotent', true/u);
  const admin = read("app/admin.tsx");
  assert.match(admin, /rachiPostOperationRef/u);
  assert.match(admin, /rachiPostLatchRef\.current\.tryAcquire\(\)/u);
});

test("privileged timeout retries preserve one actor-bound staff grant or DMCA strike intent", async () => {
  let staffAttempt = 0;
  const staffCalls = [];
  const moderation = loadStubbed("_lib/moderation.ts", {
    "./accountBoundSupabaseMutation": {
      createAccountBoundMutationOperationKey: (prefix) => `${prefix}:${"a".repeat(32)}`,
      isAccountBoundSupabaseMutationOutcomeAmbiguous: (error) => error?.message === "account_bound_rpc_timeout",
      runCurrentAccountBoundSupabaseMutationRpc: async (name, args) => {
        staffCalls.push({ name, args });
        staffAttempt += 1;
        return staffAttempt === 1
          ? { data: null, error: { message: "account_bound_rpc_timeout" } }
          : { data: { id: 17, email: args.p_target_email, role: "moderator", status: "active" }, error: null };
      },
    },
    "./supabase": { supabase: {} },
  });
  const staffOperationKey = moderation.createPlatformStaffRoleGrantOperationKey();
  const staffInput = {
    email: "moderator@example.test",
    operationKey: staffOperationKey,
    reason: "Exact staff grant",
    role: "moderator",
  };
  await assert.rejects(moderation.grantPlatformStaffRoleByEmail(staffInput), /still being verified/u);
  assert.equal((await moderation.grantPlatformStaffRoleByEmail(staffInput)).id, 17);
  assert.deepEqual(staffCalls.map((call) => call.name), [
    "admin_grant_platform_role_by_email",
    "admin_grant_platform_role_by_email",
  ]);
  assert.ok(staffCalls.every((call) => call.args.p_operation_key === staffOperationKey));

  let strikeAttempt = 0;
  const strikeCalls = [];
  const dmca = loadStubbed("_lib/dmca.ts", {
    "./accountBoundSupabaseMutation": {
      createAccountBoundMutationOperationKey: (prefix) => `${prefix}:${"b".repeat(32)}`,
      isAccountBoundSupabaseMutationOutcomeAmbiguous: (error) => error?.message === "account_bound_rpc_timeout",
      runCurrentAccountBoundSupabaseMutationRpc: async (name, args) => {
        strikeCalls.push({ name, args });
        strikeAttempt += 1;
        return strikeAttempt === 1
          ? { data: null, error: { message: "account_bound_rpc_timeout" } }
          : {
            data: {
              id: "33333333-3333-4333-8333-333333333333",
              user_id: args.p_user_id,
              dmca_case_id: args.p_case_id,
              content_type: args.p_content_type,
              content_id: args.p_content_id,
              strike_status: "active",
              severity: args.p_severity,
              reason: args.p_reason,
            },
            error: null,
          };
      },
    },
    "./supabase": { supabase: {} },
  });
  const strikeOperationKey = dmca.createDmcaStrikeOperationKey();
  const strikeInput = {
    caseId: "11111111-1111-4111-8111-111111111111",
    contentId: "video-1",
    contentType: "creator_video",
    operationKey: strikeOperationKey,
    reason: "Exact infringement",
    severity: "standard",
    userId: "22222222-2222-4222-8222-222222222222",
  };
  await assert.rejects(dmca.adminDmcaAddStrike(strikeInput), /still being verified/u);
  assert.equal((await dmca.adminDmcaAddStrike(strikeInput)).id, "33333333-3333-4333-8333-333333333333");
  assert.deepEqual(strikeCalls.map((call) => call.name), ["admin_dmca_add_strike", "admin_dmca_add_strike"]);
  assert.ok(strikeCalls.every((call) => call.args.p_operation_key === strikeOperationKey));

  const migration = read("supabase/migrations/20260912235910_preproduction_adversarial_product_integrity_closure.sql");
  assert.match(migration, /privileged_mutation_operation_receipts/u);
  assert.match(migration, /platform_staff_operation_key_conflict/u);
  assert.match(migration, /dmca_strike_operation_key_conflict/u);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/u);
  const admin = read("app/admin.tsx");
  assert.match(admin, /staffRoleGrantLatchRef\.current\.tryAcquire\(\)/u);
  assert.match(admin, /dmcaStrikeLatchRef\.current\.tryAcquire\(\)/u);
  assert.match(admin, /JSON\.stringify\(\[user\?\.id \?\? "", email, role, reason\]\)/u);
  assert.match(admin, /dmcaStrikeOperationRef\.current = null;[\s\S]*rachiPostOperationRef\.current = null;[\s\S]*staffRoleGrantOperationRef\.current = null;/u);
});

test("physical merch checkout freezes the tap account and uses one canonical launcher", async () => {
  const accountA = {
    userId: "11111111-1111-4111-8111-111111111111",
    accountId: "11111111-1111-4111-8111-111111111111",
    sessionGeneration: "account-a",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const accountB = {
    userId: "22222222-2222-4222-8222-222222222222",
    accountId: "22222222-2222-4222-8222-222222222222",
    sessionGeneration: "account-b",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const sameAuthority = (left, right) => !!left && !!right
    && left.userId === right.userId
    && left.accountId === right.accountId
    && left.sessionGeneration === right.sessionGeneration
    && left.restoreOnly === right.restoreOnly;
  let current = accountA;
  let captureGate = null;
  let capturedExpectedUserId = "";
  let openCalls = 0;
  let authorization = "";
  const originalFetch = globalThis.fetch;

  const api = loadStubbed("_lib/creatorMonetizationSetup.ts", {
    "react-native": {
      Linking: { openURL: async () => { openCalls += 1; } },
      Platform: { OS: "android" },
    },
    "./paymentRailPolicy": {
      REVENUECAT_APP_STORE_PROVIDER: "revenuecat_app_store",
      REVENUECAT_GOOGLE_PLAY_PROVIDER: "revenuecat_google_play",
    },
    "./creatorEligibility": {},
    "./accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: () => current,
      sameAccountSessionAuthority: sameAuthority,
    },
    "./accountBoundSupabaseMutation": {
      assertAccountBoundSupabaseMutationSubjectCurrent: (value) => {
        if (!sameAuthority(value.authority, current)) throw new Error("account changed");
      },
      captureAccountBoundSupabaseMutationSubject: async (expectedUserId) => {
        capturedExpectedUserId = expectedUserId;
        if (captureGate) await captureGate;
        return { accessToken: "token-account-a", authority: accountA };
      },
    },
    "./supabase": { SUPABASE_URL: "https://example.supabase.co", supabase: {} },
  });

  try {
    globalThis.fetch = async (_url, options) => {
      authorization = options.headers.Authorization;
      return {
        ok: true,
        json: async () => ({ checkoutCreated: true, orderId: "order-a", url: "https://checkout.stripe.test/a" }),
      };
    };
    assert.deepEqual(await api.launchCreatorMerchSandboxCheckout(), { orderId: "order-a" });
    assert.equal(capturedExpectedUserId, accountA.userId);
    assert.equal(authorization, "Bearer token-account-a");
    assert.equal(openCalls, 1);

    current = accountA;
    let releaseCapture;
    captureGate = new Promise((resolve) => { releaseCapture = resolve; });
    const pending = api.launchCreatorMerchSandboxCheckout();
    current = accountB;
    releaseCapture();
    await assert.rejects(pending, /account changed/u);
    assert.equal(capturedExpectedUserId, accountA.userId);
    assert.equal(openCalls, 1, "account replacement must stop before opening another checkout");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const launcher = read("_lib/creatorMonetizationSetup.ts");
  const app = read("app/admin-money-sandbox-purchases.tsx");
  const launchStart = launcher.indexOf("export async function launchCreatorMerchSandboxCheckout");
  const launchBody = launcher.slice(launchStart, launchStart + 3_000);
  assert.ok(launchBody.indexOf("getCurrentAccountSessionAuthoritySnapshot()") < launchBody.indexOf("await captureAccountBoundSupabaseMutationSubject"));
  assert.match(launchBody, /Authorization: `Bearer \$\{subject\.accessToken\}`/u);
  assert.match(launchBody, /assertAccountBoundSupabaseMutationSubjectCurrent\(subject\)[\s\S]*?Linking\.openURL/u);
  assert.match(app, /await launchCreatorMerchSandboxCheckout\(\)/u);
  assert.doesNotMatch(app, /functions\/v1\/stripe-merch-checkout/u);
});

test("Premium purchase and restore preserve the physical-tap account through every preflight await", () => {
  const monetization = read("_lib/monetization.ts");
  for (const functionName of ["purchaseMonetizationTarget", "restoreMonetizationAccess", "purchaseBlockedAccess"]) {
    const start = monetization.indexOf(`export async function ${functionName}`);
    assert.ok(start >= 0);
    const body = monetization.slice(start, start + 4_500);
    const capture = body.indexOf("getCurrentAccountSessionAuthoritySnapshot()");
    const remoteAuthority = body.indexOf("await readCurrentAccountSessionAuthority()");
    assert.ok(capture >= 0 && remoteAuthority > capture, functionName);
    assert.match(body, /expectedAuthority:/u);
  }
  for (const path of ["app/subscribe.tsx", "components/monetization/access-sheet.tsx"]) {
    const source = read(path);
    const capture = source.indexOf("const initiatingAuthority = getCurrentAccountSessionAuthoritySnapshot()", source.indexOf("onPurchase"));
    const preflight = Math.min(
      ...["resolveInternalTesterSandboxPurchaseMode", "resolvePurchaseMode"]
        .map((token) => source.indexOf(token, capture))
        .filter((index) => index >= 0),
    );
    assert.ok(capture >= 0 && preflight > capture, path);
    assert.match(source.slice(capture, capture + 4_000), /initiatingAuthority,/u);
  }
});

test("main-tab profile cache rejects mixed accounts and stale A -> B -> A generations", () => {
  const profileCache = loadStubbed("components/navigation/main-tab-profile-cache.ts", {
    "../../_lib/accountSessionAuthority": accountAuthority,
  });
  const accountA = {
    userId: "account-a", accountId: "account-a", sessionGeneration: "generation-a", state: "ACTIVE", restoreOnly: false,
  };
  const accountB = {
    userId: "account-b", accountId: "account-b", sessionGeneration: "generation-b", state: "ACTIVE", restoreOnly: false,
  };
  const nextAccountA = { ...accountA, sessionGeneration: "generation-a-next" };
  const profileA = { id: "account-a", username: "account-a", displayName: "Account A" };

  accountAuthority.publishAccountSessionAuthoritySnapshot(accountA);
  assert.equal(profileCache.setMainTabHeaderProfileSnapshot(profileA, true, accountA), true);
  assert.equal(profileCache.getMainTabHeaderProfileSnapshot(accountA).profile.displayName, "Account A");

  accountAuthority.publishAccountSessionAuthoritySnapshot(accountB);
  assert.equal(profileCache.setMainTabHeaderProfileSnapshot(
    { ...profileA, displayName: "Account B data under A id" },
    true,
    accountA,
  ), false);
  assert.equal(profileCache.getMainTabHeaderProfileSnapshot(accountB).profile, null);

  accountAuthority.publishAccountSessionAuthoritySnapshot(nextAccountA);
  assert.equal(profileCache.getMainTabHeaderProfileSnapshot(nextAccountA).profile, null);
  assert.equal(profileCache.setMainTabHeaderProfileSnapshot(profileA, true, accountA), false);
  accountAuthority.publishAccountSessionAuthoritySnapshot(null);

  const topBar = read("components/navigation/main-tab-top-bar.tsx");
  const home = read("app/(tabs)/index.tsx");
  assert.match(topBar, /readUserProfile\(safeUserId\)/u);
  assert.match(topBar, /setMainTabHeaderProfileSnapshot\(nextProfile, resolved, expectedAuthority\)/u);
  assert.match(home, /const expectedAuthority = getCurrentAccountSessionAuthoritySnapshot\(\)/u);
  assert.match(home, /readUserProfile\(signedInUserId\)/u);
  assert.match(home, /setMainTabHeaderProfileSnapshot\(nextChannel, true, expectedAuthority\)/u);
});

test("account-owned local operations bind synchronously and reject delayed A -> B completion", async () => {
  const accountA = {
    userId: "account-a",
    accountId: "account-a",
    sessionGeneration: "generation-a",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const accountB = {
    userId: "account-b",
    accountId: "account-b",
    sessionGeneration: "generation-b",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const storage = createBlockingMemoryStorage();
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: accountA.userId } } } }) },
    from: () => ({}),
  };
  const userData = loadStubbed("_lib/userData.ts", {
    "@react-native-async-storage/async-storage": { default: storage },
    "./accountScopedStorage": accountStorage,
    "./accountSessionAuthority": accountAuthority,
    "./accessVisibility": { normalizeAccessVisibility: (value) => value ?? "public" },
    "./officialAccounts": { getOfficialPlatformAccount: () => null },
    "./roomRules": {
      normalizeCapturePolicy: (value) => value,
      normalizeContentAccessRule: (value) => value,
      normalizeJoinPolicy: (value) => value,
      normalizeReactionsPolicy: (value) => value,
    },
    "./profileVisibility": { normalizeProfileVisibility: (value) => value ?? "everyone" },
    "./supabase": { supabase },
    "./usernameHandles": {
      formatUsernameHandle: (value) => String(value ?? ""),
      normalizeUsernameHandle: (value) => String(value ?? ""),
    },
  });

  accountAuthority.publishAccountSessionAuthoritySnapshot(accountA);
  const setBlocked = storage.blockNextSet();
  const pendingWrite = userData.saveLastPartySession({
    partyId: "party-a",
    titleId: "title-a",
    joinedAt: 10,
  });
  await setBlocked.reached;
  accountAuthority.publishAccountSessionAuthoritySnapshot(accountB);
  setBlocked.release();
  await assert.rejects(pendingWrite, /Account changed/u);
  assert.equal(
    storage.values.has(accountStorage.getAccountScopedStorageKey(userData.LAST_PARTY_KEY, accountB.userId)),
    false,
  );

  accountAuthority.publishAccountSessionAuthoritySnapshot(accountA);
  storage.values.set(
    accountStorage.getAccountScopedStorageKey(userData.LAST_PARTY_KEY, accountA.userId),
    JSON.stringify({ partyId: "party-a", titleId: "title-a", joinedAt: 10 }),
  );
  const getBlocked = storage.blockNextGet();
  const pendingRead = userData.readLastPartySession();
  await getBlocked.reached;
  accountAuthority.publishAccountSessionAuthoritySnapshot(accountB);
  getBlocked.release();
  await assert.rejects(pendingRead, /Account changed/u);
  accountAuthority.publishAccountSessionAuthoritySnapshot(null);

  const source = read("_lib/userData.ts");
  for (const entryPoint of [
    "saveLocalMyListIds",
    "readMyListIds",
    "toggleMyListTitle",
    "saveLocalWatchProgress",
    "readMergedWatchProgress",
    "writeProgressForTitle",
    "clearProgressForTitle",
    "readUserProfile",
    "saveUserProfile",
    "saveLastPartySession",
  ]) {
    const start = source.indexOf(`function ${entryPoint}`);
    assert.ok(start >= 0, `${entryPoint} remains present`);
    const body = source.slice(start, start + 1_800);
    assert.match(body, /captureUserDataAccountBinding\(\)/u, `${entryPoint} captures authority before async work`);
  }
  assert.doesNotMatch(source, /await getSignedInUserId\(\)/u);
  assert.match(source, /assertUserDataAccountBindingIsCurrent\(binding\)/u);
});

test("Watch-Party pin preferences cannot cross accounts, rooms, or stale generations", async () => {
  const accountA = {
    userId: "account-a", accountId: "account-a", sessionGeneration: "generation-a", state: "ACTIVE", restoreOnly: false,
  };
  const accountB = {
    userId: "account-b", accountId: "account-b", sessionGeneration: "generation-b", state: "ACTIVE", restoreOnly: false,
  };
  const storage = createBlockingMemoryStorage();
  const pinning = loadStubbed("_lib/watchPartyPinning.ts", {
    "@react-native-async-storage/async-storage": { default: storage },
    "./accountSessionAuthority": accountAuthority,
  });

  accountAuthority.publishAccountSessionAuthoritySnapshot(accountA);
  await pinning.saveWatchPartyLivePinnedParticipantId("party-one", "participant-a");
  assert.equal(await pinning.readWatchPartyLivePinnedParticipantId("party-one"), "participant-a");
  assert.equal(await pinning.readWatchPartyLivePinnedParticipantId("party-two"), "");

  accountAuthority.publishAccountSessionAuthoritySnapshot(accountB);
  assert.equal(await pinning.readWatchPartyLivePinnedParticipantId("party-one"), "");
  await pinning.saveWatchPartyLivePinnedParticipantId("party-one", "participant-b");

  accountAuthority.publishAccountSessionAuthoritySnapshot(accountA);
  assert.equal(await pinning.readWatchPartyLivePinnedParticipantId("party-one"), "participant-a");
  const blockedRead = storage.blockNextGet();
  const staleRead = pinning.readWatchPartyLivePinnedParticipantId("party-one");
  await blockedRead.reached;
  accountAuthority.publishAccountSessionAuthoritySnapshot(accountB);
  blockedRead.release();
  await assert.rejects(staleRead, /Account changed/u);
  accountAuthority.publishAccountSessionAuthoritySnapshot(null);

  const route = read("app/watch-party/[partyId].tsx");
  assert.match(route, /readWatchPartyLivePinnedParticipantId\(partyId\)/u);
  assert.match(route, /saveWatchPartyLivePinnedParticipantId\(partyId, nextParticipantId\)/u);
  assert.match(route, /clearWatchPartyLivePinnedParticipantId\(partyId\)/u);
  assert.match(route, /readWatchPartyLivePinCoachSeen\(partyId\)/u);
});

