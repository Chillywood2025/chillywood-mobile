import { Redirect } from "expo-router";

export default function MonetizeRedirect() {
  return <Redirect href="/channel-studio?tab=monetization&focus=overview" />;
}
