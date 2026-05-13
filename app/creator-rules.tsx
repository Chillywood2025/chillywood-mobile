import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const EFFECTIVE_DATE = "May 13, 2026";
const LAST_UPDATED = "May 13, 2026";

export default function CreatorRulesPage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Creators"
      title="Creator Rules"
      subtitle="The ownership, upload, Channel, live, monetization, sponsorship, and enforcement rules for creators on Chi'llywood."
    >
      <LegalMeta label="Effective Date" value={EFFECTIVE_DATE} />
      <LegalMeta label="Last Updated" value={LAST_UPDATED} />

      <LegalSection title="1. Creator Ownership">
        <LegalParagraph>
          Creators keep ownership of the content they own. Uploading to Chi&apos;llywood does not transfer ownership to Chi&apos;llywood.
        </LegalParagraph>
        <LegalParagraph>
          By uploading, streaming, posting, commenting, linking, or attaching content, you give Chi&apos;llywood the license needed to host, store, stream, display, transcode where supported, preview, promote, moderate, secure, and operate the service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Rights You Must Have">
        <LegalList
          items={[
            "Only upload videos, clips, music, images, thumbnails, logos, files, links, and other material you own or have permission to use.",
            "Do not upload stolen movies, shows, broadcasts, music, clips, creator uploads, or files.",
            "Get permission for people who appear in content when consent, release, privacy, publicity, venue, event, or performance rights are required.",
            "You are responsible for rights claims, takedowns, disputes, and permissions tied to your content.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Channel Identity">
        <LegalList
          items={[
            "Do not impersonate creators, brands, organizations, official accounts, moderators, or Chi'llywood operators.",
            "Do not claim fake official status, fake sponsorships, fake partnerships, or false affiliation.",
            "Do not use deceptive titles, thumbnails, descriptions, categories, links, or Channel identity.",
            "Do not buy, fake, automate, or coordinate views, followers, comments, likes, watch time, sponsor metrics, or payout eligibility.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Upload And Link Rules">
        <LegalList
          items={[
            "Content must be legal, rights-safe, and policy-safe.",
            "No malware, harmful files, phishing, credential theft, deceptive downloads, or unsafe links.",
            "No illegal goods, illegal services, dangerous instructions, or banned content.",
            "No upload whose main purpose is to push users into scams, fake giveaways, unsafe purchases, or off-platform abuse.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Live Rules">
        <LegalParagraph>
          Do not use Watch-Party, Live Stage, HLS, chat, or room features for stolen streams, illegal broadcasts, harassment, threats, hate, doxxing, sexual content against policy, violence incitement, dangerous activity, or fraud.
        </LegalParagraph>
        <LegalParagraph>
          Chi&apos;llywood may stop, restrict, or review live rooms for safety, copyright, capacity, Premium gating, fraud, technical stability, or legal reasons.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="6. Monetization And Payouts">
        <LegalParagraph>
          Creator payouts, tips, paid content, sponsorship payments, revenue share, and cash-out are not active unless Chi&apos;llywood explicitly enables them in a proved release.
        </LegalParagraph>
        <LegalList
          items={[
            "Eligibility may require good standing, identity/KYC, tax forms, a payment account, supported country, minimum threshold, fraud review, rights clearance, and provider approval.",
            "Violating content can be demonetized, disqualified, hidden, removed, or placed on hold.",
            "Chi'llywood may delay, reverse, withhold, or forfeit payouts where allowed by law and provider rules for fraud, chargebacks, rights disputes, policy violations, sanctions, or provider requirements.",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Sponsorships">
        <LegalParagraph>
          Paid, gifted, affiliate, discounted, commissioned, or otherwise compensated promotions must be disclosed clearly and close to the endorsement.
        </LegalParagraph>
        <LegalList
          items={[
            "Use clear language such as Sponsored by ___, Paid partnership with ___, or I may earn a commission from this link.",
            "Do not hide disclosures in a profile bio, vague hashtag, or unrelated link page.",
            "No fake reviews, fake brand claims, unsafe product promotion, or misleading sponsorship claims.",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Enforcement">
        <LegalList
          items={[
            "Warning.",
            "Content removal, hiding, disabling, labeling, or age-gating.",
            "Upload, live, chat, comment, sponsor, or monetization restrictions.",
            "Payout delay, reversal, withholding, or forfeiture where allowed.",
            "Account suspension or termination.",
            "Repeat infringer termination.",
          ]}
        />
      </LegalSection>

      <LegalSection title="9. Contact">
        <LegalParagraph>For creator policy or support questions, contact:</LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>support@chillywoodstream.com</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
