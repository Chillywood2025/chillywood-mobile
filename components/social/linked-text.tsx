import * as WebBrowser from "expo-web-browser";
import React, { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

type LinkedTextProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

type TextSegment = {
  key: string;
  text: string;
  url?: string;
};

const URL_PATTERN = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/gi;

const normalizeUrl = (value: string) => {
  const normalized = value.startsWith("www.") ? `https://${value}` : value;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const splitTrailingPunctuation = (value: string) => {
  let body = value;
  let trailing = "";
  while (/[.,!?;:]$/.test(body)) {
    trailing = `${body.slice(-1)}${trailing}`;
    body = body.slice(0, -1);
  }
  return { body, trailing };
};

const parseSegments = (text: string): TextSegment[] => {
  const segments: TextSegment[] = [];
  const source = String(text ?? "");
  let cursor = 0;
  let match: RegExpExecArray | null;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(source)) !== null) {
    const raw = match[0];
    const start = match.index;
    if (start > cursor) {
      segments.push({
        key: `${segments.length}-text`,
        text: source.slice(cursor, start),
      });
    }

    const { body, trailing } = splitTrailingPunctuation(raw);
    const url = normalizeUrl(body);
    segments.push({
      key: `${segments.length}-link`,
      text: body,
      url: url || undefined,
    });
    if (trailing) {
      segments.push({
        key: `${segments.length}-punctuation`,
        text: trailing,
      });
    }
    cursor = start + raw.length;
  }

  if (cursor < source.length) {
    segments.push({
      key: `${segments.length}-text`,
      text: source.slice(cursor),
    });
  }

  return segments.length ? segments : [{ key: "text", text: source }];
};

export function LinkedText({
  text,
  style,
  linkStyle,
  numberOfLines,
}: LinkedTextProps) {
  const segments = useMemo(() => parseSegments(text), [text]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((segment) => {
        if (!segment.url) return <Text key={segment.key}>{segment.text}</Text>;
        return (
          <Text
            key={segment.key}
            style={[styles.link, linkStyle]}
            onPress={() => {
              void WebBrowser.openBrowserAsync(segment.url!);
            }}
          >
            {segment.text}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: "#8FB6FF",
    textDecorationLine: "underline",
  },
});
