import React, { useLayoutEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type ImageProps,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { color, radius } from "./tokens";
import { Skeleton } from "./Skeleton";
import { useProfileMediaImageBinding } from "./ProfileMediaImage";

type StableImageProps = Omit<ImageProps, "source"> & {
  borderRadius?: number;
  containerStyle?: StyleProp<ViewStyle>;
  expectedHeight: DimensionValue;
  expectedWidth: DimensionValue;
  fallback?: React.ReactNode;
  /** Exact asset/version AND viewer/session scope. Only an explicit identity permits URL renewal retention. */
  identityKey?: string;
  onRetry?: () => void;
  retryKey?: string | number;
  source?: ImageSourcePropType | null;
};

// Compare requests by value: inline { uri } props must not restart a loaded image.
// These signatures remain internal; bearer headers never become React/native keys.
const sourceSignature = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(sourceSignature).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${sourceSignature(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};

const hasImageSource = (source?: ImageSourcePropType | null): source is ImageSourcePropType => (
  typeof source === "number" ? source > 0
    : Array.isArray(source) ? source.some((candidate) => Boolean(candidate.uri))
      : Boolean(source?.uri)
);

type Attempt = { id: number; source: ImageSourcePropType };
type LoadState = {
  signature: string;
  current: Attempt;
  previous?: Attempt;
  status: "loading" | "ready" | "error";
};

const ImageContent = ({
  borderRadius = radius.lg,
  fadeDuration = 0,
  fallback,
  onError,
  onLoad,
  onLoadEnd,
  onLoadStart,
  onRetry,
  resizeMode = "cover",
  retryKey,
  source,
  style,
  ...props
}: Omit<StableImageProps, "containerStyle" | "expectedHeight" | "expectedWidth" | "identityKey"> & {
  source: ImageSourcePropType;
}) => {
  const [retry, setRetry] = useState(0);
  const signature = sourceSignature([source, retryKey, retry]);
  const [state, setState] = useState<LoadState>(() => ({
    signature,
    current: { id: 0, source },
    status: "loading",
  }));
  if (state.signature !== signature) {
    // Adjust before committing, rather than showing the old source for one effect/frame.
    setState({
      signature,
      current: { id: state.current.id + 1, source },
      previous: state.status === "ready" ? state.current : state.previous,
      status: "loading",
    });
  }
  const activeAttempt = useRef<{ id: number; failed: boolean } | null>(null);
  const attemptId = state.current.id;
  useLayoutEffect(() => {
    activeAttempt.current = { id: attemptId, failed: false };
    return () => { activeAttempt.current = null; };
  }, [attemptId]);
  const isCurrent = () => activeAttempt.current?.id === attemptId;
  const retryImage = () => {
    if (!isCurrent()) return;
    setRetry((value) => value + 1);
    onRetry?.();
  };

  return (
    <>
      {state.status === "loading" && !state.previous ? (
        <Skeleton borderRadius={borderRadius} height="100%" width="100%" style={StyleSheet.absoluteFill} />
      ) : null}
      {state.status !== "error" ? [state.previous, state.current].map((attempt) => attempt ? (
        <Image
          {...props}
          key={attempt.id}
          accessibilityElementsHidden={attempt !== state.current || props.accessibilityElementsHidden}
          importantForAccessibility={attempt !== state.current ? "no-hide-descendants" : props.importantForAccessibility}
          fadeDuration={fadeDuration}
          onError={(event) => {
            if (attempt !== state.current || !isCurrent()) return;
            activeAttempt.current!.failed = true;
            setState((value) => ({ ...value, previous: undefined, status: "error" }));
            onError?.(event);
          }}
          onLoad={(event) => {
            if (attempt !== state.current || !isCurrent() || activeAttempt.current?.failed) return;
            setState((value) => ({ ...value, previous: undefined, status: "ready" }));
            onLoad?.(event);
          }}
          onLoadEnd={() => {
            if (attempt === state.current && isCurrent()) onLoadEnd?.();
          }}
          onLoadStart={() => {
            if (attempt === state.current && isCurrent()) onLoadStart?.();
          }}
          resizeMode={resizeMode}
          source={attempt.source}
          style={[
            StyleSheet.absoluteFill, styles.image, { borderRadius }, style,
            // A replacement's background must not cover the successful retained bitmap.
            state.previous && attempt === state.current ? { opacity: 0 } : undefined,
          ]}
        />
      ) : null) : (
        <Pressable
          accessibilityLabel="Retry image"
          accessibilityHint="Image could not load"
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            retryImage();
          }}
          style={[StyleSheet.absoluteFill, styles.unavailable, { borderRadius }]}
        >
          {fallback ?? <Text accessible={false} style={styles.retry}>↻</Text>}
        </Pressable>
      )}
    </>
  );
};

export const StableImage = ({
  borderRadius = radius.lg,
  containerStyle,
  expectedHeight,
  expectedWidth,
  fallback,
  identityKey,
  source,
  ...props
}: StableImageProps) => {
  const binding = useProfileMediaImageBinding(source ?? undefined);
  const imageSource = hasImageSource(binding.source) ? binding.source : undefined;
  const signature = sourceSignature([
    binding.renderEpoch,
    // Bindings may renew their bearer without changing the caller's asset or
    // authority epoch. All caller source fields still delimit distinct images.
    imageSource ? identityKey ?? source : null,
  ]);
  const [identity, setIdentity] = useState({ signature, epoch: 0 });
  if (identity.signature !== signature) setIdentity({ signature, epoch: identity.epoch + 1 });

  return (
    <View style={[
      styles.container,
      { borderRadius, height: expectedHeight, width: expectedWidth },
      containerStyle,
    ]}>
      {imageSource ? (
        <ImageContent {...props} key={identity.epoch} borderRadius={borderRadius} fallback={fallback} source={imageSource} />
      ) : (
        <View accessibilityLabel="Image unavailable" accessibilityRole="image" style={[StyleSheet.absoluteFill, styles.unavailable, { borderRadius }]}>
          {fallback}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { overflow: "hidden" },
  image: { height: "100%", width: "100%" },
  unavailable: { alignItems: "center", backgroundColor: color.surface, justifyContent: "center" },
  retry: { color: color.textSecondary, fontSize: 22 },
});
