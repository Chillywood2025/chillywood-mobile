export type MediaPermissionState =
  | "denied"
  | "granted"
  | "restricted"
  | "undetermined";

export type MediaPermissionSnapshot = {
  canAskAgain: boolean;
  shouldOpenSettings: boolean;
  state: MediaPermissionState;
};

export type MediaPermissionKind = "camera" | "microphone";

export type MediaPermissionLike = {
  canAskAgain?: boolean | null;
  granted?: boolean | null;
  status?: string | null;
};

export const UNDETERMINED_MEDIA_PERMISSION: MediaPermissionSnapshot = {
  canAskAgain: true,
  shouldOpenSettings: false,
  state: "undetermined",
};

export const resolveMediaPermission = (
  permission?: MediaPermissionLike | null,
): MediaPermissionSnapshot => {
  if (!permission) return UNDETERMINED_MEDIA_PERMISSION;

  const status = String(permission.status ?? "").trim().toLowerCase();
  if (permission.granted === true || status === "granted") {
    return {
      canAskAgain: false,
      shouldOpenSettings: false,
      state: "granted",
    };
  }

  if (status === "restricted") {
    return {
      canAskAgain: false,
      shouldOpenSettings: true,
      state: "restricted",
    };
  }

  if (status === "undetermined") return UNDETERMINED_MEDIA_PERMISSION;

  const canAskAgain = permission.canAskAgain !== false;
  return {
    canAskAgain,
    shouldOpenSettings: !canAskAgain,
    state: "denied",
  };
};

export const getMediaPermissionRecoveryMessage = (
  kind: MediaPermissionKind,
  permission: MediaPermissionSnapshot,
) => {
  const label = kind === "camera" ? "Camera" : "Microphone";

  if (permission.state === "granted") return null;
  if (permission.state === "restricted") {
    return `${label} access is restricted by this device. Review Screen Time or device-management settings.`;
  }
  if (permission.state === "denied" && permission.shouldOpenSettings) {
    return `${label} access is off. Open Settings, allow access for Chi'llywood, then return to the call.`;
  }
  if (permission.state === "denied") {
    return `${label} access was denied. Turn it on when you choose to publish ${kind === "camera" ? "video" : "audio"}.`;
  }
  return `${label} access will be requested only when you choose to publish ${kind === "camera" ? "video" : "audio"}.`;
};
