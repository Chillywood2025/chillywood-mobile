import React from "react";

import { LegalList, LegalMeta, LegalPageShell, LegalParagraph, LegalSection } from "../components/legal/legal-page-shell";

const TODAY = "April 26, 2026";

export default function CopyrightPage() {
  return (
    <LegalPageShell
      eyebrow="Chi'llywood Legal"
      title="Copyright and DMCA"
      subtitle="How to contact Chi'llywood about copyright, creator upload rights, takedown requests, and counter-notices."
    >
      <LegalMeta label="Effective Date" value={TODAY} />
      <LegalMeta label="Last Updated" value={TODAY} />

      <LegalSection title="Legal Review Status">
        <LegalParagraph>
          This Copyright and DMCA page is draft launch-readiness language and requires attorney/legal approval before public launch. It is not final legal advice and does not guarantee copyright safe-harbor protection.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="1. Rights Requirement">
        <LegalParagraph>
          Creator-uploaded videos and any content shared in Chi&apos;llywood must be owned by the uploader or used with permission, license, or another legal basis.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Copyright Reports">
        <LegalParagraph>
          If you believe content on Chi&apos;llywood infringes your copyright, send a takedown notice to Chi&apos;llywood Support with enough information for review.
        </LegalParagraph>
        <LegalList
          items={[
            "Your name and contact information.",
            "A description of the copyrighted work you believe was infringed.",
            "The Chi'llywood content, route, creator, title, room, or other location you are reporting.",
            "Enough information for Chi'llywood to locate the allegedly infringing material.",
            "A statement that you have a good-faith belief the use is not authorized by the owner, agent, or law.",
            "A statement that the information in your notice is accurate and, under penalty of perjury where applicable, that you are authorized to act for the copyright owner.",
            "Your physical or electronic signature.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Where to Send Notices">
        <LegalParagraph>
          Until a final designated DMCA agent/contact process is approved, copyright and DMCA notices should be sent to the support contact below. Final DMCA agent details are pending attorney/legal approval.
        </LegalParagraph>
        <LegalParagraph>Chi&apos;llywood Support</LegalParagraph>
        <LegalParagraph>chillywood92@gmail.com</LegalParagraph>
      </LegalSection>

      <LegalSection title="4. What Chi'llywood May Do">
        <LegalList
          items={[
            "Review the reported content and related account or upload metadata.",
            "Hide, remove, or disable access to allegedly infringing content.",
            "Ask for additional information before acting when a notice is incomplete.",
            "Preserve safety, legal, and audit records as needed.",
            "Take action against repeat infringement or abuse of the copyright process.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Counter-Notices">
        <LegalParagraph>
          If your content was removed because of a copyright report and you believe the removal was a mistake, contact Chi&apos;llywood Support with your account information, the removed content, and the reason you believe you have the right to share it.
        </LegalParagraph>
        <LegalParagraph>
          A counter-notice process may require your contact information, identification of the removed material, a statement under penalty of perjury that the content was removed because of mistake or misidentification, consent to appropriate jurisdiction, and your physical or electronic signature. Final counter-notice wording and handling rules require attorney/legal approval before launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="6. Repeat Infringer Policy">
        <LegalParagraph>
          Chi&apos;llywood may restrict, suspend, or terminate accounts that repeatedly infringe copyrights or repeatedly abuse the copyright process. Final repeat-infringer handling, appeal timing, and record-retention rules require attorney/legal approval before launch.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. DMCA Agent and Safe-Harbor Review">
        <LegalParagraph>
          For real DMCA safe-harbor readiness, Chi&apos;llywood&apos;s final company process should be reviewed by an attorney and may require registering a designated DMCA agent with the U.S. Copyright Office before relying on safe-harbor procedures.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="8. No Fake Clearance">
        <LegalParagraph>
          Chi&apos;llywood does not treat upload success, playback success, or Watch-Party entry as proof that content is legally cleared. Creators remain responsible for the rights needed to upload and share their videos.
        </LegalParagraph>
      </LegalSection>
    </LegalPageShell>
  );
}
