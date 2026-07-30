import { Platform } from "react-native";

import { redirectEarlyAndroidNativeCallSystemPath } from "../_lib/chillyChatNativeCallRouteBuffer";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (Platform.OS !== "android") return path;
  return redirectEarlyAndroidNativeCallSystemPath(path);
}
