# Accessibility Smoke Checklist

This is a QA checklist, not a redesign mandate. Fixes should be narrow selector/label/accessibility-prop changes only when backed by proof.

## Core Checks

- Primary CTAs have readable labels.
- Icon-only critical actions expose accessible names.
- Touch targets are comfortably tappable on small Android screens.
- Text does not overlap or clip at common font sizes.
- Dark UI contrast is readable for primary text, secondary text, buttons, and error copy.
- Keyboard avoids login fields, comment fields, and composer fields.
- Screen reader focus order is sane for login, Premium, Platform, Player, and Money flows.
- Loading/error/empty states announce useful state where backed.

## Route Focus

- Login: email, password, submit, error copy.
- Premium: restore/manage/purchase-safe CTAs and Premium status copy.
- Platform: owner mode controls versus viewer CTAs.
- Player: play/pause, report, share, Watch-Party entry, purchase-gated CTAs.
- Money Center/setup: offer cards, sandbox/not-payable labels, disabled payout copy.

## Must Not Happen

- Do not expose internal IDs, provider errors, or secrets through accessibility labels.
- Do not weaken gates to make focus easier.
- Do not replace product surfaces as part of smoke QA.
