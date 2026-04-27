import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const EFFECTIVE_DATE = "April 11, 2026";
const LAST_UPDATED = "April 27, 2026";

export default function TermsOfServicePage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Legal"
      title="Terms of Service"
      subtitle="The account, Profile, Channel, creator upload, Watch-Party, Live, Chi'lly Chat, Premium, safety, and support rules for Chi'llywood."
    >
      <LegalMeta label="Effective Date" value={EFFECTIVE_DATE} />
      <LegalMeta label="Last Updated" value={LAST_UPDATED} />

      <LegalSection title="Legal Review Status">
        <LegalParagraph>
          These Terms are serious draft launch-readiness language for Chi&apos;llywood. They are not final legal advice, are not attorney-approved yet, and do not guarantee any legal outcome. Final wording, governing-law posture, liability language, indemnification, dispute process, and account/content enforcement details require legal review before public launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="1. Acceptance of Terms">
        <LegalParagraph>
          By creating an account, signing in, browsing, uploading, streaming, posting, messaging, joining a room, using Premium or billing-related surfaces, sending support feedback, or otherwise using Chi&apos;llywood, you agree to these Terms, the Privacy Policy, the Community Guidelines, and any feature-specific rules shown in the app.
        </LegalParagraph>
        <LegalParagraph>
          If you do not agree, do not create an account or use the Service. If you use Chi&apos;llywood on behalf of another person, organization, creator team, or legal entity, you represent that you have authority to accept these Terms for that party.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Eligibility and Account Responsibility">
        <LegalList
          items={[
            "You must be at least 18 years old.",
            "You must be legally able to enter into a binding agreement.",
            "You must not be prohibited from using the Service under applicable law or by prior suspension, termination, or removal.",
            "You are responsible for providing accurate account information and keeping it reasonably current.",
            "You are responsible for keeping your credentials secure and for activity that occurs under your account.",
            "You must promptly contact Chi'llywood Support if you believe your account was compromised or used without permission.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Profile and Channel Use">
        <LegalParagraph>
          Every Chi&apos;llywood account has a Profile and a Channel. Your Profile is your person/social identity. Your Channel is your creator/network surface and mini streaming platform inside Chi&apos;llywood.
        </LegalParagraph>
        <LegalList
          items={[
            "Do not impersonate another person, creator, brand, official account, platform operator, or organization.",
            "Do not create a misleading Profile or Channel name, image, description, or affiliation.",
            "Do not use Profile or Channel surfaces to harass, threaten, exploit, spam, scam, dox, or mislead other people.",
            "Owner controls belong in Channel Settings and other account-owned surfaces. Public viewers must not attempt to access, bypass, or misuse owner-only controls.",
            "Official platform accounts, if present, may use protected markers or restrictions that ordinary user accounts cannot claim.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Creator Uploads and User-Generated Content">
        <LegalParagraph>
          Chi&apos;llywood includes user-generated content. That can include Profile and Channel information, creator-uploaded videos, thumbnails, descriptions, messages, room activity, live camera/microphone participation, comments or reactions where backed, reports, support submissions, and other content or activity you provide.
        </LegalParagraph>
        <LegalParagraph>
          You are responsible for everything you upload, stream, post, message, share, send, or otherwise make available through Chi&apos;llywood. You represent that you own that content or have the rights, permissions, licenses, and approvals needed to use it on Chi&apos;llywood.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="5. Prohibited Content and Conduct">
        <LegalList
          items={[
            "Do not violate any law or regulation.",
            "Do not upload, stream, post, message, share, or otherwise make available content you do not own or have rights to use.",
            "Do not upload, stream, post, message, or share copyrighted movies, shows, music, clips, images, creator uploads, live broadcasts, or other media without permission or another valid legal basis.",
            "Do not infringe, misappropriate, or violate intellectual property, privacy, publicity, contract, or other rights.",
            "Do not share illegal content, sexual exploitation, minor-safety content, non-consensual intimate content, or content that exploits or endangers vulnerable people.",
            "Do not harass, threaten, stalk, dox, bully, exploit, or target others.",
            "Do not promote hate, dehumanization, discrimination, or violence against protected classes.",
            "Do not encourage graphic violence, credible threats, self-harm, dangerous challenges, or other serious harm.",
            "Do not distribute scams, spam, phishing, malware, deceptive links, fake engagement, or harmful code.",
            "Do not impersonate another person or misrepresent your identity, affiliation, authority, official status, or relationship to Chi'llywood.",
            "Do not attempt unauthorized access to accounts, systems, rooms, threads, storage, Premium gates, admin tools, or data.",
            "Do not use bots, scraping, automation, or abusive traffic in a way that disrupts, extracts from, or harms the Service.",
            "Do not evade suspensions, restrictions, moderation actions, copyright actions, account deletion verification, or backend security.",
            "Do not misuse reporting, support, copyright, safety, billing, or moderation systems.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. License You Grant Chi'llywood">
        <LegalParagraph>
          You retain whatever ownership rights you have in your content. Chi&apos;llywood does not own your content because you uploaded, streamed, posted, messaged, or shared it through the Service.
        </LegalParagraph>
        <LegalParagraph>
          By submitting content through the Service, you grant Chi&apos;llywood a non-exclusive, worldwide, royalty-free license to host, store, reproduce, process, transcode or otherwise process if those technical features are later built, adapt for display or playback, display, perform, stream, distribute within the Service, make available to other users according to your selected visibility settings, and otherwise use that content as reasonably necessary to operate and provide the Service.
        </LegalParagraph>
        <LegalParagraph>
          This license supports Profile, Channel, creator upload, Player, Watch-Party, Live, Chi&apos;lly Chat, support, moderation, safety, security, integrity, debugging, legal review, and service-improvement functions. Final wording and any country-specific rights language require legal review before launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Platform Moderation and Takedown Rights">
        <LegalParagraph>
          Chi&apos;llywood may review content, accounts, rooms, threads, reports, billing signals, technical signals, and related activity to enforce these Terms, the Community Guidelines, copyright process, safety rules, and applicable law.
        </LegalParagraph>
        <LegalList
          items={[
            "We may remove, hide, disable access to, restrict, demote, or mark content if it appears to violate rules, rights, safety, copyright, or law.",
            "We may restrict, suspend, or terminate accounts or access when reasonably needed for safety, legal, operational, fraud, abuse, copyright, or policy reasons.",
            "We may respond to user reports, safety reports, copyright reports, support requests, and abuse signals.",
            "We may preserve records when legally required or reasonably needed for fraud, abuse, safety, copyright, moderation, chargeback, dispute, or legal review.",
            "We may cooperate with lawful requests, court orders, legal process, law enforcement, rights-holder notices, or regulatory obligations where applicable.",
            "We may enforce rules through warnings, restrictions, content removal, account suspension, account termination, or other supported controls.",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Watch-Party, Live Rooms, Chat, and Creator Media Rules">
        <LegalList
          items={[
            "Player and title-driven Watch-Party Live flows are for supported content watch-together behavior.",
            "Live Watch-Party, Live First, and Live Stage surfaces are separate live camera/microphone flows and must not be misused to harass, exploit, mislead, or endanger people.",
            "Chi'lly Chat, comments where backed, support messages, and room chat must not be used for spam, threats, harassment, scams, copyright abuse, or illegal activity.",
            "Do not record, redistribute, or misuse someone else's live camera/microphone participation where doing so violates law, platform policy, or another person's rights.",
            "Do not present a draft/private/unpublished/hidden/removed creator video as publicly cleared or publicly authorized.",
            "Creator-uploaded videos can be used in Watch-Party only where the app and backend support it and the video is eligible.",
          ]}
        />
      </LegalSection>

      <LegalSection title="9. Premium, Billing, and Subscriptions">
        <LegalParagraph>
          Chi&apos;llywood may include Premium, subscription, or paid-access features. Premium can unlock supported access-gated features such as Watch-Party Live where configured and proved.
        </LegalParagraph>
        <LegalList
          items={[
            "Pricing, renewal, cancellation, refund, restore, and store terms may be shown by Google Play, RevenueCat, or another approved billing provider.",
            "Premium access should depend on trusted entitlement truth, not a local-only UI state.",
            "Deleting a Chi'llywood account may not automatically cancel a store-managed subscription. You may need to cancel or manage the subscription through the store account or billing provider used for purchase.",
            "Paid creator media, subscriber-only videos, tips, coins, payouts, ads, VIP access, and creator earnings are later-phase systems unless a future release explicitly adds and proves them.",
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Service Availability and Feature Changes">
        <LegalParagraph>
          The Service may be unavailable, interrupted, delayed, changed, limited, region-specific, account-specific, device-specific, or subject to staged rollout. Chi&apos;llywood does not promise uninterrupted service, permanent feature availability, permanent access to a room, or perfect playback.
        </LegalParagraph>
        <LegalParagraph>
          We may change, suspend, limit, replace, remove, or stop offering features or parts of the Service at any time, subject to applicable law and any paid-access terms that apply.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="11. Feedback">
        <LegalParagraph>
          If you send feedback, suggestions, ideas, bug reports, or product notes, you grant Chi&apos;llywood the right to use them without restriction or compensation to you, except where prohibited by law.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="12. Disclaimers Pending Legal Review">
        <LegalParagraph>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHI&apos;LLYWOOD DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
        </LegalParagraph>
        <LegalParagraph>
          User-generated content is created or provided by users, not by Chi&apos;llywood. To the maximum extent permitted by law, Chi&apos;llywood is not responsible for user-generated content, user conduct, or user communications except as required by applicable law and the moderation, reporting, and legal processes we actually support.
        </LegalParagraph>
        <LegalParagraph>
          This section is placeholder legal language pending attorney/legal review before launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="13. Limitation of Liability Pending Legal Review">
        <LegalParagraph>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHI&apos;LLYWOOD AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, AND LICENSORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS.
        </LegalParagraph>
        <LegalParagraph>
          The liability cap, exclusions, country/state-specific exceptions, and enforceability language require attorney/legal review before public launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="14. Indemnification Pending Legal Review">
        <LegalParagraph>
          To the maximum extent permitted by law, you agree to defend, indemnify, and hold harmless Chi&apos;llywood and its affiliates, officers, directors, employees, contractors, licensors, and service providers from claims, damages, liabilities, losses, costs, and expenses, including reasonable attorneys&apos; fees, arising out of or related to your use of the Service, your content, your violation of these Terms, or your violation of law or the rights of another person.
        </LegalParagraph>
        <LegalParagraph>
          This indemnification language requires attorney/legal review before launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="15. Suspension and Termination">
        <LegalParagraph>
          We may suspend, restrict, or terminate your account or access if we reasonably believe you violated these Terms, created risk, abused another person, infringed rights, bypassed security, misused Premium or billing systems, or used the Service in a way that harms Chi&apos;llywood, users, rights holders, service providers, or the public.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="16. Governing Law and Dispute Placeholders">
        <LegalParagraph>
          Draft governing law, venue, arbitration, class-action waiver, informal resolution, and consumer-law exception language must be reviewed and finalized by an attorney/legal owner before launch. Until then, this page should not be treated as a final dispute-resolution agreement.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="17. Contact">
        <LegalParagraph>For questions about these Terms, support, or legal requests, contact:</LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>chillywood92@gmail.com</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
