import { useEffect, useState } from "react";

import type { AdsLaunchConfig } from "../_lib/ads/adConfig";
import {
  DEFAULT_APP_CONFIG,
  getCachedAppConfig,
  readAppConfig,
} from "../_lib/appConfig";

type UseAdsLaunchConfigOptions = {
  enabled?: boolean;
};

const getInitialAdsLaunchConfig = (): AdsLaunchConfig => (
  getCachedAppConfig()?.adsLaunch ?? DEFAULT_APP_CONFIG.adsLaunch
);

export function useAdsLaunchConfig(options?: UseAdsLaunchConfigOptions) {
  const enabled = options?.enabled ?? true;
  const [config, setConfig] = useState<AdsLaunchConfig>(() => getInitialAdsLaunchConfig());
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    readAppConfig()
      .then((nextConfig) => {
        if (!cancelled) setConfig(nextConfig.adsLaunch);
      })
      .catch(() => {
        if (!cancelled) setConfig(DEFAULT_APP_CONFIG.adsLaunch);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    config,
    loading,
  };
}
