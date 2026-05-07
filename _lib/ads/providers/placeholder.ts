import {
  createAdProviderResult,
  DISCONNECTED_PLACEHOLDER_AD_STATUS,
  type AdProvider,
} from "../adProvider";

export const placeholderAdProvider: AdProvider = {
  provider: "placeholder",
  isConnected: false,
  getStatus: () => DISCONNECTED_PLACEHOLDER_AD_STATUS,
  loadNativeAd: async () => createAdProviderResult({
    providerStatus: DISCONNECTED_PLACEHOLDER_AD_STATUS,
    placementKind: "native_feed",
    loaded: false,
    shown: false,
    message: "Placeholder native/feed ad provider is not connected. No real ad was loaded.",
  }),
  showInterstitial: async () => createAdProviderResult({
    providerStatus: DISCONNECTED_PLACEHOLDER_AD_STATUS,
    placementKind: "interstitial",
    loaded: false,
    shown: false,
    message: "Placeholder interstitial ad provider is not connected. No real ad was shown.",
  }),
};

export const getPlaceholderAdProvider = () => placeholderAdProvider;

