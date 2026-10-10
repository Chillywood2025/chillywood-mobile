export type ChillyChatSoundOperations<Sound extends object> = {
  create(): Sound;
  configure(): Promise<unknown>;
  load(sound: Sound): Promise<unknown>;
  setVolume(sound: Sound): Promise<unknown>;
  play(sound: Sound): Promise<unknown>;
  verify(sound: Sound, checkCurrent: () => void): Promise<boolean>;
  stop(sound: Sound): Promise<unknown>;
  unload(sound: Sound): Promise<unknown>;
};

export function createChillyChatCallSoundLifecycle(options?: { drainTimeoutMs?: number }): {
  play<Sound extends object>(operations: ChillyChatSoundOperations<Sound>): Promise<Sound | null>;
  stop(sound: object | null | undefined): Promise<boolean>;
  claim(owner: object, isCurrent: () => boolean): Promise<void>;
  release(owner: object): void;
};
