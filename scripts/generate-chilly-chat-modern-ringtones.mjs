#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SAMPLE_RATE = 44_100;
const ROOT = process.cwd();
const APP_SOUND_DIR = path.join(ROOT, "assets/sounds/chilly-chat");
const ANDROID_SOUND_DIR = path.join(ROOT, "android/app/src/main/res/raw");

const SOUNDS = [
  {
    file: "chilly_ring.wav",
    duration: 3.0,
    targetPeak: 0.9,
    build: (mix) => {
      const motif = [659.25, 783.99, 987.77, 783.99];
      [0, 1.28].forEach((offset) => {
        motif.forEach((freq, index) => {
          const start = offset + index * 0.18;
          mix.tone({ start, duration: 0.16, freq, amp: 0.46, attack: 0.018, release: 0.075, wave: "triangle" });
          mix.tone({ start, duration: 0.16, freq: freq * 2, amp: 0.11, attack: 0.012, release: 0.065, wave: "sine" });
          mix.tone({ start, duration: 0.2, freq: freq / 2, amp: 0.08, attack: 0.025, release: 0.11, wave: "sine" });
        });
      });
    },
  },
  {
    file: "skyline_pulse.wav",
    duration: 2.8,
    targetPeak: 0.88,
    build: (mix) => {
      [0, 0.52, 1.24, 1.76].forEach((start, index) => {
        const base = [523.25, 659.25, 783.99, 1046.5][index];
        mix.tone({ start, duration: 0.18, freq: base, amp: 0.44, attack: 0.01, release: 0.07, wave: "saw" });
        mix.tone({ start: start + 0.11, duration: 0.16, freq: base * 1.5, amp: 0.22, attack: 0.012, release: 0.06, wave: "triangle" });
        mix.tone({ start, duration: 0.28, freq: 164.81, amp: 0.1, attack: 0.02, release: 0.16, wave: "sine" });
      });
    },
  },
  {
    file: "theater_bell.wav",
    duration: 3.2,
    targetPeak: 0.9,
    build: (mix) => {
      [
        [0, 587.33],
        [0.64, 783.99],
        [1.28, 987.77],
      ].forEach(([start, freq]) => {
        mix.bell({ start, duration: 1.15, freq, amp: 0.5 });
        mix.tone({ start: start + 0.04, duration: 0.5, freq: freq / 2, amp: 0.08, attack: 0.02, release: 0.36, wave: "sine" });
      });
    },
  },
  {
    file: "velvet_knock.wav",
    duration: 2.9,
    targetPeak: 0.82,
    build: (mix) => {
      [0, 0.48, 1.18, 1.66].forEach((start, index) => {
        const base = index % 2 === 0 ? 392 : 440;
        mix.tone({ start, duration: 0.32, freq: base, amp: 0.32, attack: 0.025, release: 0.2, wave: "sine" });
        mix.tone({ start: start + 0.025, duration: 0.22, freq: base * 2.02, amp: 0.13, attack: 0.018, release: 0.14, wave: "triangle" });
        mix.tone({ start, duration: 0.16, freq: 150, amp: 0.16, attack: 0.01, release: 0.12, wave: "sine" });
      });
    },
  },
  {
    file: "quiet_buzz.wav",
    duration: 2.6,
    targetPeak: 0.68,
    build: (mix) => {
      [0, 0.36, 0.92, 1.28, 1.84].forEach((start) => {
        mix.buzz({ start, duration: 0.22, freq: 145, amp: 0.28 });
        mix.tone({ start, duration: 0.22, freq: 435, amp: 0.16, attack: 0.015, release: 0.09, wave: "sine" });
      });
    },
  },
  {
    file: "classic_phone.wav",
    duration: 3.4,
    targetPeak: 0.9,
    build: (mix) => {
      [0, 1.55].forEach((offset) => {
        for (let i = 0; i < 6; i += 1) {
          const start = offset + i * 0.16;
          const freq = i % 2 === 0 ? 440 : 493.88;
          mix.tone({ start, duration: 0.12, freq, amp: 0.42, attack: 0.008, release: 0.055, wave: "square" });
          mix.tone({ start, duration: 0.12, freq: freq * 2, amp: 0.08, attack: 0.008, release: 0.055, wave: "sine" });
        }
      });
    },
  },
];

class Mix {
  constructor(durationSeconds) {
    this.samples = new Float32Array(Math.ceil(durationSeconds * SAMPLE_RATE));
  }

  tone({ start, duration, freq, amp, attack, release, wave }) {
    const startIndex = Math.max(0, Math.floor(start * SAMPLE_RATE));
    const endIndex = Math.min(this.samples.length, Math.ceil((start + duration) * SAMPLE_RATE));
    const total = Math.max(1, endIndex - startIndex);
    for (let index = startIndex; index < endIndex; index += 1) {
      const local = (index - startIndex) / SAMPLE_RATE;
      const phase = local * freq;
      const age = (index - startIndex) / total;
      const tail = (endIndex - index) / SAMPLE_RATE;
      const env = envelope(local, duration, attack, release, tail, age);
      this.samples[index] += amp * env * waveform(wave, phase);
    }
  }

  bell({ start, duration, freq, amp }) {
    const partials = [
      [1, 1],
      [2.01, 0.45],
      [2.73, 0.28],
      [3.85, 0.18],
    ];
    partials.forEach(([ratio, level]) => {
      this.tone({
        start,
        duration,
        freq: freq * ratio,
        amp: amp * level,
        attack: 0.006,
        release: duration * (0.72 / ratio),
        wave: "sine",
      });
    });
  }

  buzz({ start, duration, freq, amp }) {
    const startIndex = Math.max(0, Math.floor(start * SAMPLE_RATE));
    const endIndex = Math.min(this.samples.length, Math.ceil((start + duration) * SAMPLE_RATE));
    for (let index = startIndex; index < endIndex; index += 1) {
      const local = (index - startIndex) / SAMPLE_RATE;
      const phase = local * freq;
      const tail = (endIndex - index) / SAMPLE_RATE;
      const env = envelope(local, duration, 0.008, 0.08, tail, local / duration);
      const mod = 0.55 + 0.45 * Math.sin(2 * Math.PI * 31 * local);
      const value = 0.65 * Math.sin(2 * Math.PI * phase) + 0.35 * Math.sin(2 * Math.PI * phase * 2.01);
      this.samples[index] += amp * env * mod * value;
    }
  }
}

const envelope = (local, duration, attack, release, tail, age) => {
  const attackLevel = Math.min(1, local / Math.max(0.001, attack));
  const releaseLevel = Math.min(1, tail / Math.max(0.001, release));
  const curve = Math.sin(Math.PI * Math.min(1, Math.max(0, age)));
  return Math.min(attackLevel, releaseLevel) * (0.72 + 0.28 * curve);
};

const waveform = (wave, phase) => {
  const cycle = phase - Math.floor(phase);
  switch (wave) {
    case "square":
      return cycle < 0.5 ? 0.82 : -0.82;
    case "saw":
      return (2 * cycle - 1) * 0.72;
    case "triangle":
      return (1 - 4 * Math.abs(Math.round(cycle - 0.25) - (cycle - 0.25))) * 0.86;
    case "sine":
    default:
      return Math.sin(2 * Math.PI * phase);
  }
};

const writeWav = (filePath, samples, targetPeak) => {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  const gain = peak > 0 ? targetPeak / peak : 1;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const shaped = Math.tanh(samples[index] * gain * 1.08);
    const value = Math.max(-1, Math.min(1, shaped));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
  }
  writeFileSync(filePath, buffer);
};

mkdirSync(APP_SOUND_DIR, { recursive: true });
mkdirSync(ANDROID_SOUND_DIR, { recursive: true });

for (const sound of SOUNDS) {
  const mix = new Mix(sound.duration);
  sound.build(mix);
  const appPath = path.join(APP_SOUND_DIR, sound.file);
  const androidPath = path.join(ANDROID_SOUND_DIR, sound.file);
  writeWav(appPath, mix.samples, sound.targetPeak);
  writeWav(androidPath, mix.samples, sound.targetPeak);
  console.log(`Generated ${sound.file}`);
}
