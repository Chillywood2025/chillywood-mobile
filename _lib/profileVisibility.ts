export type ProfileVisibility = "everyone" | "chilly_circle_only" | "private";

export const PROFILE_VISIBILITY_OPTIONS: readonly {
  value: ProfileVisibility;
  label: string;
  description: string;
}[] = [
  {
    value: "everyone",
    label: "Everyone",
    description: "Your public profile behaves the way it does today.",
  },
  {
    value: "chilly_circle_only",
    label: "Chi'lly Circle Only",
    description: "Only accepted Chi'lly Circle connections can see your full profile.",
  },
  {
    value: "private",
    label: "Private",
    description: "Only you can see your full profile.",
  },
];

export const normalizeProfileVisibility = (value: unknown): ProfileVisibility => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "chilly_circle_only" || normalized === "circle_only" || normalized === "friends_only") {
    return "chilly_circle_only";
  }
  if (normalized === "private") return "private";
  return "everyone";
};

export const getProfileVisibilityLabel = (value: unknown) => {
  const visibility = normalizeProfileVisibility(value);
  return PROFILE_VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.label ?? "Everyone";
};
