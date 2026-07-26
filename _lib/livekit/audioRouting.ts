import { Platform } from "react-native";

import { LiveKitAudioSession } from "./react-native-module";

export type LiveKitAudioOutput =
  | "bluetooth"
  | "default"
  | "earpiece"
  | "force_speaker"
  | "headset"
  | "speaker";

const KNOWN_AUDIO_OUTPUTS = new Set<LiveKitAudioOutput>([
  "bluetooth",
  "default",
  "earpiece",
  "force_speaker",
  "headset",
  "speaker",
]);

export const readLiveKitAudioOutputs = async (): Promise<LiveKitAudioOutput[]> => {
  const outputs = await LiveKitAudioSession.getAudioOutputs();
  return outputs.filter((output): output is LiveKitAudioOutput => (
    KNOWN_AUDIO_OUTPUTS.has(output as LiveKitAudioOutput)
  ));
};

export const selectLiveKitAudioOutput = async (output: LiveKitAudioOutput) => {
  const available = await readLiveKitAudioOutputs();
  if (!available.includes(output)) return false;
  await LiveKitAudioSession.selectAudioOutput(output);
  return true;
};

export const showLiveKitAudioRoutePicker = async () => {
  if (Platform.OS !== "ios") return false;
  await LiveKitAudioSession.showAudioRoutePicker();
  return true;
};
