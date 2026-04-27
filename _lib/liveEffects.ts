export type LiveEffectCategoryId =
  | "off"
  | "beauty_retouch"
  | "appearance_makeup"
  | "distortion_funny"
  | "ai_aging"
  | "glam_signature"
  | "mirror_invert"
  | "novelty_face_card";

export type LiveEffectStatus = "available" | "preview_only" | "coming_soon" | "disabled";

export type LiveEffectPhase = "v1_foundation" | "later_native_processor";

export type LiveEffectCategory = {
  id: LiveEffectCategoryId;
  label: string;
  description: string;
};

export type LiveEffectItem = {
  id: string;
  label: string;
  category: LiveEffectCategoryId;
  status: LiveEffectStatus;
  phase: LiveEffectPhase;
  description: string;
  requiresNativeProcessor: boolean;
  intensity?: {
    min: number;
    max: number;
    defaultValue: number;
  };
};

export const LIVE_EFFECT_OFF_ID = "off";

export const LIVE_EFFECT_CATEGORIES: LiveEffectCategory[] = [
  {
    id: "off",
    label: "Off",
    description: "No live camera effect is selected.",
  },
  {
    id: "beauty_retouch",
    label: "Beauty / Retouch",
    description: "Skin, lighting, and retouch tools for a later real-time processor.",
  },
  {
    id: "appearance_makeup",
    label: "Appearance / Makeup",
    description: "Makeup, color, and style looks for a later real-time processor.",
  },
  {
    id: "distortion_funny",
    label: "Distortion / Funny",
    description: "Playful camera transformations for a later real-time processor.",
  },
  {
    id: "ai_aging",
    label: "AI / Aging",
    description: "AI or age-style transformations that require approved processing.",
  },
  {
    id: "glam_signature",
    label: "Glam / Signature",
    description: "Branded Chi'llywood looks for a later approved effects lane.",
  },
  {
    id: "mirror_invert",
    label: "Mirror / Invert",
    description: "Mirror-style tools that must be real preview or outgoing-track changes.",
  },
  {
    id: "novelty_face_card",
    label: "Novelty / Face-card",
    description: "Scan-style novelty tools that must avoid rating people or sensitive traits.",
  },
];

export const LIVE_EFFECT_ITEMS: LiveEffectItem[] = [
  {
    id: LIVE_EFFECT_OFF_ID,
    label: "Off",
    category: "off",
    status: "available",
    phase: "v1_foundation",
    description: "Natural camera with no live effect. This is the only active v1 effect state.",
    requiresNativeProcessor: false,
  },
  {
    id: "soft-studio-retouch",
    label: "Soft Studio Retouch",
    category: "beauty_retouch",
    status: "coming_soon",
    phase: "later_native_processor",
    description: "Retouch controls are planned, but no outgoing camera processing is active in this build.",
    requiresNativeProcessor: true,
    intensity: { min: 0, max: 100, defaultValue: 35 },
  },
  {
    id: "clean-light-makeup",
    label: "Clean Light Makeup",
    category: "appearance_makeup",
    status: "coming_soon",
    phase: "later_native_processor",
    description: "Makeup looks require a real camera processor before they can affect live video.",
    requiresNativeProcessor: true,
    intensity: { min: 0, max: 100, defaultValue: 30 },
  },
  {
    id: "party-warp",
    label: "Party Warp",
    category: "distortion_funny",
    status: "coming_soon",
    phase: "later_native_processor",
    description: "Funny distortion effects are reserved for a later effects engine.",
    requiresNativeProcessor: true,
    intensity: { min: 0, max: 100, defaultValue: 45 },
  },
  {
    id: "future-age",
    label: "Future Age",
    category: "ai_aging",
    status: "coming_soon",
    phase: "later_native_processor",
    description: "AI age-style effects need an approved model, consent rules, and processing path.",
    requiresNativeProcessor: true,
  },
  {
    id: "red-carpet-glam",
    label: "Red Carpet Glam",
    category: "glam_signature",
    status: "coming_soon",
    phase: "later_native_processor",
    description: "Signature looks are designed here, but not applied to camera output yet.",
    requiresNativeProcessor: true,
    intensity: { min: 0, max: 100, defaultValue: 40 },
  },
  {
    id: "mirror-check",
    label: "Mirror Check",
    category: "mirror_invert",
    status: "coming_soon",
    phase: "later_native_processor",
    description: "Mirror and invert tools must be wired to the local preview or outgoing track before launch.",
    requiresNativeProcessor: true,
  },
  {
    id: "face-card-frame",
    label: "Face-card Frame",
    category: "novelty_face_card",
    status: "coming_soon",
    phase: "later_native_processor",
    description: "Novelty scan-style framing is planned without ratings or sensitive-trait claims.",
    requiresNativeProcessor: true,
  },
];

export const getLiveEffectById = (effectId: string | null | undefined): LiveEffectItem => {
  const normalizedEffectId = String(effectId ?? "").trim();
  return LIVE_EFFECT_ITEMS.find((effect) => effect.id === normalizedEffectId) ?? LIVE_EFFECT_ITEMS[0];
};

export const isLiveEffectSelectable = (effect: LiveEffectItem) => effect.status !== "disabled";

export const isLiveEffectAppliedToCamera = (effect: LiveEffectItem) => (
  effect.status === "available" && effect.id !== LIVE_EFFECT_OFF_ID
);

export const getLiveEffectStatusLabel = (effect: LiveEffectItem) => {
  if (effect.id === LIVE_EFFECT_OFF_ID) return "Active";
  if (effect.status === "available") return "Available";
  if (effect.status === "preview_only") return "Preview only";
  if (effect.status === "disabled") return "Disabled";
  return "Coming soon";
};

export const getLiveEffectStatusCopy = (effect: LiveEffectItem) => {
  if (effect.id === LIVE_EFFECT_OFF_ID) {
    return "No camera effect is active.";
  }
  if (effect.status === "available") {
    return "This effect can be applied only after its real processor is wired.";
  }
  if (effect.status === "preview_only") {
    return "Preview-only effects do not change the outgoing LiveKit camera track.";
  }
  if (effect.status === "disabled") {
    return "This effect is disabled for this room or device.";
  }
  return "This effect is planned and is not applied to live camera output in this build.";
};
