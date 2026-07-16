export const CHILLY_CHAT_CALL_CHANNEL_KEYS = [
  "androidNative",
  "iosVoip",
  "ordinaryPush",
  "inAppNotification",
];

const REMOTE_CHANNEL_KEYS = ["androidNative", "iosVoip", "ordinaryPush"];
const TERMINAL_ACTIONS = new Set(["cancel", "declined", "end", "timeout"]);

const toText = (value) => String(value ?? "").trim();

export const isChillyChatTerminalAction = (action) => TERMINAL_ACTIONS.has(toText(action).toLowerCase());

export const createChillyChatCallChannelResult = (overrides = {}) => ({
  eligible: false,
  attempted: false,
  notificationCreated: false,
  pushSent: false,
  sentCount: 0,
  failedCount: 0,
  skippedCount: 0,
  reason: "not_required",
  status: "skipped",
  ...overrides,
});

export const summarizeChillyChatCallDispatch = (eligible, channels, blockedReason = "") => {
  const remoteChannels = REMOTE_CHANNEL_KEYS.map((key) => channels[key]);
  const pushSent = remoteChannels.some((channel) => channel.pushSent === true);
  const notificationCreated = channels.inAppNotification.notificationCreated === true;
  const failed = remoteChannels.some((channel) => channel.attempted === true && channel.failedCount > 0);
  const disabled = remoteChannels.some((channel) => channel.status === "disabled");
  const status = !eligible
    ? "blocked"
    : pushSent
      ? "sent"
      : notificationCreated
        ? "created"
        : failed
          ? "failed"
          : disabled
            ? "disabled"
            : "skipped";
  const reason = toText(blockedReason)
    || (pushSent ? "sent" : "")
    || (notificationCreated ? "notification_created" : "")
    || remoteChannels.find((channel) => channel.attempted && channel.failedCount > 0)?.reason
    || remoteChannels.find((channel) => channel.status === "disabled")?.reason
    || remoteChannels.find((channel) => channel.reason !== "not_required")?.reason
    || channels.inAppNotification.reason
    || "no_delivery_channel";
  return {
    eligible: eligible === true,
    result: {
      notificationCreated,
      pushSent,
      reason,
      status,
    },
    channels,
  };
};

export const buildBlockedChillyChatCallDispatch = (reason) => {
  const blocked = createChillyChatCallChannelResult({ reason, status: "blocked" });
  return summarizeChillyChatCallDispatch(false, {
    androidNative: { ...blocked },
    iosVoip: { ...blocked },
    ordinaryPush: { ...blocked },
    inAppNotification: { ...blocked },
  }, reason);
};

export const resolveChillyChatCallPreferencePolicy = (input) => {
  const action = toText(input.action).toLowerCase();
  const callEnabled = input.chillyChatCallsEnabled !== false;
  const ordinaryPush = callEnabled && input.pushEnabled !== false;
  const presentationAction = action === "incoming" || action === "missed";
  return {
    callEnabled,
    inAppNotification: callEnabled && presentationAction && input.inAppEnabled !== false,
    iosVoip: callEnabled && (action === "incoming" || isChillyChatTerminalAction(action)),
    ordinaryPush,
  };
};

export const buildChillyChatCallPresentationCopy = (input) => {
  const action = toText(input.action).toLowerCase();
  const callLabel = toText(input.callType).toLowerCase() === "voice" ? "voice" : "video";
  const callerName = toText(input.callerName);
  if (action === "missed") {
    return {
      title: `Missed Chi'lly Chat ${callLabel} call`,
      body: callerName ? `You missed a ${callLabel} call from ${callerName}.` : `You missed a Chi'lly Chat ${callLabel} call.`,
    };
  }
  if (action !== "incoming") return null;
  return {
    title: `Incoming Chi'lly Chat ${callLabel} call`,
    body: callerName ? `${callerName} is calling you on Chi'lly Chat.` : `Incoming Chi'lly Chat ${callLabel} call.`,
  };
};

export const buildChillyChatNativeActionData = (input) => {
  const action = toText(input.action).toLowerCase();
  const callInviteId = toText(input.callInviteId);
  const threadId = toText(input.threadId);
  const callType = toText(input.callType).toLowerCase() === "voice" ? "voice" : "video";
  const expiresAt = toText(input.expiresAt);
  if (!callInviteId || !threadId || !expiresAt) throw new Error("invalid_native_call_action_scope");
  const data = {
    action,
    callUuid: callInviteId,
    callInviteId,
    callType,
    callerName: toText(input.callerName),
    expiresAt,
    nativeActionId: `${callInviteId}:${action}`,
    notificationId: toText(input.notificationId),
    openCall: action === "incoming" ? "true" : "false",
    path: toText(input.path),
    threadId,
  };
  const copy = buildChillyChatCallPresentationCopy(input);
  if (copy) {
    Object.assign(data, {
      body: copy.body,
      notificationCategory: action === "missed" ? "chilly_chat_missed_call" : "chilly_chat_call",
      notificationChannelId: toText(input.notificationChannelId),
      title: copy.title,
    });
  }
  if (action === "incoming") Object.assign(data, { nativeCallStyle: "android_callstyle" });
  if (isChillyChatTerminalAction(action)) {
    Object.assign(data, { dismissCall: "true", nativeCallStyle: "terminal" });
  }
  return data;
};
