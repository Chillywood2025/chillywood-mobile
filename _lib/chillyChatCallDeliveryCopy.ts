import type { ChillyChatCallDispatchChannelSet } from "./chillyChatCallDispatchSchema";

type DeliveryCopyInput = {
  channels?: ChillyChatCallDispatchChannelSet;
  notificationCreated: boolean;
  pushSent: boolean;
  status: string;
};

export function isChillyChatCallDeviceAlertConfirmed(delivery: DeliveryCopyInput | null | undefined) {
  return delivery?.pushSent === true;
}

export function getChillyChatCallDeliveryMessage(delivery: DeliveryCopyInput | null | undefined) {
  if (!delivery) {
    return "Call invite is active in this thread. Device-alert delivery status is unavailable for this call.";
  }
  if (delivery.pushSent) {
    const androidSent = delivery.channels?.androidNative.pushSent === true;
    const iosVoipSent = delivery.channels?.iosVoip.pushSent === true;
    const ordinaryPushSent = delivery.channels?.ordinaryPush.pushSent === true;
    const sentChannelCount = [androidSent, iosVoipSent, ordinaryPushSent].filter(Boolean).length;
    if (sentChannelCount > 1) return "Call alert sent through available device channels.";
    if (iosVoipSent) return "Native iPhone call alert sent.";
    if (androidSent) return "Android call alert sent.";
    if (ordinaryPushSent) return "Push notification sent.";
    return "Call alert sent through available device channels.";
  }
  if (delivery.notificationCreated) {
    return "Call invite saved for in-app delivery. No recipient device alert was confirmed.";
  }
  if (delivery.status === "blocked") {
    return "Delivery status: receiver unavailable. Current safety or account-status rules blocked the receiver call alert.";
  }
  if (delivery.status === "failed") {
    return "Delivery status: push unconfirmed. The receiver invite is saved for in-app ringing if they are online, but notification dispatch failed.";
  }
  if (delivery.status === "skipped") {
    return "Delivery status: push unconfirmed. The receiver invite is saved for in-app ringing, but background push is not available.";
  }
  if (delivery.status === "created") {
    return "Call invite saved for in-app delivery. No recipient device alert was confirmed.";
  }
  return "Delivery status: push unconfirmed. The receiver invite is saved, but delivery confirmation is pending.";
}
