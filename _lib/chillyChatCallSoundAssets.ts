import { Audio, InterruptionModeAndroid, type AVPlaybackSource } from "expo-av";

import { normalizeChillyChatRingtoneKey, type ChillyChatRingtoneKey } from "./chillyChatCalls";

export const CHILLY_CHAT_MESSAGE_CHANNEL_ID = "chilly_chat_messages";
export const CHILLY_CHAT_CALL_CHANNEL_ID = "chilly_chat_calls_v3";
export const CHILLY_CHAT_NATIVE_CALL_CHANNEL_ID = "chilly_chat_calls_fullscreen_v1";
export const CHILLY_CHAT_MISSED_CALL_CHANNEL_ID = "chilly_chat_missed_calls";
export const CHILLY_CHAT_DEFAULT_NOTIFICATION_SOUND = "chilly_ring.wav";

export const CHILLY_CHAT_NOTIFICATION_SOUND_FILES = [
  "./assets/sounds/chilly-chat/chilly_ring.wav",
  "./assets/sounds/chilly-chat/skyline_pulse.wav",
  "./assets/sounds/chilly-chat/theater_bell.wav",
  "./assets/sounds/chilly-chat/velvet_knock.wav",
  "./assets/sounds/chilly-chat/quiet_buzz.wav",
  "./assets/sounds/chilly-chat/classic_phone.wav",
] as const;

export type ChillyChatPlayingSound = Audio.Sound;

const SOUND_START_TIMEOUT_MS = 900;

const SOUND_SOURCE_BY_KEY: Record<Exclude<ChillyChatRingtoneKey, "silent_vibrate">, AVPlaybackSource> = {
  chilly_ring: require("../assets/sounds/chilly-chat/chilly_ring.wav") as AVPlaybackSource,
  skyline_pulse: require("../assets/sounds/chilly-chat/skyline_pulse.wav") as AVPlaybackSource,
  theater_bell: require("../assets/sounds/chilly-chat/theater_bell.wav") as AVPlaybackSource,
  velvet_knock: require("../assets/sounds/chilly-chat/velvet_knock.wav") as AVPlaybackSource,
  quiet_buzz: require("../assets/sounds/chilly-chat/quiet_buzz.wav") as AVPlaybackSource,
  classic_phone: require("../assets/sounds/chilly-chat/classic_phone.wav") as AVPlaybackSource,
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
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    playsInSilentModeIOS: true,
    playThroughEarpieceAndroid: false,
    shouldDuckAndroid: false,
    staysActiveInBackground: false,
  });

  const { sound } = await Audio.Sound.createAsync(source, {
    isLooping: !!options?.loop,
    shouldPlay: false,
    volume: Math.max(0, Math.min(1, options?.volume ?? 0.85)),
  });
  try {
    await sound.setVolumeAsync(Math.max(0, Math.min(1, options?.volume ?? 0.85)));
    await sound.playAsync();
    const status = await waitForChillyChatSoundPlayback(sound);
    if (!status) {
      throw new Error("Chi'lly Chat call sound did not start.");
    }
    return sound;
  } catch (error) {
    await stopChillyChatCallSound(sound);
    throw error;
  }
}

export async function stopChillyChatCallSound(sound: Audio.Sound | null | undefined): Promise<void> {
  if (!sound) return;
  await sound.stopAsync().catch(() => null);
  await sound.unloadAsync().catch(() => null);
}

async function waitForChillyChatSoundPlayback(sound: Audio.Sound): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < SOUND_START_TIMEOUT_MS) {
    const status = await sound.getStatusAsync();
    if (status.isLoaded && status.isPlaying) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return false;
}
