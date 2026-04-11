import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const TODAY = "April 11, 2026";

export default function TermsOfServicePage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Legal"
      title="Terms of Service"
      subtitle="These Terms govern access to Chi'llywood’s account, profile, messaging, calling, watch-party, live/social, support, and related service features."
    >
      <LegalMeta label="Effective Date" value={TODAY} />
      <LegalMeta label="Last Updated" value={TODAY} />

      <LegalSection title="1. Eligibility">
        <LegalList
          items={[
            "You must be at least 18 years old.",
            "You must be legally able to enter into a binding agreement.",
            "You must not be prohibited from using the Service under applicable law or by prior suspension or removal from the Service.",
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Your Account">
        <LegalList
          items={[
            "You are responsible for providing accurate account information.",
            "You are responsible for maintaining the confidentiality of your credentials.",
            "You are responsible for activities that occur under your account.",
            "You must promptly notify Chi'llywood of unauthorized access or security concerns.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. The Service">
        <LegalParagraph>
          Chi&apos;llywood currently includes account creation and sign-in, profiles and channel-style identity surfaces, Chi&apos;lly Chat messaging and calling, watch-party and live/social participation features, content browsing, title detail, player-related experiences, and support, moderation, and reporting tools.
        </LegalParagraph>
        <LegalParagraph>
          Some features may be unavailable, limited, region-specific, account-specific, device-specific, or subject to staged rollout or future development.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="4. Acceptable Use">
        <LegalList
          items={[
            "Do not violate any law or regulation.",
            "Do not infringe or misappropriate intellectual property or other rights.",
            "Do not harass, threaten, stalk, exploit, or harm others.",
            "Do not upload, send, or share unlawful, abusive, defamatory, fraudulent, hateful, sexually exploitative, or otherwise objectionable content.",
            "Do not impersonate another person or misrepresent your identity, affiliation, or authority.",
            "Do not interfere with the Service, its security, or its integrity.",
            "Do not attempt unauthorized access to accounts, systems, rooms, threads, or data.",
            "Do not use bots, scraping, automation, or abusive traffic in a way that disrupts the Service.",
            "Do not use the Service to distribute malware, spam, or harmful code.",
            "Do not evade suspensions, restrictions, or moderation actions.",
            "Do not misuse reporting, support, or moderation systems.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. User Content">
        <LegalParagraph>
          You may submit, upload, send, or otherwise make available content through the Service, including profile information, messages, reports, room activity, and other materials.
        </LegalParagraph>
        <LegalParagraph>
          You retain whatever ownership rights you have in your content. But by submitting content through the Service, you grant Chi&apos;llywood a non-exclusive, worldwide, royalty-free license to host, store, reproduce, process, adapt, display, perform, distribute, and otherwise use that content as reasonably necessary to operate and provide the Service, support messaging, room, playback, and social features, moderate content and investigate reports, maintain safety, security, and integrity, and improve and support the Service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="6. Content, Rights, and Restrictions">
        <LegalParagraph>
          All rights in the Service, excluding user-owned content, belong to Chi&apos;llywood or its licensors. You may not copy, modify, reverse engineer, distribute, sell, lease, or exploit the Service except as permitted by law or by our written permission.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Moderation, Suspension, and Termination">
        <LegalParagraph>
          We may review content, accounts, rooms, threads, reports, and related activity to enforce these Terms, protect users, and maintain service integrity.
        </LegalParagraph>
        <LegalList
          items={[
            "We may remove content or restrict, suspend, or terminate access if we reasonably believe you violated these Terms or our rules.",
            "We may act if your conduct creates safety, legal, operational, or reputational risk.",
            "We may act if your account is involved in abuse, fraud, or unauthorized activity.",
            "We may act if required to do so by law or legal process.",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Paid Access, Premium, and Subscriptions">
        <LegalParagraph>
          Chi&apos;llywood may include premium, subscription, or paid-access surfaces. Availability may vary by device, account, feature, or rollout state.
        </LegalParagraph>
        <LegalParagraph>
          If paid access is offered to you, additional pricing, billing, renewal, and cancellation terms may apply at the point of purchase. These Terms do not promise that subscriptions, billing, or paid access are live on every path today.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. Feedback">
        <LegalParagraph>
          If you send feedback, suggestions, or ideas, you grant Chi&apos;llywood the right to use them without restriction or compensation to you, except where prohibited by law.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="10. Disclaimers">
        <LegalParagraph>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHI&apos;LLYWOOD DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
        </LegalParagraph>
        <LegalParagraph>
          We do not guarantee that the Service will be uninterrupted, error-free, secure, or available at all times, or that content or communications will never be lost, delayed, intercepted, or altered.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="11. Limitation of Liability">
        <LegalParagraph>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHI&apos;LLYWOOD AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, AND LICENSORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS.
        </LegalParagraph>
        <LegalParagraph>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHI&apos;LLYWOOD’S TOTAL LIABILITY FOR CLAIMS ARISING OUT OF OR RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF $100 OR THE AMOUNT YOU PAID TO CHI&apos;LLYWOOD FOR THE SERVICE IN THE 12 MONTHS BEFORE THE CLAIM AROSE.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="12. Indemnification">
        <LegalParagraph>
          To the maximum extent permitted by law, you agree to defend, indemnify, and hold harmless Chi&apos;llywood and its affiliates, officers, directors, employees, contractors, licensors, and service providers from claims, damages, liabilities, losses, costs, and expenses, including reasonable attorneys’ fees, arising out of or related to your use of the Service, your content, your violation of these Terms, or your violation of law or the rights of another person.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="13. Dispute Resolution">
        <LegalParagraph>
          If you have a dispute with Chi&apos;llywood, please contact us first at chillywood92@gmail.com so we can try to resolve it informally.
        </LegalParagraph>
        <LegalParagraph>
          If a dispute cannot be resolved informally, either party may bring the dispute in a court of competent jurisdiction, subject to the governing law and venue provisions below.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="14. Governing Law and Venue">
        <LegalParagraph>
          These Terms and any dispute arising out of or relating to these Terms or the Service will be governed by the laws of the State of Illinois, without regard to conflict-of-law rules.
        </LegalParagraph>
        <LegalParagraph>
          Any dispute arising out of or relating to these Terms or the Service must be brought exclusively in the state or federal courts located in Cook County, Illinois, and you and Chi&apos;llywood consent to that venue and jurisdiction, subject to applicable law.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="15. Changes to the Service or Terms">
        <LegalParagraph>
          We may modify the Service or these Terms from time to time. If we make material changes, we may provide notice by updating the date above, through the app, or by other appropriate means. Your continued use after updated Terms become effective means you accept the updated Terms.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="16. Contact">
        <LegalParagraph>For questions about these Terms, support, or legal requests, contact:</LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>chillywood92@gmail.com</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
