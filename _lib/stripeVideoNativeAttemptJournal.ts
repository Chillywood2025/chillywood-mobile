import AsyncStorage from "@react-native-async-storage/async-storage";
import { withStripeVideoAttempt } from "./stripeVideoAttemptJournal";

/** Native persistence adapter only. Does not admit a platform or start checkout. */
export const withNativeStripeVideoAttempt = <T>(buyerId: string, videoId: string, current: () => void,
  operation: Parameters<typeof withStripeVideoAttempt<T>>[4]) =>
  withStripeVideoAttempt(AsyncStorage, buyerId, videoId, current, operation);
