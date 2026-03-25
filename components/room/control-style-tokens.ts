import type { TextStyle } from "react-native";

import type {
    RoomFooterControlRowStyles,
    RoomReactionChipRowStyles,
} from "./control-primitives";

type FontWeightToken = NonNullable<TextStyle["fontWeight"]>;

export type FooterControlSizeVariant = "compact" | "regular";
export type FooterControlSurfaceVariant = "glass" | "soft";

export type FooterControlTokens = {
  rowGap: number;
  actionRadius: number;
  actionBorderWidth: number;
  actionBorderColor: string;
  actionBackgroundColor: string;
  actionIconFontSize: number;
  actionIconFontWeight: FontWeightToken;
  actionLabelFontSize: number;
  actionLabelFontWeight: FontWeightToken;
  quickRowGap: number;
  quickRadius: number;
  quickBorderWidth: number;
  quickBorderColor: string;
  quickBackgroundColor: string;
  quickTextFontSize: number;
  quickTextFontWeight: FontWeightToken;
};

const FOOTER_SIZE_TOKENS: Record<FooterControlSizeVariant, Omit<FooterControlTokens, "actionBorderColor" | "actionBackgroundColor" | "quickBorderColor" | "quickBackgroundColor">> = {
  compact: {
    rowGap: 4,
    actionRadius: 10,
    actionBorderWidth: 1,
    actionIconFontSize: 15,
    actionIconFontWeight: "900",
    actionLabelFontSize: 9.5,
    actionLabelFontWeight: "800",
    quickRowGap: 5,
    quickRadius: 17,
    quickBorderWidth: 1,
    quickTextFontSize: 15,
    quickTextFontWeight: "900",
  },
  regular: {
    rowGap: 6,
    actionRadius: 12,
    actionBorderWidth: 1,
    actionIconFontSize: 15,
    actionIconFontWeight: "900",
    actionLabelFontSize: 10,
    actionLabelFontWeight: "800",
    quickRowGap: 6,
    quickRadius: 18,
    quickBorderWidth: 1,
    quickTextFontSize: 16,
    quickTextFontWeight: "900",
  },
};

const FOOTER_SURFACE_TOKENS: Record<FooterControlSurfaceVariant, Pick<FooterControlTokens, "actionBorderColor" | "actionBackgroundColor" | "quickBorderColor" | "quickBackgroundColor">> = {
  glass: {
    actionBorderColor: "rgba(255,255,255,0.12)",
    actionBackgroundColor: "rgba(0,0,0,0.36)",
    quickBorderColor: "rgba(255,255,255,0.14)",
    quickBackgroundColor: "rgba(0,0,0,0.32)",
  },
  soft: {
    actionBorderColor: "rgba(255,255,255,0.11)",
    actionBackgroundColor: "rgba(255,255,255,0.05)",
    quickBorderColor: "rgba(255,255,255,0.12)",
    quickBackgroundColor: "rgba(255,255,255,0.06)",
  },
};

export function buildFooterControlTokens(options?: {
  size?: FooterControlSizeVariant;
  surface?: FooterControlSurfaceVariant;
}): FooterControlTokens {
  const size = options?.size ?? "compact";
  const surface = options?.surface ?? "glass";
  return {
    ...FOOTER_SIZE_TOKENS[size],
    ...FOOTER_SURFACE_TOKENS[surface],
  };
}

export function mapFooterControlRowStyles(
  base: RoomFooterControlRowStyles,
  tokens: FooterControlTokens,
): RoomFooterControlRowStyles {
  return {
    row: [base.row, { gap: tokens.rowGap }],
    actionButton: [
      base.actionButton,
      {
        borderRadius: tokens.actionRadius,
        borderWidth: tokens.actionBorderWidth,
        borderColor: tokens.actionBorderColor,
        backgroundColor: tokens.actionBackgroundColor,
      },
    ],
    actionButtonDisabled: base.actionButtonDisabled,
    actionIconText: [
      base.actionIconText,
      { fontSize: tokens.actionIconFontSize, fontWeight: tokens.actionIconFontWeight },
    ],
    actionLabelText: [
      base.actionLabelText,
      { fontSize: tokens.actionLabelFontSize, fontWeight: tokens.actionLabelFontWeight },
    ],
    quickRow: base.quickRow ? [base.quickRow, { gap: tokens.quickRowGap }] : undefined,
    quickChip: base.quickChip
      ? [
          base.quickChip,
          {
            borderRadius: tokens.quickRadius,
            borderWidth: tokens.quickBorderWidth,
            borderColor: tokens.quickBorderColor,
            backgroundColor: tokens.quickBackgroundColor,
          },
        ]
      : undefined,
    quickChipDisabled: base.quickChipDisabled,
    quickChipText: base.quickChipText
      ? [
          base.quickChipText,
          { fontSize: tokens.quickTextFontSize, fontWeight: tokens.quickTextFontWeight },
        ]
      : undefined,
  };
}

export type ReactionChipSizeVariant = "quick" | "panel";
export type ReactionChipSurfaceVariant = "glass" | "soft";

export type ReactionChipTokens = {
  rowGap: number;
  chipSize: number;
  chipRadius: number;
  chipBorderWidth: number;
  chipBorderColor: string;
  chipBackgroundColor: string;
  chipTextFontSize: number;
  chipTextFontWeight: FontWeightToken;
};

const REACTION_SIZE_TOKENS: Record<ReactionChipSizeVariant, Omit<ReactionChipTokens, "chipBorderColor" | "chipBackgroundColor">> = {
  quick: {
    rowGap: 5,
    chipSize: 34,
    chipRadius: 17,
    chipBorderWidth: 1,
    chipTextFontSize: 15,
    chipTextFontWeight: "900",
  },
  panel: {
    rowGap: 10,
    chipSize: 48,
    chipRadius: 24,
    chipBorderWidth: 1,
    chipTextFontSize: 22,
    chipTextFontWeight: "400",
  },
};

const REACTION_SURFACE_TOKENS: Record<ReactionChipSurfaceVariant, Pick<ReactionChipTokens, "chipBorderColor" | "chipBackgroundColor">> = {
  glass: {
    chipBorderColor: "rgba(255,255,255,0.14)",
    chipBackgroundColor: "rgba(0,0,0,0.32)",
  },
  soft: {
    chipBorderColor: "rgba(255,255,255,0.14)",
    chipBackgroundColor: "rgba(255,255,255,0.08)",
  },
};

export function buildReactionChipTokens(options?: {
  size?: ReactionChipSizeVariant;
  surface?: ReactionChipSurfaceVariant;
}): ReactionChipTokens {
  const size = options?.size ?? "quick";
  const surface = options?.surface ?? "glass";
  return {
    ...REACTION_SIZE_TOKENS[size],
    ...REACTION_SURFACE_TOKENS[surface],
  };
}

export function mapReactionChipRowStyles(
  base: RoomReactionChipRowStyles,
  tokens: ReactionChipTokens,
): RoomReactionChipRowStyles {
  return {
    row: [base.row, { gap: tokens.rowGap }],
    chip: [
      base.chip,
      {
        width: tokens.chipSize,
        height: tokens.chipSize,
        borderRadius: tokens.chipRadius,
        borderWidth: tokens.chipBorderWidth,
        borderColor: tokens.chipBorderColor,
        backgroundColor: tokens.chipBackgroundColor,
      },
    ],
    chipDisabled: base.chipDisabled,
    chipText: [
      base.chipText,
      { fontSize: tokens.chipTextFontSize, fontWeight: tokens.chipTextFontWeight },
    ],
  };
}