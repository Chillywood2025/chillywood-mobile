import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, contents) => fs.writeFileSync(path, contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");

const replaceOnce = (path, from, to) => {
  const source = read(path);
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${path}: expected source block was not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${path}: expected source block was not unique`);
  write(path, `${source.slice(0, first)}${to}${source.slice(first + from.length)}`);
};

const replaceAll = (path, from, to) => {
  const source = read(path);
  if (!source.includes(from)) throw new Error(`${path}: expected source text was not found: ${from}`);
  write(path, source.split(from).join(to));
};

const replaceSection = (path, startMarker, endMarker, replacement) => {
  const source = read(path);
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${path}: start marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${path}: end marker not found: ${endMarker}`);
  write(path, `${source.slice(0, start)}${replacement}${source.slice(end)}`);
};

const notificationsPath = "_lib/notifications.ts";

replaceOnce(
  notificationsPath,
  `export type PushPermissionState =\n  | "unsupported"\n  | "undetermined"\n  | "granted"\n  | "denied"\n  | "error";`,
  `export type PushPermissionState =\n  | "unsupported"\n  | "undetermined"\n  | "provisional"\n  | "ephemeral"\n  | "granted"\n  | "denied"\n  | "error";`,
);

replaceSection(
  notificationsPath,
  "export async function readPushPermissionState(): Promise<PushPermissionState> {",
  "const readExpoProjectId = () => {",
  `const readPushPermissionStateFromPermissions = (\n  permissions: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>,\n): PushPermissionState => {\n  const iosStatus = permissions.ios?.status;\n  if (iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL) return "provisional";\n  if (iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL) return "ephemeral";\n  if (permissions.granted || iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED) return "granted";\n  if (iosStatus === Notifications.IosAuthorizationStatus.DENIED) return "denied";\n  return permissions.canAskAgain ? "undetermined" : "denied";\n};\n\nconst isUsablePushPermissionState = (state: PushPermissionState) => (\n  state === "granted" || state === "provisional" || state === "ephemeral"\n);\n\nexport async function readPushPermissionState(): Promise<PushPermissionState> {\n  if (Platform.OS === "web") return "unsupported";\n  if (!Device.isDevice) return "unsupported";\n\n  try {\n    return readPushPermissionStateFromPermissions(await Notifications.getPermissionsAsync());\n  } catch {\n    return "error";\n  }\n}\n\n`,
);

replaceOnce(
  notificationsPath,
  `const NOTIFICATION_INSTALL_ID_STORAGE_KEY = "chillywood.notification.install_id.v1";`,
  `const NOTIFICATION_INSTALL_ID_STORAGE_KEY = "chillywood.notification.install_id.v1";\nexport const CHILLYWOOD_ACTIVITY_NOTIFICATION_CATEGORY_ID = "chillywood_activity";\nexport const CHILLYWOOD_INCOMING_CALL_NOTIFICATION_CATEGORY_ID = "chilly_chat_incoming_call";\nexport const CHILLYWOOD_MISSED_CALL_NOTIFICATION_CATEGORY_ID = "chilly_chat_missed_call";`,
);

replaceOnce(
  notificationsPath,
  `  });\n\n  if (Platform.OS === "android") {`,
  `  });\n\n  if (Platform.OS === "ios") {\n    await Promise.all([\n      Notifications.setNotificationCategoryAsync(CHILLYWOOD_ACTIVITY_NOTIFICATION_CATEGORY_ID, []),\n      Notifications.setNotificationCategoryAsync(CHILLYWOOD_INCOMING_CALL_NOTIFICATION_CATEGORY_ID, []),\n      Notifications.setNotificationCategoryAsync(CHILLYWOOD_MISSED_CALL_NOTIFICATION_CATEGORY_ID, []),\n    ]);\n  }\n\n  if (Platform.OS === "android") {`,
);

replaceSection(
  notificationsPath,
  "export async function readCurrentPushRegistration(): Promise<PushRegistrationState> {",
  "async function registerPushTokenWithBackend(input: {",
  `export async function readCurrentPushRegistration(): Promise<PushRegistrationState> {\n  if (Platform.OS === "web" || !Device.isDevice) {\n    return buildUnsupportedPushRegistration("Push notifications require a physical mobile device.");\n  }\n\n  await configureNotificationRuntime();\n  const permissionState = await readPushPermissionState();\n  const platformLabel = Platform.OS === "ios" ? "iOS" : "Android";\n\n  if (permissionState === "denied") {\n    return {\n      message: \`Device push notifications are off in ${platformLabel} settings. In-app Activity is tied to your account and still works in the app.\`,\n      permissionState,\n      provider: "expo",\n      status: "denied",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n\n  if (permissionState === "error") {\n    return {\n      message: \`Unable to verify ${platformLabel} notification permission. In-app Activity is tied to your account and still works in the app.\`,\n      permissionState,\n      provider: "expo",\n      status: "error",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n\n  if (!isUsablePushPermissionState(permissionState)) {\n    return {\n      message: "Device push registration is not set up yet. In-app Activity is tied to your account and still works in the app.",\n      permissionState,\n      provider: "expo",\n      status: "not_registered",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n\n  const installId = await getNotificationInstallId();\n  const [expoStatus, fcmStatus] = await Promise.all([\n    readPushRegistrationStatus({ installId, permissionState, provider: "expo" }),\n    Platform.OS === "android"\n      ? readPushRegistrationStatus({ installId, permissionState, provider: "fcm" })\n      : Promise.resolve({ registered: false, status: "not_registered" as const, tokenFingerprint: null }),\n  ]);\n\n  if (expoStatus.status === "error" && (Platform.OS !== "android" || fcmStatus.status === "error")) {\n    return {\n      message: "Unable to verify this device push registration. In-app Activity is tied to your account and still works in the app.",\n      permissionState,\n      provider: "expo",\n      status: "error",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n\n  if (expoStatus.registered || fcmStatus.registered) {\n    const provisionalLabel = permissionState === "provisional" || permissionState === "ephemeral"\n      ? " with provisional permission"\n      : "";\n    return {\n      message: Platform.OS === "android" && fcmStatus.registered\n        ? "This Android device is registered for Chi'llywood push alerts and native Chi'lly Chat call alerts."\n        : \`This ${platformLabel} device is registered for Chi'llywood push alerts${provisionalLabel}.\`,\n      permissionState,\n      provider: fcmStatus.registered ? "expo+fcm" : "expo",\n      status: "registered",\n      tokenFingerprint: expoStatus.tokenFingerprint,\n      nativeTokenFingerprint: fcmStatus.tokenFingerprint,\n    };\n  }\n\n  return {\n    message: \`Notifications are allowed on this ${platformLabel} device, but this install is not registered for push alerts.\`,\n    permissionState,\n    provider: "expo",\n    status: "not_registered",\n    tokenFingerprint: null,\n    nativeTokenFingerprint: null,\n  };\n}\n\n`,
);

replaceOnce(
  notificationsPath,
  `        nativeCallStyle: input.provider === "fcm",`,
  `        nativeCallStyle: Platform.OS === "android" && input.provider === "fcm",`,
);

replaceOnce(
  notificationsPath,
  `    message: input.provider === "fcm"\n      ? "This Android device is registered for native Chi'lly Chat call alerts."\n      : "This Android device is registered for Chi'llywood notifications.",`,
  `    message: input.provider === "fcm"\n      ? "This Android device is registered for native Chi'lly Chat call alerts."\n      : \`This ${Platform.OS === "ios" ? "iOS" : "Android"} device is registered for Chi'llywood notifications.\`,`,
);

replaceSection(
  notificationsPath,
  "export async function requestAndroidPushPermissionAndRegister(): Promise<PushRegistrationState> {",
  "export async function refreshAndroidPushRegistrationIfGranted(): Promise<PushRegistrationState> {",
  `export async function requestPushPermissionAndRegister(): Promise<PushRegistrationState> {\n  if (Platform.OS === "web" || !Device.isDevice) {\n    return buildUnsupportedPushRegistration("Push notifications require a physical mobile device.");\n  }\n\n  await configureNotificationRuntime();\n  const current = await Notifications.getPermissionsAsync();\n  const currentState = readPushPermissionStateFromPermissions(current);\n  const finalPermission = isUsablePushPermissionState(currentState)\n    ? current\n    : Platform.OS === "ios"\n      ? await Notifications.requestPermissionsAsync({\n          ios: { allowAlert: true, allowBadge: true, allowSound: true },\n        })\n      : await Notifications.requestPermissionsAsync();\n  const permissionState = readPushPermissionStateFromPermissions(finalPermission);\n\n  if (!isUsablePushPermissionState(permissionState)) {\n    return {\n      message: \`Notifications are off for this device. Chi'llywood still works; enable notifications in ${Platform.OS === "ios" ? "iOS" : "Android"} settings when you want alerts.\`,\n      permissionState,\n      provider: "expo",\n      status: permissionState === "denied" ? "denied" : "not_registered",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n\n  const projectId = readExpoProjectId();\n  if (!projectId) {\n    return {\n      message: "Expo project id is missing from this build, so push token registration cannot complete.",\n      permissionState,\n      provider: "expo",\n      status: "blocked",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n\n  try {\n    const token = await Notifications.getExpoPushTokenAsync({ projectId });\n    const rawToken = normalizeText(token.data);\n    if (!rawToken) throw new Error("Expo returned an empty push token.");\n    const expoResult = await registerPushTokenWithBackend({ permissionStatus: permissionState, provider: "expo", token: rawToken });\n    const nativeResult = await registerAndroidNativeFcmToken(permissionState);\n    return mergeAndroidPushRegistrationResults(expoResult, nativeResult);\n  } catch {\n    return {\n      message: \`Unable to get a production push token for this ${Platform.OS === "ios" ? "iOS" : "Android"} build.\`,\n      permissionState,\n      provider: "expo",\n      status: "error",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n}\n\n/** @deprecated Use requestPushPermissionAndRegister. */\nexport const requestAndroidPushPermissionAndRegister = requestPushPermissionAndRegister;\n\n`,
);

replaceSection(
  notificationsPath,
  "export async function refreshAndroidPushRegistrationIfGranted(): Promise<PushRegistrationState> {",
  "export async function revokeCurrentPushInstall(): Promise<PushRegistrationState> {",
  `export async function refreshPushRegistrationIfGranted(): Promise<PushRegistrationState> {\n  if (Platform.OS === "web" || !Device.isDevice) {\n    return buildUnsupportedPushRegistration("Push notifications require a physical mobile device.");\n  }\n\n  await configureNotificationRuntime();\n  const current = await Notifications.getPermissionsAsync();\n  const permissionState = readPushPermissionStateFromPermissions(current);\n  if (!isUsablePushPermissionState(permissionState)) {\n    return {\n      message: "Notifications are not enabled for this device.",\n      permissionState,\n      provider: "expo",\n      status: permissionState === "denied" ? "denied" : "not_registered",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n\n  const projectId = readExpoProjectId();\n  if (!projectId) {\n    return {\n      message: "Expo project id is missing from this build, so push token registration cannot complete.",\n      permissionState,\n      provider: "expo",\n      status: "blocked",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n\n  try {\n    const token = await Notifications.getExpoPushTokenAsync({ projectId });\n    const rawToken = normalizeText(token.data);\n    if (!rawToken) throw new Error("Expo returned an empty push token.");\n    const expoResult = await registerPushTokenWithBackend({ permissionStatus: permissionState, provider: "expo", token: rawToken });\n    const nativeResult = await registerAndroidNativeFcmToken(permissionState);\n    return mergeAndroidPushRegistrationResults(expoResult, nativeResult);\n  } catch {\n    return {\n      message: \`Unable to refresh the production push token for this ${Platform.OS === "ios" ? "iOS" : "Android"} build.\`,\n      permissionState,\n      provider: "expo",\n      status: "error",\n      tokenFingerprint: null,\n      nativeTokenFingerprint: null,\n    };\n  }\n}\n\n/** @deprecated Use refreshPushRegistrationIfGranted. */\nexport const refreshAndroidPushRegistrationIfGranted = refreshPushRegistrationIfGranted;\n\n`,
);

replaceOnce(
  notificationsPath,
  `    onPath(path);\n    Notifications.clearLastNotificationResponseAsync().catch(() => null);`,
  `    onPath(path);\n    if (Platform.OS === "ios") Notifications.setBadgeCountAsync(0).catch(() => false);\n    Notifications.clearLastNotificationResponseAsync().catch(() => null);`,
);

replaceAll("app/_layout.tsx", "refreshAndroidPushRegistrationIfGranted", "refreshPushRegistrationIfGranted");
replaceAll("app/settings.tsx", "requestAndroidPushPermissionAndRegister", "requestPushPermissionAndRegister");
replaceAll("app/chat/[threadId].tsx", "requestAndroidPushPermissionAndRegister", "requestPushPermissionAndRegister");
replaceAll(
  "app/settings.tsx",
  `import { Alert, ActivityIndicator, Image, ImageBackground, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, Vibration, View } from "react-native";`,
  `import { Alert, ActivityIndicator, Image, ImageBackground, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, Vibration, View } from "react-native";`,
);
replaceAll("app/settings.tsx", "Allow this device to receive Android push notifications.", "Allow this device to receive push notifications.");
replaceAll(
  "app/settings.tsx",
  "Sound could not play. Check media volume, notification volume, or Android sound settings.",
  "Sound could not play. Check media volume and notification sound settings.",
);
replaceAll(
  "app/chat/[threadId].tsx",
  "Delivery status: push sent. The receiver was sent an Android call notification.",
  "Delivery status: push sent. The receiver was sent a call notification.",
);

const notificationDispatchPath = "supabase/functions/notification-dispatch/index.ts";
replaceOnce(
  notificationDispatchPath,
  `type PushToken = {\n  id: string;\n  provider: string;\n  token: string;\n  token_fingerprint: string;\n};`,
  `type PushToken = {\n  id: string;\n  platform: "android" | "ios";\n  provider: string;\n  token: string;\n  token_fingerprint: string;\n};`,
);
replaceOnce(
  notificationDispatchPath,
  `const ANDROID_NOTIFICATION_CHANNEL_ID = "default";`,
  `const ANDROID_NOTIFICATION_CHANNEL_ID = "default";\nconst IOS_ACTIVITY_CATEGORY_ID = "chillywood_activity";`,
);
replaceSection(
  notificationDispatchPath,
  "async function readPushTokens(adminClient: SupabaseClientLike, userId: string) {",
  "async function insertDeliveryAttempt",
  `async function readPushTokens(adminClient: SupabaseClientLike, userId: string) {\n  const { data } = await adminClient\n    .from("user_push_tokens")\n    .select("id,platform,provider,token,token_fingerprint")\n    .eq("user_id", userId)\n    .in("platform", ["android", "ios"])\n    .eq("enabled", true)\n    .is("revoked_at", null)\n    .order("last_seen_at", { ascending: false })\n    .limit(10);\n\n  return (data ?? []) as PushToken[];\n}\n\n`,
);
replaceAll(notificationDispatchPath, "no_enabled_android_token", "no_enabled_push_token");
replaceOnce(
  notificationDispatchPath,
  `    const pushResult = await sendExpoPush({\n      body: copy.body,\n      channelId: ANDROID_NOTIFICATION_CHANNEL_ID,\n      data: {\n        notificationId,\n        path: input.target.deepLink.replace(/^chillywoodmobile:\\/\\//u, "/"),\n        triggerType: input.triggerType,\n      },\n      priority: "high",\n      sound: "default",\n      title: copy.title,\n      to: token.token,\n    });`,
  `    const pushMessage: JsonObject = {\n      body: copy.body,\n      data: {\n        notificationId,\n        path: input.target.deepLink.replace(/^chillywoodmobile:\\/\\//u, "/"),\n        triggerType: input.triggerType,\n      },\n      priority: "high",\n      sound: "default",\n      title: copy.title,\n      to: token.token,\n    };\n    if (token.platform === "android") {\n      pushMessage.channelId = ANDROID_NOTIFICATION_CHANNEL_ID;\n    } else {\n      pushMessage.badge = 1;\n      pushMessage.categoryId = IOS_ACTIVITY_CATEGORY_ID;\n    }\n    const pushResult = await sendExpoPush(pushMessage);`,
);

const callDispatchPath = "supabase/functions/chilly-chat-call-dispatch/index.ts";
replaceOnce(
  callDispatchPath,
  `type PushToken = {\n  id: string;\n  provider: string;\n  token: string;\n  token_fingerprint: string;\n};`,
  `type PushToken = {\n  id: string;\n  platform: "android" | "ios";\n  provider: string;\n  token: string;\n  token_fingerprint: string;\n};`,
);
replaceSection(
  callDispatchPath,
  "async function readPushTokens(adminClient: SupabaseClientLike, userId: string) {",
  "async function revokePushToken",
  `async function readPushTokens(adminClient: SupabaseClientLike, userId: string) {\n  const { data } = await adminClient\n    .from("user_push_tokens")\n    .select("id,platform,provider,token,token_fingerprint")\n    .eq("user_id", userId)\n    .in("platform", ["android", "ios"])\n    .eq("enabled", true)\n    .is("revoked_at", null)\n    .order("last_seen_at", { ascending: false })\n    .limit(10);\n\n  return (data ?? []) as PushToken[];\n}\n\n`,
);
replaceAll(callDispatchPath, "no_enabled_android_token", "no_enabled_push_token");
replaceOnce(
  callDispatchPath,
  `  const fcmTokens = tokens.filter((token) => token.provider === "fcm");\n  const expoTokens = tokens.filter((token) => token.provider === "expo");`,
  `  const fcmTokens = tokens.filter((token) => token.platform === "android" && token.provider === "fcm");\n  const expoTokens = tokens.filter((token) => token.provider === "expo");`,
);
replaceOnce(
  callDispatchPath,
  `  let nativeSentCount = 0;\n  let expoSentCount = 0;\n  let lastFailureReason = "";`,
  `  let nativeSentCount = 0;\n  let expoSentCount = 0;\n  let iosVisibleSentCount = 0;\n  let lastFailureReason = "";`,
);
replaceOnce(
  callDispatchPath,
  `    if (input.action === "missed") {\n      pushMessage.body = copy.body;\n      pushMessage.channelId = channelId;\n      pushMessage.sound = "default";\n      pushMessage.title = copy.title;\n    }`,
  `    const visibleIosCall = token.platform === "ios";\n    if (input.action === "missed" || visibleIosCall) {\n      pushMessage.body = copy.body;\n      pushMessage.sound = "default";\n      pushMessage.title = copy.title;\n    }\n    if (token.platform === "android" && input.action === "missed") {\n      pushMessage.channelId = channelId;\n    }\n    if (visibleIosCall) {\n      pushMessage.badge = 1;\n      pushMessage.categoryId = input.action === "missed" ? "chilly_chat_missed_call" : "chilly_chat_incoming_call";\n    }`,
);
replaceOnce(
  callDispatchPath,
  `    if (sent) expoSentCount += 1;`,
  `    if (sent) {\n      expoSentCount += 1;\n      if (token.platform === "ios") iosVisibleSentCount += 1;\n    }`,
);
replaceOnce(
  callDispatchPath,
  `    const delivered = input.action === "incoming" ? nativeSentCount > 0 : expoSentCount > 0;`,
  `    const delivered = input.action === "incoming"\n      ? nativeSentCount > 0 || iosVisibleSentCount > 0\n      : expoSentCount > 0;`,
);
replaceOnce(
  callDispatchPath,
  `  const deliveredCount = input.action === "incoming" ? nativeSentCount : expoSentCount;\n  const expoFallbackOnly = input.action === "incoming" && nativeSentCount === 0 && expoSentCount > 0;`,
  `  const deliveredCount = input.action === "incoming"\n    ? nativeSentCount + iosVisibleSentCount\n    : expoSentCount;\n  const expoFallbackOnly = input.action === "incoming" && nativeSentCount === 0 && iosVisibleSentCount > 0;`,
);

const revenueCatPath = "supabase/functions/revenuecat-webhook/index.ts";
replaceOnce(
  revenueCatPath,
  `type PushToken = {\n  id: string;\n  provider: string;\n  token: string;\n};`,
  `type PushToken = {\n  id: string;\n  platform: "android" | "ios";\n  provider: string;\n  token: string;\n};`,
);
replaceSection(
  revenueCatPath,
  "const readAndroidPushTokens = async",
  "const insertMoneyNotificationDeliveryAttempt",
  `const readPushTokens = async (adminClient: SupabaseClientLike, userId: string): Promise<PushToken[]> => {\n  const { data } = await adminClient\n    .from("user_push_tokens")\n    .select("id,platform,provider,token")\n    .eq("user_id", userId)\n    .in("platform", ["android", "ios"])\n    .eq("enabled", true)\n    .is("revoked_at", null)\n    .order("last_seen_at", { ascending: false })\n    .limit(10);\n  return (data ?? []) as PushToken[];\n};\n\n`,
);
replaceAll(revenueCatPath, "readAndroidPushTokens", "readPushTokens");
replaceAll(revenueCatPath, "no_enabled_android_token", "no_enabled_push_token");
replaceOnce(
  revenueCatPath,
  `    const pushResult = await sendCreatorMoneyExpoPush({\n      body: input.plan.body,\n      channelId: ANDROID_NOTIFICATION_CHANNEL_ID,\n      data: {\n        category: input.plan.category,\n        deepLink: input.target.deepLink,\n        notificationId: input.notificationId,\n        notificationType: input.plan.notificationType,\n        path: notificationRoutePath(input.target.deepLink),\n        triggerType: input.plan.notificationType,\n      },\n      priority: "high",\n      sound: "default",\n      title: input.plan.title,\n      to: token.token,\n    });`,
  `    const pushMessage: Record<string, unknown> = {\n      body: input.plan.body,\n      data: {\n        category: input.plan.category,\n        deepLink: input.target.deepLink,\n        notificationId: input.notificationId,\n        notificationType: input.plan.notificationType,\n        path: notificationRoutePath(input.target.deepLink),\n        triggerType: input.plan.notificationType,\n      },\n      priority: "high",\n      sound: "default",\n      title: input.plan.title,\n      to: token.token,\n    };\n    if (token.platform === "android") {\n      pushMessage.channelId = ANDROID_NOTIFICATION_CHANNEL_ID;\n    } else {\n      pushMessage.badge = 1;\n      pushMessage.categoryId = "chillywood_activity";\n    }\n    const pushResult = await sendCreatorMoneyExpoPush(pushMessage);`,
);

write("scripts/guard-ios-push-policy.mjs", `import fs from "node:fs";\n\nconst read = (path) => fs.readFileSync(path, "utf8");\nconst requireText = (path, text) => {\n  const source = read(path);\n  if (!source.includes(text)) throw new Error(\`${path} is missing required iOS push policy text: ${text}\`);\n};\nconst rejectText = (path, text) => {\n  const source = read(path);\n  if (source.includes(text)) throw new Error(\`${path} still contains blocked Android-only push text: ${text}\`);\n};\n\nrequireText("_lib/notifications.ts", "requestPushPermissionAndRegister");\nrequireText("_lib/notifications.ts", "refreshPushRegistrationIfGranted");\nrequireText("_lib/notifications.ts", "IosAuthorizationStatus.PROVISIONAL");\nrequireText("_lib/notifications.ts", "platform: Platform.OS");\nrejectText("_lib/notifications.ts", "iOS/APNs remains later");\nrequireText("supabase/functions/notification-dispatch/index.ts", '.in("platform", ["android", "ios"])');\nrequireText("supabase/functions/notification-dispatch/index.ts", 'token.platform === "android"');\nrequireText("supabase/functions/chilly-chat-call-dispatch/index.ts", 'token.platform === "ios"');\nrequireText("supabase/functions/revenuecat-webhook/index.ts", '.select("id,platform,provider,token")');\nrequireText("app/settings.tsx", "Allow this device to receive push notifications.");\nrejectText("app/settings.tsx", "Allow this device to receive Android push notifications.");\n\nconsole.log("iOS push policy guard passed.");\n`);

write("scripts/proof-ios-push-source.mjs", `import fs from "node:fs";\n\nconst files = [\n  "_lib/notifications.ts",\n  "app/_layout.tsx",\n  "app/settings.tsx",\n  "supabase/functions/notification-dispatch/index.ts",\n  "supabase/functions/chilly-chat-call-dispatch/index.ts",\n  "supabase/functions/revenuecat-webhook/index.ts",\n];\nconst summary = Object.fromEntries(files.map((path) => [path, fs.statSync(path).size]));\nif (!fs.readFileSync("_lib/notifications.ts", "utf8").includes("requestAndroidPushPermissionAndRegister = requestPushPermissionAndRegister")) {\n  throw new Error("Backward-compatible Android push alias is missing.");\n}\nif (!fs.readFileSync("_lib/notifications.ts", "utf8").includes("refreshAndroidPushRegistrationIfGranted = refreshPushRegistrationIfGranted")) {\n  throw new Error("Backward-compatible Android refresh alias is missing.");\n}\nconsole.log(JSON.stringify({ status: "source_ready_physical_delivery_pending", files: summary }, null, 2));\n`);

const packageJson = JSON.parse(read("package.json"));
packageJson.scripts["guard:ios-push-policy"] = "node ./scripts/guard-ios-push-policy.mjs";
packageJson.scripts["proof:ios-push-source"] = "node ./scripts/proof-ios-push-source.mjs";
write("package.json", JSON.stringify(packageJson, null, 2));

replaceOnce(
  ".github/workflows/phase1-ci.yml",
  `            command: npm run guard:ios-config-policy && npm run proof:ios-config`,
  `            command: npm run guard:ios-config-policy && npm run proof:ios-config && npm run guard:ios-push-policy && npm run proof:ios-push-source`,
);

console.log("Applied platform-neutral iOS push source patch.");
