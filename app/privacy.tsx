import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const TODAY = "April 11, 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Legal"
      title="Privacy Policy"
      subtitle="How Chi'llywood collects, uses, shares, retains, and protects information across account, profile, chat, call, watch-party, live, support, and moderation features."
    >
      <LegalMeta label="Effective Date" value={TODAY} />
      <LegalMeta label="Last Updated" value={TODAY} />

      <LegalSection title="1. Scope">
        <LegalParagraph>
          This Privacy Policy applies to information we collect through the Chi&apos;llywood app, related support flows, and associated services.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Eligibility and Age Requirement">
        <LegalParagraph>
          Chi&apos;llywood is intended only for adults age 18 and older. If you are under 18, you may not use the Service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="3. Information We Collect">
        <LegalParagraph>We may collect the following categories of information:</LegalParagraph>
        <LegalList
          items={[
            "Account and profile information, including email address, sign-in information, username, display name, profile details, and account settings.",
            "Content and activity information, including Chi'lly Chat messages, call and room participation data, title/player interactions, support submissions, and moderation reports.",
            "Device and technical information, including device characteristics, app version, runtime information, crash or error information, and diagnostics.",
            "Safety, moderation, and integrity information relevant to abuse prevention, fraud prevention, reports, access control, and security review.",
            "Limited purchase or entitlement information if paid access becomes available on a particular device, account, or path.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. How We Use Information">
        <LegalList
          items={[
            "Create, maintain, and secure accounts.",
            "Operate profiles, messaging, calling, watch-party, live/social, and playback-related features.",
            "Deliver and maintain Chi'lly Chat threads, calls, and related room functionality.",
            "Respond to support requests, feedback, moderation reports, and account-deletion requests.",
            "Review reports and enforce our rules, moderation standards, and safety processes.",
            "Detect, investigate, and prevent abuse, fraud, unauthorized access, and other harmful behavior.",
            "Debug, maintain, and improve the Service.",
            "Communicate with you about account, support, safety, legal, or service matters.",
            "Comply with legal obligations and protect the rights, safety, and integrity of Chi'llywood, our users, and others.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Social, Chat, Call, and Live Feature Implications">
        <LegalList
          items={[
            "Information you choose to share in profiles, threads, rooms, or live/social features may be visible to other users depending on the feature and context.",
            "Direct threads, invite flows, room participation, and live/social activity may generate metadata needed to operate those features.",
            "Calls, room state, and participation data may be processed to establish, maintain, and troubleshoot communications.",
            "Messages, reports, and room activity may be reviewed or retained when needed for safety, moderation, abuse prevention, or legal compliance.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. How We Share Information">
        <LegalList
          items={[
            "With service providers that help us host, authenticate, support, analyze, monitor, or operate the Service.",
            "With communications or infrastructure providers needed to support calling, messaging, media delivery, and app operation.",
            "With moderation, legal, or safety reviewers where necessary to investigate reports, enforce rules, or protect the Service.",
            "If required by law, regulation, legal process, or government request.",
            "In connection with a merger, acquisition, financing, reorganization, sale of assets, or similar transaction.",
            "To protect rights, safety, security, and integrity.",
          ]}
        />
        <LegalParagraph>We do not state here that Chi&apos;llywood sells personal information.</LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Third-Party Services">
        <LegalParagraph>
          Chi&apos;llywood may rely on third-party vendors and infrastructure providers to operate the Service. Based on current product truth, these may include providers involved in authentication and backend infrastructure, app hosting and delivery, communications and real-time connection infrastructure, crash or runtime monitoring, and payment or access infrastructure if and when paid-access features are available on a given path.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="8. Data Retention">
        <LegalParagraph>
          We retain information for as long as reasonably necessary to provide and maintain the Service, support messaging, room, profile, and account functionality, investigate safety, fraud, abuse, or moderation issues, comply with legal obligations, resolve disputes, and enforce agreements.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. Account Deletion Requests">
        <LegalParagraph>
          Chi&apos;llywood provides a public account deletion page for launch. When you submit a valid deletion request, we may delete or de-identify certain account and profile information, subject to information we may retain for legal compliance, security and fraud prevention, abuse or moderation investigations, financial or billing recordkeeping if applicable, and enforcement of our rules and protection of the Service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="10. Your Choices">
        <LegalList
          items={[
            "Review or update some profile and account information.",
            "Contact support with privacy questions.",
            "Request account deletion through the public deletion page.",
          ]}
        />
      </LegalSection>

      <LegalSection title="11. Security">
        <LegalParagraph>
          We use reasonable administrative, technical, and organizational measures intended to protect information. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="12. International Use">
        <LegalParagraph>
          If Chi&apos;llywood is made available across jurisdictions, your information may be processed in countries other than where you live. Those countries may have data protection rules different from your jurisdiction.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="13. Changes to This Privacy Policy">
        <LegalParagraph>
          We may update this Privacy Policy from time to time. We will update the “Last Updated” date and may provide additional notice when appropriate.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="14. Contact Us">
        <LegalParagraph>For privacy questions, support, or account-related requests, contact:</LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>chillywood92@gmail.com</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
