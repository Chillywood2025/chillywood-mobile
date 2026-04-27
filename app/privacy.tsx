import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const EFFECTIVE_DATE = "April 11, 2026";
const LAST_UPDATED = "April 27, 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Legal"
      title="Privacy Policy"
      subtitle="How Chi'llywood collects, uses, shares, retains, and protects information across accounts, Profile, Channel, creator uploads, Player, Watch-Party, Live, Chi'lly Chat, support, billing, and moderation."
    >
      <LegalMeta label="Effective Date" value={EFFECTIVE_DATE} />
      <LegalMeta label="Last Updated" value={LAST_UPDATED} />

      <LegalSection title="Legal Review Status">
        <LegalParagraph>
          This Privacy Policy is draft launch-readiness language. It is not final legal advice and must be reviewed by an attorney/privacy owner before public launch. Google Play Data Safety answers, public hosted URLs, and SDK/provider disclosures must match the final release build.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="1. Scope">
        <LegalParagraph>
          This Privacy Policy explains how Chi&apos;llywood may collect, use, share, retain, and protect information through the Chi&apos;llywood app, related support flows, hosted legal pages, backend services, billing/entitlement surfaces, diagnostics, and associated services.
        </LegalParagraph>
        <LegalParagraph>
          Chi&apos;llywood is a user-generated-content app. Users can create Profiles and Channels, upload creator videos, watch content, use Watch-Party and Live rooms, message through Chi&apos;lly Chat, report abuse, and interact with Premium or subscription surfaces where configured.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Eligibility and Minor Safety">
        <LegalParagraph>
          Chi&apos;llywood is intended only for adults age 18 and older. If you are under 18, you may not use the Service. Final target-audience, age-gating, and store-disclosure language must be approved before public launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="3. Information You Provide">
        <LegalList
          items={[
            "Account information such as email address, authentication identifiers, password credentials handled by the authentication provider, and account settings.",
            "Profile and Channel information such as display name, username, bio, images, creator/channel details, audience relationships, and public identity settings.",
            "Creator uploaded videos and media metadata such as selected video files, titles, descriptions, visibility, thumbnails or thumbnail URLs, categories, upload status, creator id, and related storage metadata.",
            "Messages, support requests, report text, feedback, copyright notices, counter-notice information, moderation notes, and other text you send through the app.",
            "Premium, subscription, restore, entitlement, and billing-support information needed to operate paid access where configured.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Content, Chat, and Room Activity">
        <LegalList
          items={[
            "Chi'lly Chat messages and thread metadata may be collected to deliver direct messaging, room-linked coordination, and support handoff behavior.",
            "Watch-Party room records, room codes, participant membership, host identity, playback source type, playback source id, and playback state may be collected to operate shared viewing.",
            "Live Room and Live Stage activity may include participant identity, room membership, role, camera/microphone permission state, token request metadata, and connection state needed to operate real-time media.",
            "Profile, Channel, creator-video, player, title, comment/reaction where backed, report, and support activity may be collected for product operation, safety, moderation, and integrity.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Device Permissions and Selected Files">
        <LegalList
          items={[
            "Camera and microphone permissions are used for Live Stage, live room, or communication features when you choose to use those features.",
            "The file picker is used when you choose a video file for creator upload. Chi'llywood should not claim broad device-library scanning based on current repo truth.",
            "Internet/network access, device/app information, app version, runtime environment, and diagnostics may be processed to operate the app and troubleshoot issues.",
            "Notifications/reminders may be supported or expanded later. Do not treat push delivery as proved until release proof confirms it.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Diagnostics, Crash, Performance, and Analytics">
        <LegalParagraph>
          Chi&apos;llywood may collect crash reports, non-fatal errors, performance traces, app startup data, route/event analytics, device/app information, and runtime diagnostics to keep the app stable and improve launch quality.
        </LegalParagraph>
        <LegalParagraph>
          Firebase Crashlytics, Firebase Performance, Firebase Analytics, or related Firebase services may be used if enabled in the release build. Final Privacy and Google Play Data Safety entries must match the actual SDK configuration used in production.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. How We Use Information">
        <LegalList
          items={[
            "Create, maintain, authenticate, and secure accounts.",
            "Operate Profile, Channel, creator upload, Player, Watch-Party, Live, Chi'lly Chat, support, Premium, and moderation features.",
            "Store and display creator-uploaded videos according to visibility, moderation, ownership, access, and playback rules.",
            "Deliver messages, room membership, playback sync, live media sessions, and support workflows.",
            "Process reports, copyright notices, account deletion requests, support tickets, and safety escalations.",
            "Detect, investigate, and prevent abuse, fraud, unauthorized access, copyright abuse, harassment, spam, malware, and other harmful behavior.",
            "Verify Premium or subscription entitlements where configured.",
            "Debug, monitor, analyze, maintain, and improve the Service.",
            "Comply with legal obligations and protect the rights, safety, and integrity of Chi'llywood, users, rights holders, service providers, and others.",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Service Providers and Infrastructure">
        <LegalParagraph>
          Chi&apos;llywood may rely on service providers and infrastructure providers to operate the Service. Based on current Public v1 architecture, categories may include:
        </LegalParagraph>
        <LegalList
          items={[
            "Supabase for authentication, database, storage, edge functions, RLS-backed access control, creator videos, reports, and related backend services.",
            "Firebase/Google for Crashlytics, Performance Monitoring, Analytics, Remote Config, or Android app configuration where enabled.",
            "RevenueCat and Google Play for Premium/subscription products, restore flows, entitlement state, purchase management, and billing support where configured.",
            "LiveKit for real-time audio/video rooms, Live Stage, camera/microphone transport, participant media, and connection state.",
            "Expo/EAS for app build, updates, delivery, development/release infrastructure, and related runtime configuration.",
            "Email, support, legal, moderation, security, or hosting providers if used to respond to users, operate public legal pages, or protect the Service.",
          ]}
        />
      </LegalSection>

      <LegalSection title="9. How Information May Be Shared">
        <LegalList
          items={[
            "With service providers that help us host, authenticate, store, deliver, support, monitor, bill, analyze, secure, or operate the Service.",
            "With other users when you intentionally make information visible through Profile, Channel, public creator videos, Watch-Party rooms, Live rooms, Chi'lly Chat, comments/reactions where backed, or other social features.",
            "With moderation, support, legal, copyright, or safety reviewers where necessary to investigate reports, enforce rules, process account deletion, or protect the Service.",
            "With billing providers, app stores, or entitlement services when Premium or subscription features are configured.",
            "If required by law, legal process, rights-holder process, government request, safety emergency, or to protect rights, safety, security, and integrity.",
            "In connection with a merger, acquisition, financing, reorganization, sale of assets, or similar transaction.",
          ]}
        />
        <LegalParagraph>
          We do not state here that Chi&apos;llywood sells personal information. Final sale/share/ad-tracking wording requires legal and SDK review before launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="10. Public Visibility and User Choices">
        <LegalList
          items={[
            "Profile and Channel surfaces may be visible to other users depending on current product settings and public/private visibility rules.",
            "Public creator videos may be visible and playable by public viewers where backend visibility and moderation rules allow.",
            "Draft, private, unpublished, hidden, removed, or blocked content should not be represented as publicly available.",
            "Messages and rooms may be visible to participants, hosts, support, or moderation roles depending on the surface and safety need.",
            "You can review or update some account, Profile, Channel, and creator upload information through the app where current features support it.",
          ]}
        />
      </LegalSection>

      <LegalSection title="11. Data Retention">
        <LegalParagraph>
          We retain information for as long as reasonably necessary to provide, maintain, secure, and improve the Service; operate accounts, Profile, Channel, creator uploads, playback, messaging, rooms, support, billing, and moderation; investigate safety, fraud, abuse, copyright, or security issues; comply with legal obligations; resolve disputes; and enforce agreements.
        </LegalParagraph>
        <LegalParagraph>
          Retention periods may vary by data type, account status, feature, legal requirement, support request, safety report, billing event, copyright notice, backup, log, or audit need.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="12. Account Deletion Requests">
        <LegalParagraph>
          Chi&apos;llywood provides a public account deletion page for launch. When you submit a valid deletion request, we may delete or de-identify certain account, Profile, Channel, uploaded-video, and account-linked information, subject to verification and retained-record exceptions.
        </LegalParagraph>
        <LegalParagraph>
          Some records may be retained where legally required or reasonably needed for fraud prevention, security, billing, subscription management, chargebacks, refunds, accounting, tax, moderation, copyright, abuse review, legal compliance, support history, dispute resolution, or backup/log integrity.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="13. Subscriptions and Billing Records">
        <LegalParagraph>
          If Premium or subscription features are active, billing and entitlement information may be processed by Google Play, RevenueCat, Supabase, or related service providers. Account deletion from Chi&apos;llywood may not automatically cancel a subscription managed by an app store or billing provider.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="14. Security">
        <LegalParagraph>
          We use reasonable administrative, technical, and organizational measures intended to protect information. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="15. International Processing">
        <LegalParagraph>
          If Chi&apos;llywood is made available across jurisdictions, information may be processed in countries other than where you live. Those countries may have data protection rules different from your jurisdiction. Final international transfer wording requires legal review.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="16. Changes to This Privacy Policy">
        <LegalParagraph>
          We may update this Privacy Policy from time to time. We will update the Last Updated date and may provide additional notice when appropriate.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="17. Contact">
        <LegalParagraph>For privacy questions, support, account deletion, or legal requests, contact:</LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>chillywood92@gmail.com</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
