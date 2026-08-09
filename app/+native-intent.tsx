import { Platform } from "react-native";

import { redirectEarlyAndroidNativeCallSystemPath } from "../_lib/chillyChatNativeCallRouteBuffer";
import { sanitizeExternalIosNativeCallPath } from "../_lib/nativeCallTransitionProvenance.mjs";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (Platform.OS === "android") return redirectEarlyAndroidNativeCallSystemPath(path);
  if (Platform.OS === "ios") return sanitizeExternalIosNativeCallPath(path);
  return path;
}
