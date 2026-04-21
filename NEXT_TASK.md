# NEXT TASK

## Exact Next Task
The public profile/channel access + audience surface audit is now closed cleanly on `main`. The next exact stage is `access surface polish` on `app/profile/[userId].tsx`: make the public access posture feel concise, premium, and public-safe by tightening the access summary, removing creator-side capability framing from the public card, and keeping current access truth honest without route or schema drift.

## Current Plan
1. Treat the access + audience audit as closed.
2. Tighten the public access card and access detail language first.
3. Remove creator-side capability bookkeeping from the public route while preserving backed access truth.
4. Move to audience posture polish only after the access batch is verified and pushed.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- make public access posture visible, concise, and premium
- reduce memo-like access explanation and creator-side terminology
- keep backed watch-party, communication, and official access truth honest
- keep creator/public and room/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]` as the canonical public profile/channel route
- focus on access presentation truth only on that owner
- leave completed account/support/chat/home/title route owners alone
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- add creator-console behavior to the public route
- invent route proliferation or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the public route's access posture reads clearly and confidently
- creator-side capability details no longer leak into public presentation
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
