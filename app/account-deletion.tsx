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

      <LegalSection title="Legal and Backend Review Status">
        <LegalParagraph>
          This account deletion page is draft launch-readiness language. Final deletion, de-identification, retention, support, and backend handling rules require attorney/legal and backend owner approval before public launch.
        </LegalParagraph>
      </LegalSection>

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
            "Your Channel surface and creator-upload ownership may be removed, unpublished, or de-identified where the current backend and legal process allow it.",
            "Access to Chi'lly Chat, profiles, room participation, and related account-linked features may be removed.",
            "Normal access to account-level settings and social functionality tied to that account may stop.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Account Surfaces Reviewed During Deletion">
        <LegalParagraph>
          A deletion request may involve account records across Profile, Channel, creator uploads, Chi&apos;lly Chat, Watch-Party rooms, Live Stage participation, support, billing, and moderation systems.
        </LegalParagraph>
        <LegalList
          items={[
            "Profile and Channel information may be deleted or de-identified where possible.",
            "Creator-uploaded videos may be deleted, unpublished, disconnected from the account, or retained only where legal, safety, copyright, or abuse-review obligations require it.",
            "Chi'lly Chat messages and room participation records may be deleted, de-identified, or retained in limited form when needed for safety, abuse prevention, legal compliance, or another user's conversation context.",
            "Watch-Party and Live Stage room records may be retained or de-identified for security, abuse prevention, audit, or service integrity.",
            "Billing, subscription, refund, chargeback, accounting, or entitlement records may need to be retained for financial, legal, tax, fraud-prevention, or platform compliance reasons.",
            "Moderation reports, takedown records, abuse reports, and admin safety actions may be retained when needed to protect users and enforce the rules.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Profile, Channel, and Uploaded Video Handling">
        <LegalParagraph>
          Final handling for Profile data, Channel data, uploaded videos, creator-video storage objects, thumbnails, comments, messages, reports, room records, and related metadata still needs legal and backend approval. Chi&apos;llywood should not claim a specific deletion method, timing, or permanent purge path until that process is fully approved and proved.
        </LegalParagraph>
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
            "Information needed for dispute resolution, chargebacks, refunds, or enforcement of terms and policies.",
            "Financial, tax, accounting, or billing records if applicable.",
            "Backup, logging, or security integrity data for a limited period.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Subscriptions and External Purchases">
        <LegalParagraph>
          Requesting deletion from Chi&apos;llywood does not itself guarantee cancellation of a subscription or purchase managed by an app store or billing provider. If Premium or paid access is active, you may need to cancel or manage that subscription through the store account or billing provider used for the purchase.
        </LegalParagraph>
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
