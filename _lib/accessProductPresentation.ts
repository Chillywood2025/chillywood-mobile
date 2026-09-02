export type CreatorAccessProductType =
  | "watch_party_live_ticket"
  | "live_watch_party_access_pass"
  | "live_watch_party_seat_pass"
  | "event_pass";

export type CreatorAccessProductPresentation = {
  publicName: string;
  purchaseTitle: string;
  purchaseBody: string;
  creatorMeaning: string;
};

export const CREATOR_ACCESS_PRODUCT_PRESENTATIONS: Readonly<
  Record<CreatorAccessProductType, CreatorAccessProductPresentation>
> = Object.freeze({
  watch_party_live_ticket: Object.freeze({
    publicName: "Party Room Pass",
    purchaseTitle: "Party Room Pass active",
    purchaseBody: "You're cleared to enter this Party Room.",
    creatorMeaning: "Charge for entry to this exact Party Room.",
  }),
  live_watch_party_access_pass: Object.freeze({
    publicName: "Live Stage Pass",
    purchaseTitle: "Live Stage Pass active",
    purchaseBody: "You can watch/listen to this Live Stage.",
    creatorMeaning: "Charge viewers to watch/listen to this exact Live Stage.",
  }),
  live_watch_party_seat_pass: Object.freeze({
    publicName: "Live Stage Seat Pass",
    purchaseTitle: "Live Stage Seat Pass active",
    purchaseBody: "You're eligible for a speaking seat. Host approval is still required.",
    creatorMeaning: "Charge for speaking-seat eligibility on this exact Live Stage.",
  }),
  event_pass: Object.freeze({
    publicName: "Event Pass",
    purchaseTitle: "Event Pass active",
    purchaseBody: "You have access to this Event.",
    creatorMeaning: "Charge for access to this exact Event.",
  }),
});

export const isCreatorAccessProductType = (value: unknown): value is CreatorAccessProductType => (
  typeof value === "string"
  && Object.prototype.hasOwnProperty.call(CREATOR_ACCESS_PRODUCT_PRESENTATIONS, value)
);

export const getCreatorAccessProductPresentation = (value: unknown) => (
  isCreatorAccessProductType(value) ? CREATOR_ACCESS_PRODUCT_PRESENTATIONS[value] : null
);

export const getCreatorAccessProductPublicName = (value: unknown) => (
  getCreatorAccessProductPresentation(value)?.publicName ?? null
);
