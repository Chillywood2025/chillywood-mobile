import { useLocalSearchParams } from "expo-router";
import { MerchShopScreen } from "../../components/merch/merch-screens";
export default function MerchShopRoute() { const { creatorId } = useLocalSearchParams<{ creatorId: string }>(); return <MerchShopScreen creatorId={typeof creatorId === "string" ? creatorId : ""} />; }
