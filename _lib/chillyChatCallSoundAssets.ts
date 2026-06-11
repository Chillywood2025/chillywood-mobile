import { Audio, type AVPlaybackSource } from "expo-av";

import { normalizeChillyChatRingtoneKey, type ChillyChatRingtoneKey } from "./chillyChatCalls";

export const CHILLY_CHAT_MESSAGE_CHANNEL_ID = "chilly_chat_messages";
export const CHILLY_CHAT_CALL_CHANNEL_ID = "chilly_chat_calls_v2";
export const CHILLY_CHAT_MISSED_CALL_CHANNEL_ID = "chilly_chat_missed_calls";
export const CHILLY_CHAT_DEFAULT_NOTIFICATION_SOUND = "chilly-ring.wav";

export const CHILLY_CHAT_NOTIFICATION_SOUND_FILES = [
  "./assets/sounds/chilly-chat/chilly-ring.wav",
  "./assets/sounds/chilly-chat/skyline-pulse.wav",
  "./assets/sounds/chilly-chat/theater-bell.wav",
  "./assets/sounds/chilly-chat/velvet-knock.wav",
  "./assets/sounds/chilly-chat/quiet-buzz.wav",
  "./assets/sounds/chilly-chat/classic-phone.wav",
] as const;

export type ChillyChatPlayingSound = Audio.Sound;

const SOUND_SOURCE_BY_KEY: Record<Exclude<ChillyChatRingtoneKey, "silent_vibrate">, AVPlaybackSource> = {
  chilly_ring: require("../assets/sounds/chilly-chat/chilly-ring.wav") as AVPlaybackSource,
  skyline_pulse: require("../assets/sounds/chilly-chat/skyline-pulse.wav") as AVPlaybackSource,
  theater_bell: require("../assets/sounds/chilly-chat/theater-bell.wav") as AVPlaybackSource,
  velvet_knock: require("../assets/sounds/chilly-chat/velvet-knock.wav") as AVPlaybackSource,
  quiet_buzz: require("../assets/sounds/chilly-chat/quiet-buzz.wav") as AVPlaybackSource,
  classic_phone: require("../assets/sounds/chilly-chat/classic-phone.wav") as AVPlaybackSource,
};

export const getChillyChatCallSoundSource = (key: unknown): AVPlaybackSource | null => {
  const normalized = normalizeChillyChatRingtoneKey(key);
  if (normalized === "silent_vibrate") return null;
  return SOUND_SOURCE_BY_KEY[normalized] ?? SOUND_SOURCE_BY_KEY.chilly_ring;
};

export async function playChillyChatCallSound(
  key: unknown,
  options?: { loop?: boolean; volume?: number },
): Promise<Audio.Sound | null> {
  const source = getChillyChatCallSoundSource(key);
  if (!source) return null;

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    staysActiveInBackground: false,
  });

  const { sound } = await Audio.Sound.createAsync(source, {
    isLooping: !!options?.loop,
    shouldPlay: true,
    volume: Math.max(0, Math.min(1, options?.volume ?? 0.85)),
  });
  return sound;
}

export async function stopChillyChatCallSound(sound: Audio.Sound | null | undefined): Promise<void> {
  if (!sound) return;
  await sound.stopAsync().catch(() => null);
  await sound.unloadAsync().catch(() => null);
}
