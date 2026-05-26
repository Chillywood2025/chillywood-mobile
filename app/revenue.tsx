import { Redirect } from "expo-router";

export default function RevenueRedirect() {
  return <Redirect href="/channel-studio?tab=monetization&focus=balance" />;
}
