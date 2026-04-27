import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const EFFECTIVE_DATE = "April 26, 2026";
const LAST_UPDATED = "April 27, 2026";

export default function CommunityGuidelinesPage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Safety"
      title="Community Guidelines"
      subtitle="The content, conduct, creator upload, room, live, chat, reporting, and enforcement rules for Chi'llywood."
    >
      <LegalMeta label="Effective Date" value={EFFECTIVE_DATE} />
      <LegalMeta label="Last Updated" value={LAST_UPDATED} />

      <LegalSection title="Legal Review Status">
        <LegalParagraph>
          These Community Guidelines are draft launch-readiness language. They are not final legal advice and require attorney/legal, product, and safety-owner approval before public launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="1. Community Standard">
        <LegalParagraph>
          Chi&apos;llywood is for adult creators and viewers to build Profiles and Channels, upload creator videos, watch together, go live, message, and participate in a premium social streaming community without harassment, impersonation, abuse, copyright misuse, or unsafe content.
        </LegalParagraph>
        <LegalParagraph>
          You are responsible for what you upload, stream, post, message, comment, react to, share, report, or otherwise make available through your account, Profile, Channel, creator uploads, Chi&apos;lly Chat, Watch-Party rooms, Live Stage, support, and reporting surfaces.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Creator Upload Rules">
        <LegalList
          items={[
            "Only upload or publish videos, thumbnails, titles, descriptions, and other media you own or have permission and rights to use.",
            "Do not upload full movies, shows, music videos, clips, sports/event broadcasts, music, images, or creator uploads you do not own or have rights to use.",
            "Do not use upload success, playback success, or Watch-Party success as proof that content is legally cleared.",
            "Draft/private/unpublished videos must not be presented as public or shared through public routes.",
            "Hidden or removed uploads must not be republished to bypass moderation.",
            "Use accurate titles, descriptions, thumbnails, categories, and visibility settings.",
            "Respect reports, copyright actions, moderation decisions, and support/legal follow-up.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Live Room and Camera/Microphone Rules">
        <LegalList
          items={[
            "Do not use live camera, microphone, or room surfaces to harass, threaten, exploit, stalk, dox, or pressure another person.",
            "Do not expose private personal information, intimate content, or someone else's likeness or voice without appropriate consent or rights.",
            "Do not mislead people about who is hosting, what is being shown, or whether a room is official, endorsed, private, Premium, or public.",
            "Do not stream illegal content, sexual exploitation, minor-safety content, credible threats, violent encouragement, dangerous challenges, or self-harm encouragement.",
            "Do not attempt to bypass LiveKit, room, Premium, host, speaker, viewer, moderation, or backend access rules.",
            "Leave, report, or use available safety controls when a live surface becomes unsafe.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Watch-Party Room Rules">
        <LegalList
          items={[
            "Watch-Party Live from Player uses the title/content Watch-Party flow. Do not misrepresent a room's source or route.",
            "Do not use Watch-Party rooms to share unauthorized media, spam, scams, harassment, threats, or misleading links.",
            "Do not attempt to force draft, private, hidden, removed, or unavailable creator videos into public Watch-Party rooms.",
            "Do not interfere with shared playback, room membership, room codes, or host controls.",
            "Premium or protected Watch-Party features must not be bypassed through deep links, room codes, or hidden controls.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Chat, Message, Comment, and Reaction Rules">
        <LegalList
          items={[
            "Do not send harassment, threats, hate, sexual exploitation, minor-safety content, scams, phishing, spam, malware, or deceptive links.",
            "Do not pressure people for personal information, payment details, private photos, private videos, or off-platform contact.",
            "Do not impersonate another user, creator, official account, moderator, operator, or Chi'llywood representative.",
            "Do not misuse comments or reactions where backed to target, shame, brigade, exploit, or mislead people.",
            "Do not use report, support, or safety systems to harass others or bury legitimate safety concerns.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Copyright and Media Rights">
        <LegalParagraph>
          Chi&apos;llywood respects copyright and creator rights. You must not upload, stream, post, message, or share media you do not own or have rights to use.
        </LegalParagraph>
        <LegalList
          items={[
            "No unauthorized movies, shows, songs, music videos, clips, livestreams, sports/event broadcasts, paywalled content, or stolen creator uploads.",
            "No misleading edits, thumbnails, titles, or descriptions that make content appear authorized, official, or owned by you when it is not.",
            "No copyright process abuse, fake notices, or attempts to suppress lawful creator content through false reports.",
            "Copyright reports and counter-notice handling remain subject to final DMCA/legal approval.",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Sexual Exploitation and Minor Safety">
        <LegalParagraph>
          Chi&apos;llywood does not allow sexual exploitation, minor-safety violations, non-consensual intimate content, grooming, coercion, sextortion, or content that sexualizes or exploits minors.
        </LegalParagraph>
        <LegalParagraph>
          If you encounter content or behavior that may involve exploitation or immediate danger, use available report/support paths and contact appropriate local emergency or safety authorities where necessary. Chi&apos;llywood support is not an emergency service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="8. Harassment, Hate, Violence, and Dangerous Conduct">
        <LegalList
          items={[
            "No harassment, bullying, stalking, doxxing, targeted abuse, threats, intimidation, or coordinated attacks.",
            "No hate, dehumanization, slurs, or discrimination against protected classes.",
            "No credible threats, violent encouragement, graphic harm promotion, dangerous challenges, or self-harm encouragement.",
            "No glorification or instruction for illegal violence, exploitation, fraud, malware, or serious harm.",
          ]}
        />
      </LegalSection>

      <LegalSection title="9. Fraud, Spam, Malware, and Platform Abuse">
        <LegalList
          items={[
            "No scams, phishing, fake giveaways, fake Premium offers, fake creator payout claims, fake official messages, or deceptive links.",
            "No malware, credential theft, scraping, botting, abusive automation, fake engagement, or attempts to damage the Service.",
            "No evasion of bans, blocks, Premium gates, room access, account restrictions, copyright actions, or moderation actions.",
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Reporting Abuse">
        <LegalParagraph>
          Use in-app report paths and support surfaces to report creator videos, profiles/channels, chat/message issues, rooms, live behavior, copyright concerns, or other safety problems where available.
        </LegalParagraph>
        <LegalParagraph>
          Reports may be reviewed by Chi&apos;llywood operators, moderation roles, support owners, or legal/copyright reviewers where backed. Submitting a report creates a safety record but does not guarantee a specific action or timeline.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="11. Enforcement Actions">
        <LegalList
          items={[
            "Content removal, hiding, disabling, unpublished status, or visibility restriction.",
            "Profile, Channel, creator upload, Player, Watch-Party, Live, Chat, Premium, or support feature restrictions.",
            "Account warning, restriction, suspension, or termination.",
            "Admin/operator review, safety record preservation, legal/copyright escalation, or cooperation with lawful requests.",
            "Repeat-violation handling for repeated harassment, copyright misuse, safety abuse, fraud, spam, or policy evasion.",
          ]}
        />
      </LegalSection>

      <LegalSection title="12. Appeals and Review">
        <LegalParagraph>
          Chi&apos;llywood may offer manual support review for certain account, content, or moderation decisions where the current support process allows it. A full self-serve appeal center is not yet promised for Public v1.
        </LegalParagraph>
        <LegalParagraph>
          If you believe a moderation or copyright action was mistaken, contact Chi&apos;llywood Support with your account information, the affected content or route, and a clear explanation. Final appeal timing and process require legal/safety approval.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="13. Creator Responsibility">
        <LegalParagraph>
          Creators are responsible for their Channel, uploaded videos, metadata, thumbnails, room behavior, chat behavior, and audience interactions. Creator tools do not create permission to upload illegal, unsafe, unauthorized, or rights-infringing content.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="14. Contact">
        <LegalParagraph>For safety, support, or policy questions, contact:</LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>chillywood92@gmail.com</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
