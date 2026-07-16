export const CHILLY_CHAT_CALL_CHANNEL_KEYS = [
  "androidNative",
  "iosVoip",
  "ordinaryPush",
  "inAppNotification",
] as const;

export type ChillyChatCallDeliveryStatus =
  | "sent"
  | "created"
  | "skipped"
  | "failed"
  | "blocked"
  | "disabled"
  | "unknown";

export type ChillyCallChannelResult = {
  eligible: boolean;
  attempted: boolean;
  notificationCreated: boolean;
  pushSent: boolean;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  reason: string;
  status: ChillyChatCallDeliveryStatus;
};

export type ChillyChatCallDispatchChannelSet = {
  androidNative: ChillyCallChannelResult;
  iosVoip: ChillyCallChannelResult;
  ordinaryPush: ChillyCallChannelResult;
  inAppNotification: ChillyCallChannelResult;
};

export type ChillyChatCallDispatchResult = {
  notificationCreated: boolean;
  pushSent: boolean;
  reason: string;
  status: ChillyChatCallDeliveryStatus;
};

export type ChillyChatCallDispatchResponse = {
  eligible: boolean;
  result: ChillyChatCallDispatchResult;
  channels: ChillyChatCallDispatchChannelSet;
};

const STATUS_VALUES = new Set<ChillyChatCallDeliveryStatus>([
  "sent",
  "created",
  "skipped",
  "failed",
  "blocked",
  "disabled",
  "unknown",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const readBoolean = (record: Record<string, unknown>, key: string) => {
  if (typeof record[key] !== "boolean") throw new Error(`dispatch_schema_${key}_boolean_required`);
  return record[key] as boolean;
};

const readCount = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`dispatch_schema_${key}_count_required`);
  }
  return value;
};

const readText = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`dispatch_schema_${key}_text_required`);
  return value.trim();
};

const readStatus = (record: Record<string, unknown>, key: string): ChillyChatCallDeliveryStatus => {
  const value = readText(record, key).toLowerCase() as ChillyChatCallDeliveryStatus;
  if (!STATUS_VALUES.has(value)) throw new Error(`dispatch_schema_${key}_status_invalid`);
  return value;
};

const parseChannel = (value: unknown, key: string): ChillyCallChannelResult => {
  if (!isRecord(value)) throw new Error(`dispatch_schema_${key}_channel_required`);
  return {
    eligible: readBoolean(value, "eligible"),
    attempted: readBoolean(value, "attempted"),
    notificationCreated: readBoolean(value, "notificationCreated"),
    pushSent: readBoolean(value, "pushSent"),
    sentCount: readCount(value, "sentCount"),
    failedCount: readCount(value, "failedCount"),
    skippedCount: readCount(value, "skippedCount"),
    reason: readText(value, "reason"),
    status: readStatus(value, "status"),
  };
};

export const parseChillyChatCallDispatchResponse = (value: unknown): ChillyChatCallDispatchResponse => {
  if (!isRecord(value)) throw new Error("dispatch_schema_response_object_required");
  if (!isRecord(value.result)) throw new Error("dispatch_schema_result_required");
  if (!isRecord(value.channels)) throw new Error("dispatch_schema_channels_required");

  const result = value.result;
  const channels = value.channels;
  const parsed: ChillyChatCallDispatchResponse = {
    eligible: readBoolean(value, "eligible"),
    result: {
      notificationCreated: readBoolean(result, "notificationCreated"),
      pushSent: readBoolean(result, "pushSent"),
      reason: readText(result, "reason"),
      status: readStatus(result, "status"),
    },
    channels: {
      androidNative: parseChannel(channels.androidNative, "androidNative"),
      iosVoip: parseChannel(channels.iosVoip, "iosVoip"),
      ordinaryPush: parseChannel(channels.ordinaryPush, "ordinaryPush"),
      inAppNotification: parseChannel(channels.inAppNotification, "inAppNotification"),
    },
  };

  const remotePushSent = parsed.channels.androidNative.pushSent
    || parsed.channels.iosVoip.pushSent
    || parsed.channels.ordinaryPush.pushSent;
  if (parsed.result.pushSent !== remotePushSent) {
    throw new Error("dispatch_schema_push_sent_channel_mismatch");
  }
  if (parsed.result.notificationCreated !== parsed.channels.inAppNotification.notificationCreated) {
    throw new Error("dispatch_schema_notification_created_channel_mismatch");
  }
  return parsed;
};

const failedChannel = (reason: string): ChillyCallChannelResult => ({
  eligible: false,
  attempted: false,
  notificationCreated: false,
  pushSent: false,
  sentCount: 0,
  failedCount: 0,
  skippedCount: 0,
  reason,
  status: "unknown",
});

export const normalizeChillyChatCallDispatchResponse = (value: unknown): ChillyChatCallDispatchResponse => {
  try {
    return parseChillyChatCallDispatchResponse(value);
  } catch {
    const reason = "invalid_dispatch_response_schema";
    return {
      eligible: false,
      result: {
        notificationCreated: false,
        pushSent: false,
        reason,
        status: "unknown",
      },
      channels: {
        androidNative: failedChannel(reason),
        iosVoip: failedChannel(reason),
        ordinaryPush: failedChannel(reason),
        inAppNotification: failedChannel(reason),
      },
    };
  }
};
