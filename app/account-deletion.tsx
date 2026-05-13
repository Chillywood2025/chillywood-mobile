import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const EFFECTIVE_DATE = "April 11, 2026";
const LAST_UPDATED = "May 13, 2026";

export default function AccountDeletionPage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Legal"
      title="Account Deletion"
      subtitle="How to request deletion of a Chi'llywood account, what may be deleted, what may be retained, and how support handles account deletion requests."
    >
      <LegalMeta label="Effective Date" value={EFFECTIVE_DATE} />
      <LegalMeta label="Last Updated" value={LAST_UPDATED} />

      <LegalSection title="About Account Deletion">
        <LegalParagraph>
          Chi&apos;llywood currently uses a request-based account deletion flow. This page explains how to start a deletion request, what the request may affect, and why some records may be retained.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="1. Current Deletion Status">
        <LegalParagraph>
          Chi&apos;llywood provides a public account deletion information page and support handoff. This page does not instantly delete an account or run destructive backend deletion from the app.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. How to Request Deletion">
        <LegalList
          items={[
            "Open the account deletion page from Settings or a public legal/support link.",
            "Use the configured account deletion URL if a final public URL is available.",
            "If a self-serve portal is not yet available, contact Chi'llywood Support from the signed-in account or email the support contact listed below.",
            "Provide enough information for Chi'llywood to verify account ownership and process the request safely.",
          ]}
        />
        <LegalParagraph>
          If you need help with the deletion process, contact Chi&apos;llywood Support at support@chillywoodstream.com.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="3. Identity Verification">
        <LegalParagraph>
          Chi&apos;llywood may ask you to verify account ownership before processing a deletion request. Verification protects users from unauthorized deletion requests and helps ensure that the correct account, Profile, Channel, uploads, messages, and related records are reviewed.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="4. What May Be Deleted or De-Identified">
        <LegalList
          items={[
            "Account identity information and account-linked settings.",
            "Profile and Channel information where legally and technically allowed.",
            "Creator-uploaded videos, creator-video metadata, thumbnails, storage objects, and Channel listing records where legally and technically allowed.",
            "Certain support history linked directly to the account.",
            "Certain social/profile-facing content tied directly to the account.",
            "Certain notification, reminder, audience, and account preference records where legally and technically allowed.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Profile, Channel, and Creator Upload Effects">
        <LegalParagraph>
          A deletion request may affect your public Profile, Channel, uploaded videos, uploaded-video metadata, storage paths, thumbnails, creator ownership, and public Channel presentation.
        </LegalParagraph>
        <LegalParagraph>
          Depending on the account, uploaded videos may be deleted, unpublished, disconnected from the account, de-identified, hidden from public surfaces, or retained only where legal, safety, copyright, moderation, or compliance obligations require it.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="6. Chat, Watch-Party, Live, and Social Records">
        <LegalList
          items={[
            "Chi'lly Chat messages may be deleted, de-identified, or retained in limited form when needed for another user's conversation context, safety, abuse review, or legal compliance.",
            "Watch-Party and Live Stage records may be retained or de-identified for security, abuse prevention, room integrity, rejoin/recovery, audit, or service reliability.",
            "Reports, moderation records, and admin safety actions may be retained when needed to protect users, enforce rules, or respond to legal/copyright issues.",
            "Content previously shared with other users may not disappear from every context immediately, and deletion may not instantly remove all information from backups or archived systems.",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. What May Be Retained">
        <LegalList
          items={[
            "Information needed for legal compliance, lawful requests, or regulatory obligations.",
            "Information needed for fraud prevention, security, abuse prevention, account-integrity review, or platform-protection reasons.",
            "Moderation, safety, copyright, DMCA, takedown, repeat-violation, and admin investigation records.",
            "Information needed for dispute resolution, chargebacks, refunds, subscription management, or enforcement of terms and policies.",
            "Financial, tax, accounting, billing, entitlement, or transaction records if applicable.",
            "Backup, logging, diagnostic, crash, performance, or security integrity data for a limited period.",
            "Records needed to prevent banned, abusive, fraudulent, or legally restricted accounts from immediately returning.",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Premium, Subscriptions, and Purchases">
        <LegalParagraph>
          Requesting deletion from Chi&apos;llywood does not itself guarantee cancellation of a subscription or purchase managed by Google Play, RevenueCat, an app store, or another billing provider. If Premium or paid access is active, you may need to cancel or manage that subscription through the store account or billing provider used for purchase.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. Timeline Placeholder">
        <LegalParagraph>
          Deletion timing may vary depending on account verification, support queue capacity, legal or safety review, billing/subscription status, copyright/moderation holds, backup cycles, and technical processing time across systems.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="10. No Instant In-App Deletion">
        <LegalParagraph>
          A fully automated deletion portal may be added later. Until that exists, deletion is handled through a verified request and support process.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="11. Backend Systems That Need an Approved Runbook">
        <LegalList
          items={[
            "Supabase Auth account records.",
            "User Profile and Channel rows.",
            "Creator videos, thumbnails, metadata, and `creator-videos` storage objects.",
            "Chi'lly Chat threads, members, messages, and communication-room records.",
            "Watch-Party rooms, memberships, playback state, and Live Stage records.",
            "Premium entitlement, billing event, subscription, refund, and chargeback records.",
            "Safety reports, moderation actions, copyright notices, admin audit records, notifications, reminders, logs, backups, and diagnostics.",
          ]}
        />
      </LegalSection>

      <LegalSection title="12. Support Contact">
        <LegalParagraph>For account deletion help or status questions, contact:</LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>support@chillywoodstream.com</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
