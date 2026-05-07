import type { AdsPlacementKind, AdsProviderKey } from "./adConfig";

export type AdProviderConnectionState = "not_connected" | "connected" | "unavailable";

export type AdProviderStatus = {
  provider: AdsProviderKey;
  isConnected: boolean;
  state: AdProviderConnectionState;
  message: string;
};

export type NativeAdLoadRequest = {
  surface: string;
  routePath?: string | null;
  userId?: string | null;
};

export type InterstitialAdShowRequest = {
  surface: string;
  routePath?: string | null;
  userId?: string | null;
};

export type AdProviderResult = {
  ok: boolean;
  providerStatus: AdProviderStatus;
  placementKind: AdsPlacementKind;
  placeholderOnly: boolean;
  loaded: boolean;
  shown: boolean;
  message: string;
};

export type AdProvider = {
  provider: AdsProviderKey;
  isConnected: boolean;
  getStatus: () => AdProviderStatus;
  loadNativeAd: (request: NativeAdLoadRequest) => Promise<AdProviderResult>;
  showInterstitial: (request: InterstitialAdShowRequest) => Promise<AdProviderResult>;
};

export const createAdProviderStatus = (
  provider: AdsProviderKey,
  isConnected: boolean,
  state: AdProviderConnectionState,
  message: string,
): AdProviderStatus => ({
  provider,
  isConnected,
  state,
  message,
});

export const DISCONNECTED_PLACEHOLDER_AD_STATUS = createAdProviderStatus(
  "placeholder",
  false,
  "not_connected",
  "Placeholder ad provider is not connected. No real ads can load or show.",
);

export const createAdProviderResult = (options: {
  providerStatus: AdProviderStatus;
  placementKind: AdsPlacementKind;
  placeholderOnly?: boolean;
  loaded?: boolean;
  shown?: boolean;
  message: string;
}): AdProviderResult => ({
  ok: !!options.loaded || !!options.shown,
  providerStatus: options.providerStatus,
  placementKind: options.placementKind,
  placeholderOnly: options.placeholderOnly ?? true,
  loaded: !!options.loaded,
  shown: !!options.shown,
  message: options.message,
});

