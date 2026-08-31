import { ChannelStudioScreen } from "../channel-settings";

/**
 * Preferred Platform Studio route.
 *
 * Keep the implementation behind a real React component boundary. Calling the
 * screen as a plain function attaches all of its hooks to this wrapper and can
 * change the wrapper's hook count while auth, Premium, and provider state are
 * resolving.
 */
export default function PlatformStudioRoute() {
  return <ChannelStudioScreen />;
}
