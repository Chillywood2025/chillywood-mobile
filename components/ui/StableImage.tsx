import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  StyleSheet,
  View,
  type DimensionValue,
  type ImageProps,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { radius } from "./tokens";
import { Skeleton } from "./Skeleton";

type StableImageProps = Omit<ImageProps, "source"> & {
  borderRadius?: number;
  containerStyle?: StyleProp<ViewStyle>;
  expectedHeight: DimensionValue;
  expectedWidth: DimensionValue;
  source?: ImageSourcePropType | null;
};

const getSourceKey = (source?: ImageSourcePropType | null) => {
  if (!source) return "missing";
  const resolved = Image.resolveAssetSource(source);
  return resolved?.uri || String(resolved?.width ?? "") + "x" + String(resolved?.height ?? "");
};

export const StableImage = ({
  borderRadius = radius.lg,
  containerStyle,
  expectedHeight,
  expectedWidth,
  onError,
  onLoad,
  onLoadEnd,
  resizeMode = "cover",
  source,
  style,
  ...props
}: StableImageProps) => {
  const sourceKey = useMemo(() => getSourceKey(source), [source]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imageSource = source ?? undefined;
  const hasSource = Boolean(imageSource);
  const showPlaceholder = !hasSource || error || !loaded;

  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [sourceKey]);

  return (
    <View
      style={[
        styles.container,
        { borderRadius, height: expectedHeight, width: expectedWidth },
        containerStyle,
      ]}
    >
      {imageSource && !error ? (
        <Image
          {...props}
          onError={(event) => {
            setError(true);
            onError?.(event);
          }}
          onLoad={(event) => {
            onLoad?.(event);
          }}
          onLoadEnd={() => {
            setLoaded(true);
            onLoadEnd?.();
          }}
          resizeMode={resizeMode}
          source={imageSource}
          style={[
            StyleSheet.absoluteFill,
            styles.image,
            { borderRadius, opacity: loaded ? 1 : 0 },
            style,
          ]}
        />
      ) : null}
      {showPlaceholder ? (
        <Skeleton
          borderRadius={borderRadius}
          height="100%"
          width="100%"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  image: {
    height: "100%",
    width: "100%",
  },
});
