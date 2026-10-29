import { useLocalSearchParams } from "expo-router";
import { MerchOrdersScreen } from "../../components/merch/merch-screens";
export default function MerchOrdersRoute() { const { orderId } = useLocalSearchParams<{ orderId?: string }>(); return <MerchOrdersScreen orderId={typeof orderId === "string" ? orderId : undefined} />; }
