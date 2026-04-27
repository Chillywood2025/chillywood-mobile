import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const EFFECTIVE_DATE = "April 26, 2026";
const LAST_UPDATED = "April 27, 2026";

export default function CopyrightPage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Legal"
      title="Copyright and DMCA"
      subtitle="How Chi'llywood handles creator upload rights, copyright reports, takedown notices, counter-notices, repeat infringement, and DMCA readiness."
    >
      <LegalMeta label="Effective Date" value={EFFECTIVE_DATE} />
      <LegalMeta label="Last Updated" value={LAST_UPDATED} />

      <LegalSection title="Legal Review Status">
        <LegalParagraph>
          This Copyright and DMCA page is draft launch-readiness language. It is not final legal advice, is not attorney-approved, and does not guarantee DMCA safe-harbor protection. Final notice wording, counter-notice handling, repeat-infringer process, agent/contact details, and record-retention process require attorney/legal approval before public launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="1. Copyright Respect Statement">
        <LegalParagraph>
          Chi&apos;llywood respects creators, copyright owners, rights holders, and lawful uses of media. Chi&apos;llywood is a UGC app, which means users may upload creator videos, stream live, message, participate in rooms, and share other content through the Service.
        </LegalParagraph>
        <LegalParagraph>
          Uploading, streaming, posting, messaging, or sharing content on Chi&apos;llywood does not prove that the content is legally cleared. Users are responsible for having the rights needed for their content and activity.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Rights Required for Uploads and Streams">
        <LegalList
          items={[
            "Only upload or stream videos, images, music, thumbnails, titles, descriptions, and other content you own or have permission and rights to use.",
            "Do not upload copyrighted movies, shows, clips, music, music videos, sports/event broadcasts, paywalled media, or creator uploads without permission or another valid legal basis.",
            "Do not use Chi'llywood Watch-Party, Player, Live, Chat, or Profile/Channel surfaces to redistribute unauthorized media.",
            "Do not mislabel content, thumbnails, titles, descriptions, or identities to make unauthorized content appear official, licensed, or owned by you.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Submitting a Copyright Takedown Notice">
        <LegalParagraph>
          If you believe content on Chi&apos;llywood infringes your copyright, send a copyright notice to Chi&apos;llywood Support with enough information for review. Final DMCA notice wording and legally required details must be approved before launch.
        </LegalParagraph>
        <LegalList
          items={[
            "Your full name and contact information.",
            "A description of the copyrighted work you claim was infringed.",
            "The specific Chi'llywood content, route, creator, video id/title, room, message, Profile/Channel, or other location you believe is infringing.",
            "Enough information for Chi'llywood to locate the allegedly infringing material.",
            "A statement that you have a good-faith belief the use is not authorized by the copyright owner, the owner's agent, or the law.",
            "A statement that the information in your notice is accurate and, under penalty of perjury where applicable, that you are authorized to act for the copyright owner.",
            "Your physical or electronic signature.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Where to Send Copyright Notices">
        <LegalParagraph>
          Until a final designated DMCA agent and copyright contact process is approved, copyright notices should be sent to the support contact below. Do not treat this draft page as a final designated-agent record.
        </LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>chillywood92@gmail.com</LegalParagraph>
      </LegalSection>

      <LegalSection title="5. What Chi'llywood May Do After a Notice">
        <LegalList
          items={[
            "Review the notice, reported content, creator account, upload metadata, route context, and related safety or copyright records.",
            "Ask for additional information if the notice appears incomplete, unclear, mismatched, or unsupported.",
            "Hide, remove, disable access to, restrict, or mark allegedly infringing content.",
            "Restrict, suspend, or terminate repeat infringer accounts where appropriate and legally supported.",
            "Notify the uploader or affected account where appropriate and legally allowed.",
            "Preserve safety, legal, copyright, audit, support, and technical records as needed.",
            "Decline to act or seek more information where a report appears abusive, incomplete, false, or not tied to a copyright claim.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Counter-Notice Process Placeholder">
        <LegalParagraph>
          If your content was removed because of a copyright report and you believe the removal was a mistake or misidentification, contact Chi&apos;llywood Support with your account information, the removed content, and the reason you believe you have the right to share it.
        </LegalParagraph>
        <LegalList
          items={[
            "Your name and contact information.",
            "Identification of the removed or disabled material and where it appeared before removal.",
            "A statement under penalty of perjury where applicable that you believe the material was removed or disabled because of mistake or misidentification.",
            "A statement consenting to the appropriate jurisdiction and service of process where required by law.",
            "Your physical or electronic signature.",
          ]}
        />
        <LegalParagraph>
          Final counter-notice requirements, timing, restoration rules, and legal review steps require attorney/legal approval before launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Repeat Infringer Policy">
        <LegalParagraph>
          Chi&apos;llywood may restrict, suspend, or terminate accounts that repeatedly infringe copyrights, repeatedly upload unauthorized media, repeatedly misuse Watch-Party or Live surfaces for unauthorized media, or repeatedly abuse the copyright process.
        </LegalParagraph>
        <LegalParagraph>
          Repeat-infringer thresholds, appeal handling, account reinstatement, and record-retention rules require attorney/legal approval before public launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="8. False or Misleading Notices">
        <LegalParagraph>
          Do not submit false, misleading, abusive, bad-faith, or retaliatory copyright notices or counter-notices. Misuse of the copyright process may lead to content restrictions, account restrictions, suspension, termination, or legal consequences where applicable.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. DMCA Agent and Safe-Harbor Readiness">
        <LegalParagraph>
          For formal DMCA safe-harbor readiness, Chi&apos;llywood&apos;s final company process should be reviewed by an attorney and may require registering a designated DMCA agent with the U.S. Copyright Office. This draft page does not guarantee safe-harbor protection.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="10. No Fake Clearance">
        <LegalParagraph>
          Chi&apos;llywood does not treat upload success, playback success, Watch-Party creation, Player routing, public visibility, or room entry as proof that content is legally cleared. Creators remain responsible for the rights needed to upload, stream, share, and make their videos available.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="11. Contact">
        <LegalParagraph>For copyright, DMCA, or media-rights questions, contact:</LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>chillywood92@gmail.com</LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
