import React, { useMemo } from "react";
import { Image, type ImageProps, type ImageSourcePropType } from "react-native";

import {
  bindProfileMediaImageSource,
  sourceContainsExactProjectProfileMediaUrl,
} from "../../_lib/profileMediaImageAuthority";
import { useOptionalSession } from "../../_lib/session";
import { SUPABASE_URL } from "../../_lib/supabase";

export const useProfileMediaImageBinding = (source?: ImageSourcePropType) => {
  const sessionContext = useOptionalSession();
  const hasExactActiveAuthority = sessionContext?.authorityStatus === "active"
    && sessionContext.authority?.state === "ACTIVE"
    && sessionContext.authority.restoreOnly === false
    && sessionContext.authority.userId === sessionContext.session?.user.id
    && sessionContext.authority.accountId === sessionContext.session?.user.id
    && sessionContext.user?.id === sessionContext.session?.user.id;
  const accessToken = hasExactActiveAuthority
    ? sessionContext.session?.access_token ?? null
    : null;
  const authorityStatus = hasExactActiveAuthority ? "active" : sessionContext?.authorityStatus ?? "signed_out";
  const isProfileMediaSource = useMemo(
    () => sourceContainsExactProjectProfileMediaUrl(source, SUPABASE_URL),
    [source],
  );
  const renderEpoch = isProfileMediaSource
    ? hasExactActiveAuthority
      ? `active:${sessionContext.authority?.sessionGeneration ?? "missing"}`
      : `anonymous:${authorityStatus}`
    : "unbound";

  const authorizedSource = useMemo(
    () => source
      ? bindProfileMediaImageSource(source, {
          accessToken,
          authorityStatus,
          projectUrl: SUPABASE_URL,
        })
      : undefined,
    [accessToken, authorityStatus, source],
  );

  return { renderEpoch, source: authorizedSource };
};

export const useProfileMediaImageSource = (source?: ImageSourcePropType) => (
  useProfileMediaImageBinding(source).source
);

export const ProfileMediaImage = ({ source, ...props }: ImageProps) => {
  const binding = useProfileMediaImageBinding(source);
  return <Image {...props} key={binding.renderEpoch} source={binding.source} />;
};
