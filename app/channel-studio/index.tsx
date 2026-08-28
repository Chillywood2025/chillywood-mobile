import React, { type ReactNode } from "react";
import { Alert } from "react-native";

import { ChannelStudioScreen } from "../channel-settings";

const replacePlatformStudioTerminology = (value: string) => value
  .replace(/\bChannels\b/g, "Platforms")
  .replace(/\bchannels\b/g, "platforms")
  .replace(/\bChannel\b/g, "Platform")
  .replace(/\bchannel\b/g, "platform");

const USER_FACING_STRING_PROPS = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "label",
  "placeholder",
  "title",
]);

const rewritePlatformStudioNode = (node: ReactNode): ReactNode => {
  if (typeof node === "string") return replacePlatformStudioTerminology(node);
  if (Array.isArray(node)) return node.map(rewritePlatformStudioNode);
  if (!React.isValidElement(node)) return node;

  const element = node as React.ReactElement<Record<string, unknown>>;
  const nextProps: Record<string, unknown> = {};
  let propsChanged = false;

  USER_FACING_STRING_PROPS.forEach((key) => {
    const current = element.props[key];
    if (typeof current !== "string") return;
    const next = replacePlatformStudioTerminology(current);
    if (next !== current) {
      nextProps[key] = next;
      propsChanged = true;
    }
  });

  const currentChildren = element.props.children as ReactNode;
  const nextChildren = rewritePlatformStudioNode(currentChildren);
  const childrenChanged = nextChildren !== currentChildren;

  if (!propsChanged && !childrenChanged) return element;
  return React.cloneElement(element, nextProps, nextChildren);
};

/**
 * Preferred Platform Studio route.
 *
 * The implementation intentionally keeps legacy channel-* identifiers for API,
 * database, analytics, and compatibility-route stability. This route normalizes
 * only rendered/user-facing copy so those internal contracts never leak the old
 * Channel product term back into Platform Studio.
 */
export default function PlatformStudioRoute() {
  const originalAlert = Alert.alert;
  Alert.alert = ((title: string, message?: string, buttons?: Parameters<typeof Alert.alert>[2], options?: Parameters<typeof Alert.alert>[3]) => (
    originalAlert(
      replacePlatformStudioTerminology(title),
      typeof message === "string" ? replacePlatformStudioTerminology(message) : message,
      buttons?.map((button) => ({
        ...button,
        text: typeof button.text === "string" ? replacePlatformStudioTerminology(button.text) : button.text,
      })),
      options,
    )
  )) as typeof Alert.alert;

  try {
    // Deliberately execute the compatibility implementation inside this route so
    // its rendered tree can be normalized without renaming internal contracts.
    return rewritePlatformStudioNode(ChannelStudioScreen()) as React.ReactElement;
  } finally {
    Alert.alert = originalAlert;
  }
}
