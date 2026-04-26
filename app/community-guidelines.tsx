import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const TODAY = "April 26, 2026";

export default function CommunityGuidelinesPage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Safety"
      title="Community Guidelines"
      subtitle="The content and conduct rules for profiles, channels, creator uploads, Chi'lly Chat, Watch-Party rooms, Live Stage, support, and reporting."
    >
      <LegalMeta label="Effective Date" value={TODAY} />
      <LegalMeta label="Last Updated" value={TODAY} />

      <LegalSection title="Legal Review Status">
        <LegalParagraph>
          These Community Guidelines are draft launch-readiness language and require attorney/legal and safety-owner approval before public launch. They are not final legal advice and do not guarantee any legal outcome.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="1. Community Standard">
        <LegalParagraph>
          Chi&apos;llywood is for adult creators and viewers to watch, chat, go live, and build channels without harassment, impersonation, abuse, or unsafe content.
        </LegalParagraph>
        <LegalParagraph>
          You are responsible for what you upload, stream, post, message, share, or otherwise make available through your account, Profile, Channel, Chi&apos;lly Chat, Watch-Party rooms, Live Stage, support, and reporting surfaces.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Not Allowed">
        <LegalList
          items={[
            "Illegal content, instructions, transactions, or activity.",
            "Harassment, bullying, threats, stalking, doxxing, or targeted abuse.",
            "Hate, dehumanization, or discrimination against protected classes.",
            "Sexual exploitation, minor safety violations, or non-consensual intimate content.",
            "Graphic violence, credible threats, self-harm encouragement, or dangerous challenges.",
            "Copyright infringement, pirated media, stolen creator uploads, unauthorized broadcasts, or copyrighted movies, shows, music, clips, images, or other media used without permission or another valid legal basis.",
            "Spam, scams, phishing, malware, deceptive links, or fake engagement.",
            "Impersonation, misleading identity, fake official status, or false affiliation.",
            "Attempts to bypass bans, blocks, account restrictions, Premium gates, room access, or backend security.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Creator Uploads">
        <LegalParagraph>
          Creator-uploaded videos must be owned by the uploading creator or used with the rights needed to post and stream them on Chi&apos;llywood.
        </LegalParagraph>
        <LegalList
          items={[
            "Creators can draft, publish, edit, unpublish, or delete their own uploads where the app supports it.",
            "Public videos may be reported and reviewed.",
            "Hidden or removed uploads should not appear publicly or play publicly.",
            "A creator cannot bypass platform moderation by republishing content that was hidden or removed.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Rooms, Live, Chat, and Watch-Party">
        <LegalList
          items={[
            "Do not use room, chat, live, or Watch-Party surfaces to harass, threaten, exploit, or spam people.",
            "Do not share private personal information without permission.",
            "Do not mislead people about what is being streamed or who is hosting.",
            "Room and Live Stage moderation tools are bounded by the current app. Use report, leave, block, or support paths where available.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Reporting and Review">
        <LegalParagraph>
          Reports may be reviewed by Chi&apos;llywood operators or moderation roles where backed. Submitting a report does not guarantee a specific action, but it creates a safety record for review.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="6. Enforcement">
        <LegalParagraph>
          Chi&apos;llywood may remove content, hide uploads, restrict accounts, suspend or terminate accounts, block access, respond to reports, preserve records when legally required or needed for safety and enforcement, cooperate with lawful requests, and enforce these Community Guidelines when needed to protect users and the service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Contact">
        <LegalParagraph>For safety, support, or policy questions, contact Chi&apos;llywood Support at chillywood92@gmail.com.</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
