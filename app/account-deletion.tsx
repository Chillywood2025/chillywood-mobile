import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const TODAY = "April 11, 2026";

export default function AccountDeletionPage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Legal"
      title="Account Deletion"
      subtitle="How to request permanent deletion of a Chi'llywood account, what may be deleted, and what may need to be retained."
    >
      <LegalMeta label="Effective Date" value={TODAY} />
      <LegalMeta label="Last Updated" value={TODAY} />

      <LegalSection title="How to Request Deletion">
        <LegalParagraph>
          To request deletion of your Chi&apos;llywood account, use the public account deletion page linked from Chi&apos;llywood&apos;s legal and account surfaces.
        </LegalParagraph>
        <LegalParagraph>
          If you need help with the deletion process, contact Chi&apos;llywood Support at chillywood92@gmail.com.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="Is Deletion Self-Serve?">
        <LegalParagraph>
          For launch, Chi&apos;llywood uses a real public deletion page for account deletion requests. Support remains available if you need help submitting or completing the request.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="What Happens When You Request Deletion">
        <LegalList
          items={[
            "Your account may be disabled or closed.",
            "Profile information associated with your account may be removed or de-identified.",
            "Access to Chi'lly Chat, profiles, room participation, and related account-linked features may be removed.",
            "Normal access to account-level settings and social functionality tied to that account may stop.",
          ]}
        />
      </LegalSection>

      <LegalSection title="What May Be Deleted">
        <LegalList
          items={[
            "Account identity and profile information.",
            "Account-linked settings and preferences.",
            "Certain support history linked to the account.",
            "Some social or profile-facing content tied directly to the account.",
          ]}
        />
      </LegalSection>

      <LegalSection title="What May Be Retained">
        <LegalList
          items={[
            "Information needed for legal compliance.",
            "Information needed for fraud prevention or abuse prevention.",
            "Moderation and safety investigation records.",
            "Information needed for dispute resolution or enforcement of terms and policies.",
            "Financial, tax, accounting, or billing records if applicable.",
            "Backup, logging, or security integrity data for a limited period.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Messages, Calls, Rooms, and Social Data">
        <LegalParagraph>
          Because Chi&apos;llywood includes messaging, calls, profiles, watch-party, and live/social features, some activity records, reports, or moderation-related records may need to be retained for safety, abuse, or legal reasons. Some content previously shared with other users may not disappear from every context immediately, and deletion may not instantly remove all information from backups or archived systems.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="Verification">
        <LegalParagraph>
          Chi&apos;llywood may ask you to verify account ownership before processing a deletion request. This helps protect users against unauthorized deletion requests.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="Timing">
        <LegalParagraph>
          Deletion timing may vary depending on account verification, legal or safety review requirements, and technical processing time across systems and backups.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="Need Help?">
        <LegalParagraph>If you need help requesting deletion or checking the status of a request, contact:</LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>chillywood92@gmail.com</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
