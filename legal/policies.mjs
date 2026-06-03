export const LEGAL_EFFECTIVE_DATE = "May 21, 2026";
export const LEGAL_VERSION = "1.0";
export const LEGAL_SUPPORT_EMAIL = "support@chillywoodstream.com";
export const LEGAL_PUBLIC_BASE_URL = "https://chillywoodstream.com";

export const CREATOR_UPLOAD_ACKNOWLEDGEMENT =
  "I own this content or have permission to use everything in it, including music, audio, images, names, likenesses, voices, performances, trademarks, third-party clips, and any people appearing in it. I understand Chi'llwood may host, store, stream, display, promote, format, transcode, distribute, moderate, restrict, remove, and monetize this content as described in the Creator Terms.";

export const LIVE_REPLAY_ACKNOWLEDGEMENT =
  "I understand live content, speaker audio/video, chat, replays, and related room metadata may be saved, reviewed, moderated, replayed, or preserved as allowed by Chi'llwood rules and legal requirements.";

const paragraph = (text) => text.replace(/\s+/g, " ").trim();
const section = (heading, paragraphs) => ({
  heading,
  paragraphs: Array.isArray(paragraphs) ? paragraphs.map(paragraph) : [paragraph(paragraphs)],
});

const contactSections = [
  section("How to Contact Chi'llwood", [
    "For privacy, copyright, support, account, Premium, creator, moderation, law-enforcement, or legal questions, contact Chi'llwood Support at support@chillywoodstream.com unless a policy gives a more specific path. Include the account email or user id if you are asking about your own account, enough information to locate the content or room at issue, and a clear description of what happened. Do not send passwords, one-time codes, payment card numbers, private keys, private system credentials, or other secrets.",
    "Support can receive requests, route them to the correct owner/admin/legal workflow, ask for verification, and provide status where appropriate. Support is not an emergency service, cannot promise immediate resolution, cannot provide legal advice, cannot guarantee restoration or payment, and cannot override app-store billing rules, court orders, safety restrictions, copyright removals, or lawful preservation requirements.",
  ]),
  section("How This Policy Connects to the App", [
    "This policy connects to Chi'llwood accounts, Profile, Platform, creator uploads, Studio, Player, Watch-Party Live, Live Watch-Party, Chi'lly Chat, audio/video calls, notifications, Premium, support, reporting, moderation, owner/admin tools, Live Ops, legal holds, and evidence workflows. Feature names may change, but the same rules apply to equivalent surfaces that let users create, upload, stream, share, view, message, report, pay, subscribe, moderate, preserve, or request help.",
    "If a screen shows a shorter in-app summary, the summary is only a launcher. The full policy text controls subject to applicable law and any later written agreement signed by Chi'llwood. If a public web link is unavailable, Chi'llwood may use the bundled in-app policy page as the current policy source until the public page is updated.",
  ]),
  section("Owner and Admin Support Notes", [
    "Owner and approved admin tools may show operational notes so the team can apply this policy consistently. Those notes are for workflow and safety operations; they do not give public users hidden rights and they do not remove the need to follow applicable law. Sensitive admin/legal actions require the scoped permissions, reasons, audit records, and legal-hold rules implemented elsewhere in Chi'llwood.",
    "These policies are operational notice documents, not legal advice to users and not a promise that any single workflow protects against every claim or risk. The goal is clear user notice, consistent operations, evidence preservation, and reasonable risk reduction while Chi'llwood follows the law and keeps internal review records current.",
  ]),
];

const standardResponsibilities = section("What Users and Creators Are Responsible For", [
  "Users and creators are responsible for what they do with their accounts and what they upload, stream, publish, message, save, display, report, purchase, or share. That responsibility includes account security, truthful profile information, lawful conduct, respect for other people, accurate support requests, and compliance with the Terms, Community Guidelines, Creator Terms, Live and Chat Rules, Copyright Policy, Premium Terms, and feature-specific prompts.",
  "Creators are also responsible for owning or having permission for all video footage, audio, music, beats, samples, images, logos, trademarks, names, likenesses, voices, performances, locations, third-party clips, collaborative material, people appearing in content, livestream guests, speakers, chat or comment attachments, replays, and saved live material. No upload, publish, live, replay, or playback success means Chi'llwood has verified those rights.",
]);

const standardChiMayDo = section("What Chi'llwood May Do", [
  "Chi'llwood may operate, host, store, cache, back up, stream, reproduce, display, publicly perform, distribute, publish, transmit, transcode, compress, resize, crop, format-shift, make thumbnails, make previews, make snippets, create captions or metadata where applicable, review, moderate, restrict, remove, preserve, investigate, and otherwise process content and account activity as reasonably needed to provide, improve, protect, promote, monetize, secure, troubleshoot, and legally operate the service.",
  "Chi'llwood may remove, restrict, block, disable, demonetize, age-restrict, geoblock, preserve, or review content and accounts for copyright or IP complaints, DMCA notices, legal requests, court orders, law enforcement, safety, community rules, fraud, security, child safety, harassment, threats, platform integrity, account violations, repeat infringement, spam, scams, impersonation, privacy complaints, publicity complaints, or operational reliability.",
]);

const standardNotResponsible = section("What Chi'llwood Is Not Responsible For", [
  "Chi'llwood is not responsible for user-generated content, user conduct, creator claims, third-party links, off-platform arrangements, unsupported devices, network failures, app-store billing decisions, user mistakes, unlawful uploads, unauthorized music, unauthorized likenesses, inaccurate support submissions, or promises made by users, creators, advertisers, sponsors, guests, viewers, moderators, or third parties except where applicable law says otherwise.",
  "Chi'llwood does not promise uninterrupted service, permanent feature availability, a guaranteed audience, guaranteed views, guaranteed revenue, guaranteed monetization, guaranteed support timing, legal outcome, content restoration, account restoration, refund outside provider rules, or that every harmful item will be found before users see it. Nothing in these policies limits rights that cannot legally be limited.",
]);

const policy = (input) => ({
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  version: LEGAL_VERSION,
  ...input,
  sections: [
    ...input.sections,
    standardResponsibilities,
    standardChiMayDo,
    standardNotResponsible,
    ...contactSections,
  ],
});

export const LEGAL_POLICIES = [
  policy({
    slug: "privacy",
    path: "/privacy",
    title: "Privacy Policy",
    summary: "This policy explains how Chi'llwood collects, uses, shares, retains, and protects information across accounts, Profile, Platform, uploads, Player, Watch-Party, Live, Chi'lly Chat, calls, Premium, support, moderation, legal evidence, diagnostics, and public legal surfaces.",
    sections: [
      section("Plain-English Summary", [
        "Chi'llwood uses information to run the app, keep accounts secure, deliver creator and social video features, operate live rooms and chat calls, process Premium entitlements, respond to support, moderate abuse, handle copyright and legal requests, improve reliability, and comply with law. Some information is visible because users choose public Profile, Platform, upload, live, replay, chat, or discovery settings. Other information is private, restricted by server-side access controls, or available only to support, moderation, legal, and owner/admin tools when there is an allowed reason.",
        "This Privacy Policy is written for a user-generated video and live social platform. It covers data users provide, data created by app activity, data from devices and infrastructure, information from service providers, and records that may be preserved for safety, fraud, billing, copyright, legal holds, evidence exports, or audit requirements. Chi'llwood does not say here that it sells personal information. If future advertising or data-sharing practices require new disclosures, the policy must be updated before those practices are used.",
      ]),
      section("Information You Provide", [
        "You may provide account details such as email address, authentication identifiers, Profile information, display name, username, bio, avatar, Platform name, creator details, uploaded videos, thumbnails, titles, descriptions, visibility selections, live event details, chat messages, support requests, reports, copyright notices, counter-notices, legal request information, payment support details, and settings. Passwords and recovery links are handled through the authentication provider and should not be sent to support.",
        "Creator uploads can include video files, audio tracks embedded in videos, images, thumbnails, captions, metadata, categories, publish state, draft state, file records, processing status, Platform associations, and moderation status. Live and chat surfaces can include room identifiers, participant identifiers, speaker roles, call mode, microphone or camera state, live join metadata, join/leave status, relay/connectivity metadata, replay policy, and related timestamps. These records help the app run honestly and help the team investigate disputes or reliability incidents.",
      ]),
      section("Information Created by Use of the Service", [
        "Chi'llwood may collect Profile visits, Platform interactions, Player interactions, search and discovery activity, follows or audience relationships, watch-party room membership, live room membership, playback state, chat thread membership, notification preferences, push notification identifiers, device permission state, support and moderation history, report status, legal hold status, evidence export metadata, audit records, and administrative action records. Some activity is retained in aggregated or diagnostic form even when a user later deletes public content.",
        "Device and technical information may include device type, operating system, app version, release build, runtime configuration, crash reports, performance traces, network state, IP-derived operational signals, route names, feature availability, timing measurements, and errors. Approved crash, performance, app infrastructure, live-media, entitlement, billing, and similar providers may help Chi'llwood understand whether the service is working and whether abuse, fraud, or unauthorized access occurred.",
      ]),
      section("Payments, Premium, and Entitlements", [
        "When Premium or subscriptions are available, Google Play, Apple, RevenueCat, approved app infrastructure providers, or other approved providers may process purchase, renewal, cancellation, refund, restore, entitlement, offer, transaction, receipt, and billing-support information. Chi'llwood uses that information to decide whether a normal user has paid access to gated features. Owner Platform access is a separate server-side role exception for the invisible Platform owner account; it is not a fake entitlement and it does not weaken Premium gates for normal users.",
        "Do not send full payment card numbers, app-store passwords, private wallet keys, or unrelated financial data to support. Chi'llwood support may ask for limited purchase identifiers, store account context, screenshots with sensitive details removed, or RevenueCat/app-store identifiers when needed to troubleshoot billing. Store-managed subscriptions may remain active until canceled through the store or billing provider, even if a Chi'llwood account is scheduled for deletion.",
      ]),
      section("How Information Is Used", [
        "Chi'llwood uses information to create and authenticate accounts, provide Profile and Platform surfaces, host creator uploads, operate Player and discovery, run Watch-Party and Live features, deliver Chi'lly Chat and calls, send notifications, manage Premium, process reports, respond to support, handle copyright notices, investigate safety concerns, enforce rules, protect minors and vulnerable people, prevent fraud, maintain backups, investigate crashes, improve performance, and comply with law.",
        "Chi'llwood may also use content and metadata to show uploads in feeds, search, discovery, Profile, Platform, Player, spectator, live, replay, web, CTV, notification, recommendation, admin, moderation, support, and legal surfaces according to policy, visibility, licensing, and server-side access rules. Operational use may include thumbnails, previews, compression, transcoding, captions, excerpts, abuse detection, evidence packages, and legal holds where allowed.",
      ]),
      section("Sharing and Service Providers", [
        "Information may be shared with service providers that help host, authenticate, store, stream, process payments, deliver notifications, monitor crashes, measure performance, send support replies, operate legal pages, route live media, analyze reliability, or secure the service. Providers may include approved app infrastructure, crash/performance, entitlement, app-store, live-media, build, email/support, hosting, security, or legal vendors when those providers are actually used.",
        "Information may be visible to other users when you make it public or share it through social features. It may be reviewed by authorized support, moderation, owner/admin, legal, or security personnel when needed for support, reports, copyright, legal requests, platform integrity, account recovery, fraud, billing, or safety. Chi'llwood may disclose information when required by law, legal process, court order, emergency policy, or to protect rights, safety, security, and service integrity.",
      ]),
      section("Retention, Deletion, and Legal Holds", [
        "Chi'llwood retains information for as long as reasonably needed for account operation, product features, creator uploads, room history, chat context, support, Premium, reporting, copyright, fraud prevention, security, backups, diagnostics, accounting, tax, legal compliance, dispute resolution, evidence exports, and policy enforcement. Retention varies by data type, feature, account status, legal requirement, support queue, moderation case, payment event, backup cycle, and technical need.",
        "When content or an account is deleted, Chi'llwood should stop public display according to product and legal rules, but copies may remain in backups, logs, fraud/security records, legal compliance records, tax/accounting records, audit records, legal holds, evidence exports, moderation records, dispute records, law-enforcement request records, thumbnails, previews, service artifacts, or content already shared, embedded, clipped, cached, or distributed through supported features where retention is legally or operationally allowed.",
      ]),
      section("User Rights, Choices, and Security", [
        "Users may be able to update Profile, Platform, visibility, notification, password, Premium restore, and account settings in the app. Users can use Settings > Account actions > Delete Account to schedule deletion with a 30-day restore window, or review the Account Deletion policy path for web/support options. Depending on location, users may have legal rights to access, correct, delete, export, restrict, or object to certain processing. Chi'llwood may need to verify identity and may deny or limit processing when retention, safety, fraud, copyright, legal hold, or other lawful reasons apply.",
        "Chi'llwood uses reasonable technical and organizational safeguards, including server-side authorization, scoped admin permissions, audit records for sensitive admin actions, redaction patterns, and restricted service paths where needed. No system is perfectly secure. Users are responsible for securing their email, password, device, and account sessions and should contact support if they suspect compromise.",
      ]),
      section("Children and Minors", [
        "Chi'llwood is intended for adults age 18 and older. Users under 18 may not use the service. Chi'llwood does not knowingly collect personal information from children under 13 or knowingly operate as a child-directed service. If Chi'llwood learns that a minor or child has used the service contrary to the rules, it may restrict or remove the account and preserve records needed for safety, legal, or abuse review.",
        "Child-safety concerns, exploitation, grooming, sextortion, or content involving minors are treated as high-priority safety issues. Chi'llwood may preserve related information, restrict accounts, report to appropriate authorities where required or appropriate, and cooperate with lawful requests. Users should contact emergency services when immediate danger exists.",
      ]),
    ],
  }),
  policy({
    slug: "terms",
    path: "/terms",
    title: "Terms of Use",
    summary: "These Terms govern use of Chi'llwood accounts, Profile, Platform, creator uploads, Player, Watch-Party, Live, Chi'lly Chat, calls, Premium, support, reporting, moderation, legal processes, and related services.",
    sections: [
      section("Plain-English Summary", [
        "Chi'llwood is a user-generated video, live, watch-party, chat, and creator platform. Users must be adults, use truthful account information, respect other people, own or have permission for content they upload or stream, follow safety rules, and accept that Chi'llwood may moderate, remove, preserve, or restrict content and accounts when needed. The platform can change features, cannot promise uninterrupted service, and does not promise creators automatic payment.",
        "Creators keep ownership of the content they own. By making content available on Chi'llwood, they grant Chi'llwood the broad operational license needed to host, store, cache, back up, stream, reproduce, display, publicly perform, distribute, publish, transmit, transcode, compress, resize, crop, format-shift, create thumbnails, create previews, create captions or metadata, moderate, restrict, remove, promote, advertise, and monetize the service around or with the content unless a separate agreement says otherwise.",
      ]),
      section("Eligibility and Accounts", [
        "You must be at least 18 years old, legally able to agree to these Terms, and not barred from using the service by law or by a previous Chi'llwood restriction. You are responsible for your account credentials, email access, Profile identity, Platform identity, subscription status, device security, and all activity that occurs under your account. If you represent a business, creator team, agency, or other organization, you represent that you have authority to bind that organization.",
        "Chi'llwood may require verification, deny registration, reclaim usernames, restrict accounts, or remove accounts that are fraudulent, misleading, abusive, illegal, inactive, impersonating, infringing, created to evade enforcement, or risky to platform integrity. The invisible platform-owner account is a protected internal owner/superuser account, not a public creator profile. Regular users, moderators, and admins do not receive owner powers unless server-side role and permission rules grant specific access.",
      ]),
      section("User Content and License to Chi'llwood", [
        "You retain ownership and copyright in content you create and own. Chi'llwood does not own creator content simply because it is uploaded, posted, livestreamed, commented, sent, shared, or otherwise made available on the service. However, Chi'llwood needs a license to operate the service. By making content available, you grant Chi'llwood a worldwide, non-exclusive, royalty-free, sublicensable, transferable license to use that content as needed to operate, provide, improve, promote, protect, moderate, distribute, monetize, and display Chi'llwood.",
        "The license includes rights to host, store, cache, back up, stream, reproduce, display, publicly perform, distribute, publish, transmit, transcode, compress, resize, crop, format-shift, create thumbnails, create previews, create trailers or snippets, create captions or metadata where applicable, moderate, review, restrict, remove, promote the service using the content, advertise the service using content, and show content in feeds, search, discovery, Profile, Platform, Player, spectator, live, replay, web, CTV, notification, recommendation, admin, moderation, support, and legal surfaces.",
      ]),
      section("Rights You Must Have", [
        "You represent and warrant that you own or have all rights and permissions needed for your video footage, audio, music, beats, samples, images, logos, trademarks, names, likenesses, voices, performances, locations, third-party clips, collaborative content, people appearing in the content, livestream guests or speakers, chat or comment attachments, replays, saved live content, captions, thumbnails, metadata, and any other material you provide.",
        "You must not upload, stream, post, message, or share content that infringes copyright, trademark, publicity rights, privacy rights, music rights, performance rights, contract rights, confidentiality rights, or any third-party rights. You must not use the service to redistribute movies, shows, sports broadcasts, music, paywalled media, private communications, or other material without permission or another valid legal basis.",
      ]),
      section("Prohibited Conduct", [
        "You may not use Chi'llwood for harassment, threats, hate, abuse, stalking, doxxing, impersonation, spam, scams, fraud, phishing, malware, fake engagement, illegal goods or services, sexual exploitation, minor-safety violations, non-consensual intimate content, dangerous challenges, self-harm encouragement, violence incitement, copyright abuse, privacy violations, unauthorized access, scraping, botting, security bypasses, Premium gate bypasses, room access bypasses, or misuse of support, legal, report, billing, or admin systems.",
        "You may not interfere with the service, overload infrastructure, exploit defects, access data without permission, reverse engineer protected systems except where law allows, bypass server-side controls, attempt to obtain private system credentials, manipulate live-room access credentials, create fake participants or fake evidence, impersonate Chi'llwood staff, or misrepresent a creator, sponsor, official account, legal status, or public-safety role.",
      ]),
      section("Premium, Payments, and Creator Monetization", [
        "Premium features may require a subscription or entitlement for normal users. Store providers and RevenueCat or similar entitlement systems may be the source of truth for normal user paid access. Premium features can change, be paused, be unavailable on some devices, or require server-side verification. Deleting a Chi'llwood account does not automatically cancel a store-managed subscription.",
        "Uploading content does not automatically entitle a creator to payment. Chi'llwood may monetize the service, pages, players, live rooms, feeds, discovery, ads, subscriptions, promotions, CTV, replays, or other surfaces. Creators are paid only if a separate Chi'llwood monetization program, subscription-share program, ad-share program, sponsorship agreement, or written contract applies. No automatic revenue share, audience, views, placement, promotion, or payout is promised.",
      ]),
      section("Moderation, Removal, and Enforcement", [
        "Chi'llwood may review, remove, restrict, block, disable, demonetize, age-restrict, geoblock, preserve, or investigate content, accounts, rooms, messages, uploads, replays, Profile surfaces, Platform surfaces, support requests, reports, and legal records. Enforcement may include warnings, visibility limits, upload restrictions, live restrictions, chat restrictions, Premium access restrictions, account suspension, account termination, copyright strikes, repeat-infringer action, evidence preservation, or legal escalation.",
        "Chi'llwood is not required to host or continue displaying any user content. It may act on reports, copyright notices, legal requests, court orders, law-enforcement requests, safety risks, fraud signals, child-safety concerns, platform-integrity issues, repeated violations, or operational reliability concerns. Appeals may be available through support or feature-specific paths, but Chi'llwood does not promise that every decision will be reversed or reviewed on a specific timeline.",
      ]),
      section("Disputes, Liability, and Indemnity", [
        "To the maximum extent allowed by law, the service is provided as is and as available. Chi'llwood disclaims warranties of merchantability, fitness for a particular purpose, title, non-infringement, uninterrupted service, error-free operation, and perfect security. Chi'llwood will not be liable for indirect, incidental, special, consequential, exemplary, punitive, lost-profit, lost-revenue, lost-data, lost-goodwill, or similar damages where the law permits those limits.",
        "You agree to defend, indemnify, and hold Chi'llwood and its affiliates, officers, directors, employees, contractors, service providers, and licensors harmless from claims, losses, liabilities, damages, costs, and expenses arising from your use of the service, your content, your violation of these Terms, your violation of law, or your violation of another person's rights. Arbitration, class-waiver, governing-law, venue, and consumer-law provisions should be reviewed by counsel before public launch and may be added or revised where legally appropriate.",
      ]),
    ],
  }),
  policy({
    slug: "community-guidelines",
    path: "/community-guidelines",
    title: "Community Guidelines",
    summary: "These guidelines explain what behavior and content are allowed on Chi'llwood, how users can report abuse, and what enforcement actions may happen when rules are broken.",
    sections: [
      section("Plain-English Summary", [
        "Chi'llwood is for adult viewers and creators who want social streaming, creator Platforms, live rooms, watch parties, chat, and calls without harassment, theft, exploitation, or unsafe conduct. Be honest about who you are, use content you have rights to use, respect other people, and do not abuse live, chat, reporting, support, billing, or moderation tools. If content or behavior creates risk, Chi'llwood may remove it, restrict it, preserve it, or take account action.",
        "These Guidelines apply to public and private-looking surfaces alike: Profile, Platform, uploads, thumbnails, titles, descriptions, Player, feeds, discovery, Watch-Party Live, Live Watch-Party, Live Stage, Chi'lly Chat, audio/video calls, comments, support, reports, account settings, legal requests, and future creator monetization surfaces. Private or limited-audience features still must follow law, rights, safety, and platform integrity rules.",
      ]),
      section("Harassment, Threats, Hate, and Abuse", [
        "Do not harass, bully, stalk, threaten, intimidate, dox, shame, brigade, blackmail, exploit, or target another person. Do not encourage other users to attack someone, reveal private information, contact someone off-platform against their wishes, or punish someone for reporting abuse. Threats of violence, sexual violence, financial harm, immigration harm, reputational harm, or self-harm manipulation can lead to immediate restrictions.",
        "Do not post or stream hateful, dehumanizing, degrading, or violent content targeting people based on protected traits such as race, color, ethnicity, national origin, religion, caste, sex, gender, gender identity, sexual orientation, disability, age, veteran status, or similar protected status. Criticism, debate, satire, or commentary must not cross into harassment, threats, dehumanization, or calls for exclusion or violence.",
      ]),
      section("Child Safety, Sexual Content, and Consent", [
        "Chi'llwood does not allow sexual exploitation, child sexual abuse material, grooming, sextortion, sexualization of minors, solicitation involving minors, or attempts to move minors into unsafe contact. Users must be adults. If Chi'llwood identifies minor-safety risk, it may restrict accounts, preserve records, report where appropriate, and cooperate with lawful authorities. Users should contact emergency services for immediate danger.",
        "Do not post non-consensual intimate content, voyeuristic content, sexual coercion, deepfake intimate content, revenge content, or content that exposes private sexual or bodily information without consent. Adult sexual content may be restricted or prohibited depending on product rules, app-store rules, legal requirements, and safety context. Live rooms, calls, chat, and replays must respect camera, microphone, likeness, and privacy consent.",
      ]),
      section("Violence, Self-Harm, Dangerous Acts, and Illegal Activity", [
        "Do not credibly threaten, encourage, organize, praise, or instruct serious violence, terrorism, human trafficking, exploitation, animal cruelty, weapon misuse, dangerous challenges, or criminal activity. Graphic or shocking material may be removed or restricted even if posted as commentary if it creates safety, legal, or community risk. Do not use Chi'llwood to sell illegal goods, coordinate illegal services, or evade law enforcement.",
        "Do not encourage self-harm, suicide, eating-disorder behavior, or dangerous behavior. Supportive discussion and recovery-focused content may be allowed when it does not instruct, glamorize, or pressure harm. Chi'llwood is not a crisis service. If someone appears in immediate danger, contact local emergency services or a qualified crisis resource first.",
      ]),
      section("Scams, Fraud, Spam, Impersonation, and Platform Abuse", [
        "Do not run scams, phishing, fake giveaways, fake Premium offers, fake creator payouts, fake investment schemes, malware, credential theft, deceptive downloads, bot networks, fake engagement, spam, or manipulative links. Do not misrepresent yourself as Chi'llwood staff, law enforcement, a sponsor, a creator, a moderator, a rights holder, a public official, a brand, or another user. Official or owner accounts may have protected behavior that ordinary users cannot claim.",
        "Do not bypass restrictions, create accounts to evade bans, exploit defects, scrape data, automate abusive actions, overload rooms, manipulate playback, fake evidence, create fake participants, misuse notifications, or attempt to access admin, legal, support, billing, Live Ops, private system credentials, or private user data without authorization. Attempts to break platform integrity can lead to account termination and legal escalation.",
      ]),
      section("Copyright, Privacy, and Third-Party Rights", [
        "Do not upload, stream, replay, post, message, or share content that you do not own or have permission to use. This includes copyrighted movies, shows, music, beats, samples, images, logos, sports or event broadcasts, third-party clips, private recordings, paywalled media, and other creator uploads. Do not use thumbnails, titles, descriptions, or profiles to make unauthorized content look official or licensed.",
        "Do not expose private personal information, private addresses, phone numbers, private messages, financial information, medical information, intimate images, confidential documents, or location data without permission. Do not use another person's name, likeness, voice, performance, workplace, school, or identity in a misleading or unlawful way. Respect publicity, privacy, contract, confidentiality, and venue rights.",
      ]),
      section("Live Room, Watch-Party, Chat, and Call Behavior", [
        "Hosts and speakers are responsible for live room conduct. Do not use camera, microphone, room titles, chat, playback, or replays for harassment, unauthorized media, illegal activity, sexual exploitation, scams, threats, or privacy violations. Do not pressure people to turn on camera or microphone, reveal private details, join a call, accept off-platform contact, buy something, or stay in unsafe rooms.",
        "Watch-Party features must not be used to bypass copyright, Premium gates, player restrictions, room permissions, or route ownership. Chat and calls must not be used for spam, threats, stalking, coercion, impersonation, phishing, malware, or harassment. Chi'llwood may mute, remove, block, restrict, end, preserve, or review room and chat activity when product rules or legal obligations allow.",
      ]),
      section("Reporting, Blocking, Enforcement, and Appeals", [
        "Users should report content or behavior that appears abusive, unsafe, infringing, fraudulent, or unlawful. Reporting does not guarantee a specific result, but it helps Chi'llwood prioritize review. Users can also block, leave rooms, decline calls, change settings, contact support, or contact emergency services when appropriate. Abuse of reporting tools can itself lead to enforcement.",
        "Enforcement may include no action, education, warning, content removal, visibility limits, age restriction, geoblocking, demonetization, room or live restrictions, chat/call restrictions, Premium restrictions, upload restrictions, legal hold, evidence preservation, account suspension, account termination, or repeat-violation handling. Appeals may be available through support for eligible decisions, but repeated or severe violations may not receive restoration.",
      ]),
    ],
  }),
  policy({
    slug: "creator-rules",
    path: "/creator-rules",
    title: "Creator Rules and Creator Terms",
    summary: "These Creator Terms explain creator ownership, Chi'llwood's content license, upload and live responsibilities, monetization limits, sponsorship rules, deletion effects, and enforcement.",
    sections: [
      section("Plain-English Summary", [
        "Creators keep ownership and copyright in content they create and own. Uploading to Chi'llwood does not transfer ownership to Chi'llwood. But creators must give Chi'llwood the license needed to run a social video platform. That license is broad because the service needs to host, store, stream, transcode, display, promote, moderate, recommend, preserve, and sometimes monetize around content across mobile, web, live, replay, support, moderation, and legal surfaces.",
        "Creators are responsible for rights clearance, accurate metadata, lawful conduct, community safety, sponsorship disclosures, and audience interactions. Uploading content does not automatically create a right to payment. Creator payments require a separate monetization program, revenue-share program, sponsorship agreement, subscription-share program, or written contract. Chi'llwood may monetize the service around content unless a separate agreement says otherwise.",
      ]),
      section("Creator Ownership and Chi'llwood License", [
        "Creators retain ownership and copyright in the content they create and own. Chi'llwood does not own creator content merely because it is uploaded, posted, livestreamed, commented, sent, shared, saved, replayed, or otherwise made available on the service. Creators may still use their own content elsewhere, subject to any separate contracts they make and the rights of other people or rights holders.",
        "By uploading, posting, publishing, livestreaming, commenting, sending, sharing, or otherwise making content available on Chi'llwood, the creator grants Chi'llwood a worldwide, non-exclusive, royalty-free, sublicensable, transferable license to use that content as needed to operate, provide, improve, promote, protect, moderate, distribute, monetize, and display the Chi'llwood service. This license lasts for as long as needed for those purposes, subject to deletion, retention, legal hold, and applicable law.",
      ]),
      section("Specific Rights Included in the License", [
        "The license includes rights to host, store, cache, back up, stream, reproduce, display, publicly perform, distribute, publish, transmit, transcode, compress, resize, crop, format-shift, create thumbnails, create previews, create trailers or snippets, create captions or metadata where applicable, moderate, review, restrict, remove, promote the service using the content, advertise the service using content, and show the content in feeds, search, discovery, Profile, Platform, Player, spectator, live, replay, web, CTV, notification, recommendation, admin, moderation, support, and legal surfaces.",
        "The license also lets Chi'llwood make technical, editorial, safety, accessibility, discovery, and operational adjustments that do not change creator ownership. Examples include video processing, thumbnail selection, aspect-ratio formatting, previews, captions, indexing, recommendation metadata, moderation labels, geoblocking, age restriction, takedown handling, security review, evidence preservation, and showing content in app-store or public marketing materials for the service unless a separate written agreement limits those promotional uses.",
      ]),
      section("Rights and Permissions Creators Must Have", [
        "Creators represent and warrant that they own or have all rights, permissions, licenses, releases, and approvals needed for video footage, audio, music, beats, samples, images, logos, trademarks, names, likenesses, voices, performances, locations, third-party clips, collaborative content, people appearing in the content, livestream guests or speakers, chat or comment attachments, replays, saved live content, and all metadata or thumbnails.",
        "Creators must not upload or stream content that infringes copyright, trademark, publicity rights, privacy rights, music rights, performance rights, contract rights, confidentiality rights, venue rules, union rules, broadcast rights, app-store rules, or any third-party rights. If content includes other people, a creator must have the consent or legal basis needed to show them, record them, use their voice or likeness, save replays, and distribute the material through Chi'llwood.",
      ]),
      section("Upload, Publish, Go-Live, and Replay Acknowledgements", [
        "Before upload, publish, go-live, or replay-save flows, Chi'llwood may require creators to confirm: I own this content or have permission to use everything in it, including music, audio, images, names, likenesses, voices, performances, trademarks, third-party clips, and any people appearing in it. I understand Chi'llwood may host, store, stream, display, promote, format, transcode, distribute, moderate, restrict, remove, and monetize this content as described in the Creator Terms.",
        "For live and replay-enabled features, Chi'llwood may also require creators to confirm: I understand live content, speaker audio/video, chat, replays, and related room metadata may be saved, reviewed, moderated, replayed, or preserved as allowed by Chi'llwood rules and legal requirements. These confirmations are creator-facing reminders. They do not replace the full Terms, do not prove rights clearance, and do not prevent enforcement.",
      ]),
      section("Creator Payment and Monetization Limits", [
        "Uploading, publishing, streaming, joining a live room, receiving views, gaining followers, being featured, creating replays, or appearing in discovery does not automatically entitle a creator to payment. Chi'llwood may monetize the service, pages, players, live rooms, feeds, discovery, ads, subscriptions, promotions, CTV, replays, or other surfaces. Creators are paid only if a separate Chi'llwood monetization program, subscription-share program, ad-share program, sponsorship agreement, or written contract applies.",
        "No automatic revenue share is promised unless backed by written product/legal terms. Creator earnings, if later enabled, may depend on eligibility, identity verification, tax forms, payment provider approval, supported country, minimum thresholds, fraud review, rights clearance, safety status, account standing, chargebacks, refunds, provider restrictions, sanctions screening, and policy compliance. Chi'llwood may withhold, reverse, delay, or deny payouts where allowed by law and contract.",
      ]),
      section("Sponsorships, Promotions, and AI or Generated Content", [
        "Creators must clearly disclose paid, gifted, affiliate, discounted, commissioned, or otherwise compensated promotions. Disclosures should be easy to see, near the endorsement, and understandable to ordinary users. Do not claim fake sponsorships, hide material connections, misrepresent products, make unsubstantiated claims, promote unsafe goods, or use Chi'llwood to run deceptive offers. Creators are responsible for compliance with endorsement, advertising, consumer-protection, and platform rules.",
        "If creators use AI-generated or AI-assisted content, synthetic voices, deepfakes, avatars, cloned likenesses, generated music, or generated images, they remain responsible for rights, consent, safety, authenticity, disclosures, and compliance. AI tools do not guarantee non-infringement or permission to use a person's likeness, voice, performance, style, trademark, or copyrighted work. Chi'llwood may label, restrict, remove, or require disclosure for generated or manipulated content.",
      ]),
      section("Deletion, Removal, and Retention", [
        "When a creator deletes content, Chi'llwood should stop public display according to product and legal rules, but may retain copies where necessary for backups, logs, fraud, security, legal compliance, tax, accounting, audit records, legal holds, evidence exports, moderation records, dispute handling, law-enforcement requests, already-created thumbnails, previews, service artifacts, or content already shared, embedded, clipped, cached, or distributed through service features where product and legal rules allow.",
        "Chi'llwood may also remove, restrict, block, disable, demonetize, age-restrict, geoblock, preserve, or review content for copyright/IP complaints, DMCA notices, legal requests, court orders, law enforcement, safety, community rules, fraud, security, child safety, harassment, threats, platform integrity, account violations, repeat infringement, spam, scams, impersonation, privacy complaints, or publicity complaints. Creator ownership does not require Chi'llwood to keep hosting content.",
      ]),
    ],
  }),
  policy({
    slug: "copyright",
    path: "/copyright",
    title: "Copyright and DMCA Policy",
    summary: "This policy explains Chi'llwood's copyright rules, takedown notices, counter-notices, repeat infringer handling, preservation during disputes, and owner/admin DMCA launch checklist.",
    sections: [
      section("Plain-English Summary", [
        "Chi'llwood respects copyright owners, creators, lawful users, and fair-process expectations. Users must not upload, stream, replay, post, message, or share content they do not own or have permission to use. Copyright owners can send takedown notices. Affected users can submit counter-notices when they believe content was removed by mistake or misidentification. Chi'llwood may remove or disable content, preserve records, track strikes, restrict accounts, or terminate repeat infringers.",
        "This policy is designed to support DMCA-style operations, but it is not legal advice and does not by itself guarantee safe-harbor protection. Chi'llwood must maintain a current designated agent, public contact information, a repeat infringer policy, proper notice and counter-notice handling, and legally reviewed operations before relying on any legal safe harbor.",
      ]),
      section("Creator Responsibility for Copyright and Media Rights", [
        "Creators and users are responsible for all rights in what they upload, stream, publish, replay, message, or share. That includes video footage, audio, music, beats, samples, lyrics, images, logos, trademarks, names, likenesses, voices, performances, locations, broadcasts, third-party clips, collaborative work, livestream guests, chat attachments, and saved live content. Upload success, playback success, watch-party creation, or public visibility is not confirmation that content is legally cleared.",
        "Do not upload, stream, or replay movies, shows, sports or event broadcasts, music videos, songs, samples, beats, podcasts, audiobooks, game streams, clips, paywalled content, private recordings, or other creator uploads without permission or another valid legal basis. Do not use edited thumbnails, misleading titles, category labels, or profiles to make unauthorized material appear licensed, official, sponsored, or owned by you.",
      ]),
      section("Copyright Owner Takedown Notice Requirements", [
        "A copyright owner or authorized agent who believes content on Chi'llwood infringes copyright should use the public copyright report form at https://chillywoodstream.com/copyright-report or send a notice with enough information for Chi'llwood to evaluate and locate the material. The notice should include the claimant's full legal name, organization if applicable, contact email, mailing address, phone number if available, identification of the copyrighted work, identification of the allegedly infringing content or URL/route/id, and enough detail to find it in the app.",
        "The notice should include a statement that the claimant has a good-faith belief the use is not authorized by the copyright owner, the owner's agent, or the law. It should include a statement that the information is accurate and, under penalty of perjury where applicable, that the claimant is authorized to act for the copyright owner. It should include a physical or electronic signature. Incomplete notices may require follow-up before action is taken.",
      ]),
      section("Where to Send Notices and Designated Agent Placeholder", [
        "Copyright notices should be sent to Chi'llwood Copyright Agent / Chi'llwood at support@chillywoodstream.com unless a later public page names a different agent address. Current public records in the repo mention Chi'llwood Copyright Agent / Chi'llwood, support@chillywoodstream.com, 9316 S Kimbark, Chicago, IL 60619, phone 3124879454, and DMCA registration number DMCA-1072720. These details must be verified and kept current before public launch.",
        "Owner launch checklist: confirm the designated agent is registered in the U.S. Copyright Office directory; confirm the public website displays the exact current agent contact; calendar renewal reminders so the designation does not lapse; confirm support can receive notices; confirm admin workflows preserve notices and actions; confirm counter-notice workflow; confirm repeat infringer policy; confirm legal review; confirm records do not expose unrelated private data.",
      ]),
      section("Takedown Review and Content Preservation", [
        "After receiving a notice, Chi'llwood may review the content, upload metadata, account history, copyright strike history, room or replay context, reports, previous notices, and any available rights information. Chi'llwood may remove or disable access to the content, restrict the account, preserve records, notify the uploader where appropriate, ask for more information, decline incomplete or abusive notices, or take other action allowed by law and policy.",
        "Chi'llwood may preserve content, metadata, thumbnails, logs, notices, counter-notices, user communications, audit rows, legal hold records, evidence exports, and moderation records while a dispute is pending or where reasonably needed for legal compliance, safety, fraud, copyright, dispute handling, or repeat infringer enforcement. Preservation does not mean the content remains public, and removal does not mean all technical copies disappear immediately.",
      ]),
      section("Counter-Notice Process", [
        "If content was removed or disabled because of a copyright notice and the affected user believes removal was a mistake or misidentification, the signed-in uploader may use the in-app counter-notice form for their own case or send a counter-notice to support. A counter-notice should include the user's legal name, contact information, identification of the removed material and where it appeared, a statement under penalty of perjury where applicable that the user believes the material was removed by mistake or misidentification, consent to appropriate jurisdiction and service of process where required, and a physical or electronic signature.",
        "Chi'llwood may forward a valid counter-notice to the original claimant and may wait the legally required period before restoring content if the claimant does not notify Chi'llwood that a court action was filed. Chi'llwood may refuse restoration where content violates other rules, creates safety risk, lacks required information, is subject to legal hold, or where counsel advises against restoration. Counter-notices must not be false, abusive, or retaliatory.",
      ]),
      section("Repeat Infringer and Account Consequences", [
        "Chi'llwood may track valid copyright removals, strikes, repeat notices, repeat uploads of unauthorized material, misuse of live or watch-party features for infringing content, and abuse of the copyright process. Repeat infringers may lose upload, publish, live, replay, chat, discovery, monetization, or account access. Severe infringement, obvious piracy, or fraudulent behavior may lead to immediate suspension or termination even without multiple prior strikes.",
        "A successful counter-notice, rights-holder withdrawal, clear mistake, or legal determination may reduce or remove a strike where appropriate. Chi'llwood may still keep records for audit, legal, safety, and repeat-abuse analysis. Users should not create new accounts to evade copyright restrictions. Evasion can count as a separate violation.",
      ]),
      section("False Notices, Appeals, and Admin Workflow Notes", [
        "Submitting false, misleading, incomplete, fraudulent, or bad-faith notices or counter-notices can have legal consequences and may lead to account restrictions. Copyright is not a tool for removing criticism, competition, commentary, or content you dislike. Do not submit a notice unless you are the rights owner or authorized agent and have a good-faith basis.",
        "Owner/admin workflow notes: copyright access should be scoped to authorized staff; private evidence should be viewed only for a reason; legal holds and exports should be append-only and audited where the legal evidence tool requires it; unrelated private data should be redacted where possible; notices, counter-notices, takedown actions, restore decisions, strike updates, and legal holds should be recorded. No one should delete evidence through the copyright workflow.",
      ]),
    ],
  }),
  policy({
    slug: "support-help",
    path: "/support-policy",
    title: "Support and Account Help",
    summary: "This policy explains how users can get account, Premium, creator, moderation, copyright, legal, account deletion, and safety help from Chi'llwood Support.",
    sections: [
      section("Plain-English Summary", [
        "Chi'llwood Support helps route account, password, Profile, Platform, Premium, creator upload, live, chat, safety, copyright, moderation, legal, account deletion, and reliability issues. Support can collect context, ask for verification, open internal review, explain known policy paths, and help users understand what to do next. Support cannot guarantee immediate response, legal advice, app-store refunds, content restoration, account restoration, or emergency response.",
        "Use support@chillywoodstream.com or the in-app support and feedback surfaces when available. Provide a clear summary, the affected account email or user id, content ids, room ids, thread ids, screenshots with private details removed, purchase identifiers where relevant, and a concise explanation. Do not send passwords, reset links, payment card data, service keys, private keys, or unrelated private information.",
      ]),
      section("Account Access and Recovery Help", [
        "Support can help users understand sign-in, password reset, account settings, email confirmation, logout, profile visibility, account deletion, suspicious activity, and device/session questions. Some account recovery is handled by approved sign-in or app-store identity systems, not manually by Chi'llwood. Support may ask users to request a fresh reset email, verify account ownership, confirm recent activity, or provide non-secret identifiers.",
        "Support cannot bypass authentication, reveal passwords, provide another person's account data, transfer ownership without verification, remove lawful holds, guarantee recovery of deleted content, or change app-store credentials. If an account appears compromised, Chi'llwood may restrict sensitive actions, preserve records, revoke sessions where supported, or route the issue to security review.",
      ]),
      section("Premium and Billing Support", [
        "Premium subscriptions, renewals, cancellations, refunds, trials, and restore flows may be handled by Google Play, Apple, RevenueCat, or another billing provider. Support can help users find the manage-subscription path, explain that normal Premium gates depend on verified entitlements, and review account-side issues such as mismatched accounts or restore errors. Store providers may control refund decisions and cancellation timing.",
        "Users should not send full card numbers, app-store passwords, or bank credentials. Support may ask for order ids, store transaction ids, RevenueCat identifiers, entitlement status screenshots, device platform, and the signed-in Chi'llwood account. Chi'llwood does not promise a refund, permanent feature availability, or uninterrupted Premium access beyond applicable law and provider terms.",
      ]),
      section("Creator and Upload Support", [
        "Creator support can help with Platform setup, Studio access, upload errors, draft/public visibility, thumbnails, descriptions, processing state, Player playback, public Platform display, live event scheduling, replay policy, and creator policy questions. Support can explain that creators must own or have permission for all material and that upload success is not rights clearance.",
        "Support cannot clear copyright, guarantee monetization, guarantee discovery placement, provide legal advice, restore removed content without review, or approve unsafe or infringing uploads. Creators should include video id, title, upload time, error text, device type, app version, and a rights-safe description of the problem. Do not send copyrighted files to support unless requested through a controlled legal or evidence path.",
      ]),
      section("Moderation, Appeals, and Safety Support", [
        "Users can report harassment, threats, hate, scams, impersonation, doxxing, privacy violations, unsafe live rooms, abusive chat, copyright issues, illegal content, child-safety concerns, and other violations. Support may ask for content ids, room ids, thread ids, report ids, usernames, timestamps, and screenshots with unrelated private information redacted. Reports may be reviewed by moderation, support, legal, or owner/admin roles depending on severity and permissions.",
        "Support may not disclose enforcement details about other users. Appeals may be available for certain moderation decisions, but not every decision has a guaranteed appeal path or deadline. Severe safety, child-safety, credible threat, exploitation, copyright, legal hold, or fraud issues may override ordinary support timing. Chi'llwood is not an emergency service; users should contact emergency services when immediate danger exists.",
      ]),
      section("Copyright, Legal, and Law-Enforcement Handoff", [
        "Copyright notices, counter-notices, rights-holder questions, law-enforcement requests, preservation requests, subpoenas, warrants, court orders, and emergency disclosure requests must follow the Copyright/DMCA Policy or Law Enforcement/Legal Request Policy. Support can route messages to the correct process but should not casually disclose private user data or evidence outside approved legal workflows.",
        "Law-enforcement or legal requesters should include agency, officer/contact name, case number, legal authority, target identifiers, date range, requested records, and emergency facts if emergency disclosure is requested. Chi'llwood may require legal process, preserve data, notify users where allowed, deny informal requests, and record access/export actions in append-only audit systems.",
      ]),
      section("Account Deletion Help", [
        "Users can schedule account deletion through Settings > Account actions > Delete Account. Support may explain the 30-day restore window, identify subscriptions that must be canceled through the store, and route edge cases to the approved deletion/de-identification process. Some data may be retained for backups, logs, fraud, security, legal compliance, tax, accounting, audit records, legal holds, evidence exports, moderation, disputes, or law enforcement.",
        "Support should not promise instant permanent purge, full removal from all backups, deletion of another user's conversation context, removal of legal/audit records, cancellation of app-store subscriptions, or deletion of evidence under legal hold. Google Play deletion compliance requires a public web deletion path and an in-app path or clear support path as required by store policy.",
      ]),
      section("Response Expectations and Boundaries", [
        "Response time depends on support capacity, issue type, safety priority, account verification, legal complexity, copyright process, and product reliability. Chi'llwood may prioritize child safety, credible threats, active scams, account compromise, legal process, severe harassment, and service outages. Routine product questions, feature requests, and non-urgent billing questions may take longer.",
        "Support can explain current product truth but cannot create fake evidence, fake metrics, fake users, fake incidents, fake health, or fake legal compliance. Support cannot expose private system credentials, live-room access credentials, payment secrets, or private admin credentials. Support should use approved owner/admin tools and audit workflows for sensitive actions.",
      ]),
    ],
  }),
  policy({
    slug: "account-deletion",
    path: "/account-deletion",
    title: "Account Deletion and Data Deletion Policy",
    summary: "This policy explains how users can delete a Chi'llwood account, restore it within 30 days, what may be deleted or de-identified, what may be retained, and how deletion interacts with subscriptions, backups, legal holds, and Google Play requirements.",
    sections: [
      section("Plain-English Summary", [
        "Users can delete a Chi'llwood account from Settings > Account actions > Delete Account. The app schedules deletion immediately, hides the account from public discovery where backed, signs the user out, and gives the user 30 days to sign back in and restore the account before permanent deletion processing begins. Deletion is not instant removal from every backup, log, legal, moderation, billing, or evidence record.",
        "Public content should stop being displayed according to product and legal rules when deletion is processed, but Chi'llwood may retain information where necessary for backups, fraud prevention, security, legal compliance, tax, accounting, audit records, legal holds, evidence exports, moderation records, dispute handling, law-enforcement requests, already-created thumbnails, previews, service artifacts, or content already shared, embedded, clipped, cached, or distributed through service features where allowed.",
      ]),
      section("How to Delete an Account In App", [
        "Signed-in users should open Settings, expand Account, go to Account actions, and choose Delete Account. The confirmation explains that deletion is scheduled now and that the user has 30 days to sign back in and restore the account before permanent deletion processing.",
        "During the restore window, sign back in and choose Restore Account from Settings to cancel scheduled deletion. Do not send passwords or reset links to support. Chi'llwood may still need to review legal holds, subscriptions, billing records, copyright records, safety records, or other retained records before permanent purge/de-identification after the restore deadline.",
      ]),
      section("How to Request Deletion on the Web", [
        "Chi'llwood should maintain a public account deletion page at a reachable URL such as https://chillywoodstream.com/account-deletion. That page should explain the app name, developer identity, in-app Delete Account path, 30-day restore window, what data may be deleted, what data may be retained, and how users can contact support if they cannot access the app.",
        "If the public web deletion URL is unavailable, the bundled in-app policy and support email remain the fallback notice, but the owner should fix the public URL before launch. Public deletion pages must not require login just to read instructions. The in-app Delete Account path requires sign-in so the app can identify the correct account. Entering a public URL in a store console does not by itself delete data.",
      ]),
      section("What May Be Deleted or De-Identified", [
        "Deletion may remove or de-identify account identity information, Profile and Platform display information, public bio fields, avatars, creator uploads, creator video metadata, thumbnails, public Platform listing entries, notification preferences, audience relationships, draft or public content, and certain support or social records where legally and technically allowed. De-identification may replace account identifiers with deleted-user markers when full removal would break another user's context or an audit trail.",
        "The exact result depends on product architecture, relationships between records, storage objects, public sharing, legal obligations, and support runbooks. If a user has public creator uploads, live replays, chat messages, watch-party records, or reports involving other users, some records may be hidden, detached, de-identified, retained in limited form, or preserved under legal/safety rules rather than fully erased immediately.",
      ]),
      section("What May Be Retained", [
        "Chi'llwood may retain information needed for fraud prevention, security, abuse prevention, account-integrity review, blocked-account enforcement, legal compliance, lawful requests, copyright, DMCA, takedown history, repeat-violation handling, moderation, safety reports, admin actions, legal holds, evidence exports, support history, billing, subscriptions, refunds, chargebacks, accounting, tax, dispute resolution, logs, diagnostics, backups, and service integrity.",
        "Backups may retain data for a limited period until normal backup rotation. Logs and diagnostic data may contain identifiers or activity details needed for security and reliability. Legal holds can pause deletion of relevant data. Account deletion does not require Chi'llwood to delete another user's messages, private evidence records, legal process records, audit rows, or records that the law or a legitimate safety need requires Chi'llwood to keep.",
      ]),
      section("Subscriptions and App-Store Cancellation", [
        "Deleting a Chi'llwood account does not automatically cancel a subscription managed by Google Play, Apple, RevenueCat, or another billing provider. Users may need to cancel through the store account used for purchase. If a subscription remains active at the store, billing may continue even if the Chi'llwood account is deleted or de-identified. Users should follow store cancellation instructions and keep cancellation receipts.",
        "Support can help explain restore and entitlement status but may not be able to issue store refunds directly. Refunds may be controlled by the app store or payment provider. Scheduling account deletion does not create a guaranteed refund or guarantee immediate termination of paid access. Billing records may be retained for accounting, tax, fraud, chargeback, and legal reasons.",
      ]),
      section("Timing, Verification, and Third-Party Processors", [
        "Deletion has a 30-day restore window before permanent processing begins. Permanent processing timing depends on account complexity, legal holds, safety reports, copyright records, billing status, backups, technical runbooks, and third-party processors. Chi'llwood may provide an estimated timing window but cannot guarantee every processor will complete every related action at exactly the same time. Users should keep copies of important content before deleting an account.",
        "Approved third-party providers for hosting, sign-in, billing, live media, email, app builds, and support may hold records as processors or independent providers according to their roles and policies. Chi'llwood may instruct processors to delete or de-identify data where appropriate, but some provider-managed billing, fraud, security, or legal records may follow provider retention rules.",
      ]),
      section("Legal Holds, Evidence, and Safety Exceptions", [
        "Chi'llwood may place a legal hold when data is relevant to law enforcement, legal request, court order, subpoena, preservation request, safety incident, copyright dispute, moderation case, fraud investigation, billing dispute, or other legal obligation. A legal hold can delay deletion of relevant records. Users may be told where appropriate, but notice may be limited by law, safety, or investigation needs.",
        "The Legal Evidence tool is read-only for evidence packages and should not delete evidence. Account deletion should not be used to destroy evidence, evade moderation, hide infringement, avoid chargebacks, or frustrate lawful process. Chi'llwood may preserve audit rows and evidence export records even after account deletion.",
      ]),
      section("Google Play Compliance Checklist", [
        "Owner checklist before public launch: maintain a public web deletion page; include the app name; explain the in-app Delete Account path; explain the 30-day restore window; explain what data is deleted; explain what data may be retained; ensure in-app Settings exposes Delete Account and policy help; confirm support email works; enter the public deletion URL in Google Play Console; keep the page reachable without login; and update Google Play Data Safety disclosures to match actual data collection, sharing, deletion, and retention practices.",
        "This checklist is a compliance aid, not confirmation of store approval. Google Play may require changes to wording, location, processing, response timing, or disclosure. Chi'llwood should keep screenshots or timestamped evidence of the page and store configuration outside the repo if needed for launch review.",
      ]),
    ],
  }),
  policy({
    slug: "premium-terms",
    path: "/premium-terms",
    title: "Premium and Subscription Terms",
    summary: "These terms explain Premium features, subscriptions, entitlement truth, cancellations, refunds, owner access exception, feature changes, and creator monetization limits.",
    sections: [
      section("Plain-English Summary", [
        "Premium features may unlock certain gated Chi'llwood experiences for normal users, such as supported Watch-Party Live, live, creator, or future premium surfaces when configured. Normal user access depends on verified entitlement status from app systems, Google Play, Apple, or another approved provider. A local UI state is not enough. The owner account has a separate server-side Platform access exception; that exception is not a fake purchase and does not weaken gates for normal users.",
        "Subscriptions can renew, fail, be canceled, be refunded, or be changed according to store/provider terms. Chi'llwood cannot guarantee every Premium feature will exist forever, work on every device, or remain unchanged. Premium does not guarantee creator revenue, audience, views, discovery, support priority, or special legal treatment.",
      ]),
      section("Premium Features and Availability", [
        "Premium may include access to subscription-gated rooms, Watch-Party Live paths, creator tools, live features, replay access, enhanced social features, or other paid experiences shown in the app at the time of purchase. Not every feature is available in every release, country, device, account, or platform. Features may be experimental, staged, temporarily unavailable, paused for safety, or subject to capacity, LiveKit, storage, support, billing, or legal constraints.",
        "Chi'llwood may add, remove, rename, limit, replace, or change Premium features where allowed by law and store/provider rules. If a paid feature materially changes, Chi'llwood should update product copy and support guidance. Premium does not guarantee uninterrupted live service, perfect playback, error-free chat, specific creator content, permanent rooms, or access to content that is removed for policy, legal, copyright, or safety reasons.",
      ]),
      section("Billing Providers and Entitlement Source of Truth", [
        "Normal user Premium status may be processed through Google Play, Apple, RevenueCat, app entitlement records, or another approved provider. The provider may control price display, taxes, renewal timing, cancellation path, refunds, trials, receipts, and subscription management. Chi'llwood uses verified entitlement status to decide whether normal users clear Premium gates. Users should be signed into the correct store account and Chi'llwood account when purchasing or restoring.",
        "Do not assume payment succeeded because a button was tapped. Do not assume Premium is active because a screenshot exists. Verified entitlement status, provider status, receipt validation, and account identity matter. Fraud, chargebacks, refunds, revoked receipts, expired subscriptions, test purchases, mismatched accounts, unsupported stores, or provider outages may prevent Premium access.",
      ]),
      section("Cancellations, Refunds, Failed Payments, and Restores", [
        "Users can usually cancel subscriptions through the app store or billing provider used for purchase. Deleting the Chi'llwood app or account may not cancel a store-managed subscription. Refunds may be controlled by the store, provider, or applicable law. Chi'llwood does not promise a refund outside those rules. If payment fails, access may end, enter a grace period, or resume after payment is fixed, depending on provider status.",
        "Restore purchase flows may help link active provider entitlements to the current account, but restore cannot create Premium where no valid purchase exists. Users may need to use the same store account, device platform, or Chi'llwood account. Support can help troubleshoot restore issues but cannot expose provider secrets or bypass entitlement verification.",
      ]),
      section("Owner Platform Access Exception", [
        "The invisible platform-owner account may access Premium, creator, admin, studio, live, Live Ops, legal, support, and platform tools without a subscription because owner access is a server-side platform authority role. This is not a RevenueCat entitlement, not a fake purchase, not a public creator benefit, and not available to regular users, moderators, or admins unless separate server-side role or scoped permission rules allow the specific tool.",
        "Owner normal access is unrestricted and is not app-level audited unless Break Glass is manually active. That owner rule does not change Premium requirements for normal users. Admins/operators do not automatically receive Premium bypass unless a separate server-side policy grants a specific operational exception.",
      ]),
      section("Creator Tools and No Revenue Guarantee", [
        "Premium access may include creator tools or audience features, but Premium does not guarantee creator monetization. Uploading videos, running live rooms, gaining followers, receiving views, appearing in discovery, or paying for Premium does not automatically entitle a creator to payment, ad share, subscription share, sponsorship, audience growth, promotion, or payout eligibility.",
        "Creator payments require a separate monetization program, written agreement, or product terms. Chi'llwood may monetize the service, pages, players, live rooms, feeds, discovery, ads, subscriptions, promotions, CTV, replays, or other surfaces. If creators are paid later, eligibility may depend on identity verification, tax forms, provider approval, fraud review, rights clearance, minimum thresholds, account standing, safety compliance, and supported regions.",
      ]),
      section("Restrictions and Abuse", [
        "Users may not share Premium access unlawfully, resell accounts, manipulate subscriptions, abuse trials, exploit refund systems, fake receipts, bypass gates, use stolen payment methods, reverse engineer billing, or misrepresent entitlement status. Chi'llwood may restrict access, preserve records, terminate accounts, or report fraud where appropriate.",
        "Premium content and tools remain subject to all policies. Paid access does not authorize copyright infringement, harassment, unsafe live behavior, privacy violations, scams, or legal violations. Content or accounts can be removed or restricted even if the user paid for Premium.",
      ]),
    ],
  }),
  policy({
    slug: "live-chat-rules",
    path: "/live-rules",
    title: "Live, Watch-Party, and Chat Rules",
    summary: "These rules govern Live Watch-Party, Watch-Party Live, Live Stage, Chi'lly Chat, audio/video calls, saved replays, live moderation, and room safety.",
    sections: [
      section("Plain-English Summary", [
        "Live rooms, watch parties, chat, and calls are high-trust features. Hosts, speakers, guests, viewers, and participants must respect rights, consent, privacy, safety, copyright, Premium gates, and room controls. Do not use live or chat surfaces for harassment, stolen streams, unauthorized music, threats, scams, sexual exploitation, privacy violations, or illegal activity. Chi'llwood may moderate, preserve, restrict, or end access where rules or law require.",
        "Live service depends on devices, networks, live media providers, app builds, permissions, relay paths, and platform capacity. Chi'llwood does not guarantee uninterrupted live service, perfect audio/video, permanent recordings, or that every participant will connect successfully. Reliability issues should be reported honestly and must not be hidden by fake participants, fake stats, or fake health.",
      ]),
      section("Host and Speaker Responsibility", [
        "Hosts are responsible for the room they create, the titles and descriptions they choose, the content they show, the people they invite, the permissions they grant, and the way they respond to unsafe behavior. Speakers and guests are responsible for what they say, show, play, record, display, or share. Everyone must have the rights and consent needed for camera, microphone, voice, likeness, performance, music, clips, images, and other material.",
        "Hosts should give clear context when a room may be saved, replayed, moderated, or reviewed. Hosts must not pressure participants to turn on camera or microphone, reveal private details, join off-platform contact, pay money, accept unsafe behavior, or stay in a room. Hosts must not misrepresent a room as official, private, sponsored, legal, safe, or rights-cleared when it is not.",
      ]),
      section("Camera, Microphone, Consent, and Replays", [
        "Participants should understand that using camera, microphone, speaker roles, live chat, or replay-enabled features can expose their voice, likeness, image, statements, room metadata, and participation to other users and potentially to moderation, support, legal, or replay surfaces. If a feature can save replays or room metadata, Chi'llwood may preserve or review that material as allowed by rules and law.",
        "Do not record, screenshot, replay, redistribute, deepfake, edit, or misuse another person's live participation in a way that violates law, privacy, publicity, platform policy, or consent. Do not expose private information, intimate content, private locations, or confidential communications. If someone withdraws consent or asks to leave a live interaction, respect that boundary unless a legal/safety preservation need applies.",
      ]),
      section("Watch-Party and Player Rules", [
        "Watch-Party Live and Live Watch-Party must not be used to bypass copyright, player controls, content availability, route ownership, Premium gates, room membership, or public/private visibility. Do not force draft, private, hidden, removed, expired, paywalled, or unauthorized content into public rooms. Do not mislabel the source of a room or use a room code to evade policy.",
        "Shared playback, comments, chat, and live media around content must follow the same content rules as uploads and live streams. If the content becomes unavailable, removed, geoblocked, age-restricted, or restricted by rights, safety, or Premium rules, Chi'llwood may end playback, prevent room creation, restrict participation, remove replay access, or preserve records.",
      ]),
      section("Chat, Calls, and Messaging Conduct", [
        "Chi'lly Chat, audio calls, video calls, call invitations, thread metadata, room handoffs, and related notifications must not be used for harassment, stalking, threats, spam, scams, phishing, sexual exploitation, doxxing, impersonation, malware, coercion, or pressure to reveal private information. Do not contact users who have blocked you or use new accounts to evade chat restrictions.",
        "Call participants are responsible for what they say and show. Caller and callee should respect consent, device permissions, recording rules, and privacy. Chi'llwood may preserve call metadata, room identifiers, support reports, and legal evidence where allowed. Chi'llwood does not promise that every call will connect or that all network/device issues can be fixed immediately.",
      ]),
      section("Moderation, Removal, and Live Safety", [
        "Chi'llwood may mute, remove, block, restrict, end, preserve, review, or prevent access to live, watch-party, chat, call, replay, and room features for safety, copyright, legal, Premium, fraud, security, child-safety, harassment, threats, platform integrity, reliability, or policy reasons. Users should report unsafe rooms and leave when needed. Support is not an emergency service.",
        "Live content can move quickly. Chi'llwood may not review every live statement before it appears. Users and hosts remain responsible for live conduct. Severe live harm, child-safety risk, credible threats, exploitation, illegal activity, or copyright abuse may lead to immediate restrictions and record preservation.",
      ]),
      section("Technical Reliability and Live Ops", [
        "Live and call reliability can be affected by room access, signaling, relay paths, cellular networks, device permissions, app behavior, camera state, microphone state, subscriptions, media provider capacity, and app versions. Chi'llwood may run Owner/Admin Live Ops checks, dry-run incidents, and approved remediation workflows, but real production actions require owner/operator approval and must not fake health.",
        "Users should not interpret a failed join, blank feed, low relay bytes, black screen, audio-only failure, or ended room as confirmation of a legal or moderation decision. Reliability incidents may be diagnosed separately from policy enforcement. Chi'llwood may preserve logs and incident records to troubleshoot reliability.",
      ]),
    ],
  }),
  policy({
    slug: "law-enforcement",
    path: "/law-enforcement",
    title: "Law Enforcement and Legal Request Policy",
    summary: "This policy explains how Chi'llwood handles law-enforcement requests, preservation requests, subpoenas, warrants, court orders, emergency disclosures, legal holds, user notice, and evidence exports.",
    sections: [
      section("Plain-English Summary", [
        "Chi'llwood does not casually disclose private user data. Law-enforcement, government, civil legal, and rights-holder requests must go through a controlled legal request process. Requesters should provide agency or party identity, legal authority, case number, target identifiers, date range, requested records, and contact details. Chi'llwood may require valid legal process, preserve data, notify users where allowed, deny overbroad or informal requests, and audit access and exports.",
        "Emergency requests involving imminent risk of death or serious physical harm may be handled faster if enough information is provided. Chi'llwood may disclose limited information in emergencies where legally permitted and where the facts support the request. The Legal Evidence tool is read-only for previews, exports, and holds; it must not be used to delete evidence.",
      ]),
      section("Who May Submit and What Must Be Included", [
        "Requests may come from law-enforcement agencies, courts, government authorities, attorneys, civil litigants, rights holders, or authorized representatives. A request should include the requesting agency or party, officer or contact name, official email, phone number, mailing address, case number, legal authority, target user ids, content ids, room ids, chat thread ids, report ids, date range, the records requested, and the reason records are relevant.",
        "Informal messages, vague requests, screenshots without legal authority, or requests for broad browsing of private user data may be denied or require clarification. Chi'llwood may ask for a subpoena, warrant, court order, consent, or other lawful process depending on the type of data and jurisdiction. Requesters should not ask support staff to bypass legal workflow or send secrets.",
      ]),
      section("Preservation Requests and Legal Holds", [
        "A preservation request asks Chi'llwood to preserve specified records while legal process is obtained. Requests should identify the target account/content/room/thread/report, the date range, the agency or case, the legal basis, and the expiration or follow-up timeline. Chi'llwood may place a legal hold to prevent deletion of relevant data, preserve metadata, and record the request in legal intake systems.",
        "Preservation does not guarantee disclosure. It means relevant data may be retained while the requester obtains proper process or while Chi'llwood evaluates legal obligations. Users may not use account deletion, content deletion, or support requests to destroy evidence under legal hold. Legal holds should be reviewed and released only under an approved retention process.",
      ]),
      section("Subpoenas, Warrants, Court Orders, and Civil Requests", [
        "Chi'llwood may require different legal process depending on the data requested. Basic subscriber or account records, content records, message content, private communications, precise metadata, payment data, or sensitive legal evidence may require different authority. Chi'llwood may challenge, narrow, or reject requests that are invalid, overbroad, inconsistent, improperly served, outside jurisdiction, missing identifiers, or seeking unrelated private data.",
        "Civil litigants should not expect informal disclosure. Chi'llwood may require valid subpoena or court order and may give user notice where allowed. Rights holders should use the Copyright/DMCA process for copyright takedown matters and legal process for broader private-data requests. International requests may require mutual legal assistance or other valid cross-border process.",
      ]),
      section("Emergency Disclosure Policy", [
        "If a request involves imminent risk of death, serious physical injury, child exploitation, kidnapping, active violence, or comparable emergency, the requester should clearly mark it as an emergency, explain the facts, identify the person at risk, identify the target account or content, explain what information is needed, and provide official contact details. Chi'llwood may verify the requester before acting where time allows.",
        "Emergency disclosure is limited to information Chi'llwood reasonably believes is necessary to address the emergency and legally permitted to disclose. Emergency review does not create a general support shortcut. False emergency requests may be rejected and may have legal consequences.",
      ]),
      section("User Notice and Transparency", [
        "Chi'llwood may notify affected users about legal requests where legally allowed and appropriate. Notice may be delayed or withheld if prohibited by law, court order, safety concerns, child-safety concerns, investigation needs, risk of evidence destruction, or other lawful reason. Chi'llwood may ask requesters to identify any non-disclosure requirement.",
        "Chi'llwood may publish transparency information in the future, but this policy does not promise a public report. Internal legal request intake, review status, evidence preview, export, and legal hold actions should be recorded so the owner or authorized legal reviewer can understand who handled the request and why.",
      ]),
      section("Evidence Exports, Redaction, and Audit", [
        "Evidence packages should include read-only copies or records with timestamps, identifiers, metadata, content or excerpts where legally authorized, audit trail, and the reason for export. Exports should redact unrelated private data where practical. Owner may handle legal evidence under owner rules; approved admins need exact legal_review, evidence_export, or legal_request_intake permissions as applicable and must provide reasons where required.",
        "Every approved admin access, preview, export, and legal hold should write an append-only audit row. Owner normal legal use is not app-level audited unless Break Glass is active, but functional legal request and hold records may exist because the system needs them. No one should delete evidence through this tool.",
      ]),
    ],
  }),
  policy({
    slug: "moderation-policy",
    path: "/moderation-policy",
    title: "Content Moderation, Enforcement, and Appeals Policy",
    summary: "This policy explains reports, moderation review, enforcement options, repeat violations, appeals, evidence preservation, and admin workflow limits.",
    sections: [
      section("Plain-English Summary", [
        "Chi'llwood may moderate content, accounts, rooms, live sessions, chat, calls, reports, copyright issues, Premium abuse, creator uploads, and public profiles to protect users, rights holders, the service, and legal compliance. Moderation can be manual, automated, user-reported, admin-initiated, or triggered by legal, copyright, safety, fraud, or reliability signals. Enforcement ranges from no action to account termination.",
        "Users can report abuse and may appeal certain decisions through support where supported. Appeals do not guarantee restoration. Chi'llwood may preserve evidence, logs, and audit records during moderation and legal review. Admins need scoped permissions for sensitive access. Owner normal use follows owner rules and is not audited unless Break Glass is active.",
      ]),
      section("Reporting and Intake", [
        "Reports may involve harassment, threats, hate, doxxing, impersonation, scams, spam, malware, copyright, unsafe live rooms, privacy violations, child safety, illegal activity, Premium abuse, chat abuse, call abuse, or content that violates the Community Guidelines. Reports should include content ids, user ids, room ids, thread ids, report ids, timestamps, screenshots with unrelated private data removed, and a clear explanation.",
        "Submitting a report does not guarantee a specific outcome or timeline. Abuse of reporting tools, false reports, brigading, retaliation, copyright misuse, or attempts to harass another user through reports can lead to enforcement. Chi'llwood may prioritize severe safety, child safety, credible threats, legal requests, active scams, account compromise, and service-integrity issues.",
      ]),
      section("Review Standards", [
        "Moderation may consider the content itself, context, metadata, history, previous warnings, user reports, room behavior, live risk, age or safety signals, copyright notices, legal holds, account status, Premium or monetization impact, and whether the conduct appears accidental, repeated, coordinated, malicious, or severe. Chi'llwood may also consider applicable law, app-store policy, provider rules, and the rights of other users.",
        "Some content may be restricted even if it is not illegal. Some harmful conduct may happen in private or limited-audience spaces and still violate policy. Some reports may require legal or copyright process rather than ordinary moderation. Chi'llwood may choose a narrower action, broader action, or no action depending on evidence and policy.",
      ]),
      section("Enforcement Options", [
        "Enforcement can include education, warning, content removal, hidden status, unpublished status, visibility reduction, age restriction, geoblocking, replay removal, thumbnail removal, Platform restriction, profile restriction, live restriction, chat restriction, call restriction, upload restriction, Premium restriction, monetization restriction, legal hold, evidence preservation, copyright strike, support escalation, account suspension, or account termination.",
        "Chi'llwood may preserve removed content, metadata, reports, admin notes, and audit rows. Removed content may not be publicly visible but can remain available to authorized support, moderation, owner/admin, legal, or evidence tools when policy and law allow. Enforcement may affect related content, reuploads, duplicate accounts, or evasion attempts.",
      ]),
      section("Appeals", [
        "Users may contact support to appeal certain moderation decisions. An appeal should include the affected account, content id, report id if known, the decision being appealed, why the user believes it was mistaken, and any rights or consent information relevant to the issue. Appeals should be respectful and should not include threats, spam, or unrelated private data.",
        "Chi'llwood may uphold, modify, or reverse a decision. It may decline appeals that are abusive, repetitive, incomplete, legally restricted, copyright-controlled, safety-critical, or outside current product support. Restoration may be blocked by legal holds, copyright notices, court orders, safety risk, app-store rules, or repeated violations.",
      ]),
      section("Repeat Violations and Evasion", [
        "Repeated violations may lead to escalating enforcement even if each individual violation might have been handled with a warning. Repeat copyright infringement, harassment, threats, spam, scams, impersonation, illegal activity, child-safety issues, privacy violations, or evasion can lead to termination. Creating new accounts to bypass restrictions is prohibited.",
        "Chi'llwood may retain enforcement records to detect repeat violations and prevent banned or dangerous users from returning. Those records may survive account deletion where legally and operationally justified. Users should not interpret a lack of immediate action as permission to continue borderline conduct.",
      ]),
      section("Admin Workflow and No Silent Private Browsing", [
        "Approved admins may access moderation tools only with scoped permissions. Sensitive private review should require a reason and audit where the tool requires it. Admins cannot self-grant permissions or bypass server-side checks. Owner access remains unrestricted under owner rules, but owner Break Glass actions are audited while Break Glass is active.",
        "Moderation tools should not be used for curiosity, personal disputes, retaliation, stalking, or unrelated private browsing. Evidence should not be deleted through moderation tools. Legal holds, evidence exports, and law-enforcement requests should move through legal workflows. Support and moderation staff should redact unrelated private data where practical.",
      ]),
    ],
  }),
  policy({
    slug: "creator-monetization",
    path: "/creator-monetization",
    title: "Creator Monetization and Revenue Disclaimer Policy",
    summary: "This policy explains that creator payouts, ad share, subscriptions, sponsorships, and other earnings require separate terms and are not automatic just because content is uploaded or viewed.",
    sections: [
      section("Plain-English Summary", [
        "Chi'llwood may build or operate monetization surfaces such as Premium, subscriptions, ads, sponsorships, CTV, paid promotions, creator support, live events, replays, or future payout programs. But uploading content, publishing a Platform, going live, receiving views, getting followers, being recommended, or paying for Premium does not automatically entitle a creator to money. Payment requires a separate written program, agreement, or product terms.",
        "Chi'llwood may monetize the service around or with creator content under the Creator Terms license unless a separate agreement says otherwise. That service monetization does not automatically create a revenue share. Any creator earnings program may include eligibility, verification, tax, payment provider, fraud, rights, safety, minimum threshold, country, and account-standing rules.",
      ]),
      section("No Automatic Payment", [
        "Creators are not automatically paid for uploads, videos, thumbnails, lives, replays, chat, calls, watch parties, comments, discovery appearances, recommendations, promotions, public profiles, Platforms, or audience activity. Chi'llwood does not promise a minimum payout, advertising share, subscription share, sponsorship, bonus, tip, revenue split, or creator fund unless a specific monetization program or written contract says so.",
        "Views, watch time, likes, followers, comments, shares, room participation, replay availability, or public placement are not payment promises. Metrics may be delayed, estimated, unavailable, corrected, filtered, or invalidated for fraud, abuse, reliability issues, privacy, rights disputes, or product changes. No creator should rely on unsupported metrics as income evidence.",
      ]),
      section("Service Monetization Rights", [
        "Chi'llwood may monetize the service, pages, players, live rooms, feeds, discovery, ads, subscriptions, promotions, CTV, replays, notifications, recommendations, and other surfaces. This can include showing ads near content, selling Premium access to features, promoting the service using content, offering sponsorship opportunities, or operating platform-level commercial programs. Service monetization does not transfer creator ownership to Chi'llwood.",
        "The Creator Terms license allows Chi'llwood to use creator content to operate, improve, promote, protect, moderate, distribute, monetize, and display the service unless a separate written agreement limits that use. If a creator participates in a paid program, the program terms will control payment calculation, reporting, audit, eligibility, taxes, payment method, dispute handling, and termination.",
      ]),
      section("Eligibility and Compliance", [
        "A future creator monetization program may require a creator to be in good standing, be at least 18, complete identity verification, provide tax information, connect an approved payment account, live in a supported country, meet minimum thresholds, clear fraud review, have rights to all content, comply with sponsorship disclosure rules, avoid copyright strikes, and follow Community Guidelines and Creator Terms.",
        "Chi'llwood may deny, pause, withhold, reverse, delay, or forfeit payments where allowed by law and contract for fraud, chargebacks, refunds, invalid activity, sanctions, provider restrictions, account compromise, copyright disputes, legal holds, tax issues, missing forms, policy violations, deceptive sponsorships, fake engagement, or unsafe content.",
      ]),
      section("Sponsorships and Paid Promotions", [
        "Creators are responsible for clear disclosure of paid, gifted, affiliate, discounted, commissioned, or otherwise compensated promotions. Disclosures should be placed where users will see them before or near the endorsement. Vague tags, hidden profile notes, or disclosures buried in unrelated text may not be enough. Creators are responsible for truthful claims and required substantiation.",
        "Chi'llwood may remove, restrict, demonetize, or require changes to undisclosed or misleading sponsorships, unsafe product promotions, fake offers, illegal goods, deceptive affiliate links, or ads that violate law, app-store policy, provider rules, or platform policy. Sponsors do not control moderation or legal decisions unless a written agreement and applicable law say otherwise.",
      ]),
      section("Taxes, Payment Providers, and Disputes", [
        "Creators are responsible for taxes, reporting, forms, payment-account accuracy, and compliance with laws that apply to their earnings. Payment providers may require identity, bank, tax, sanctions, fraud, and compliance checks. Chi'llwood may issue forms where legally required but does not provide tax advice. Creators should consult their own advisors.",
        "Payment disputes should be submitted through the applicable program support path with account id, period, payment id, and a concise explanation. Chi'llwood may review logs, provider records, fraud signals, rights disputes, and policy status. No payment dispute should be used to demand disclosure of private user data, service secrets, or unrelated creator metrics.",
      ]),
      section("No Guarantee of Audience or Revenue", [
        "Chi'llwood does not guarantee that creators will receive views, subscribers, followers, watch time, comments, likes, recommendations, sponsorships, ad fill, CPM, conversion, tips, sales, payout eligibility, or revenue. Algorithms, search, discovery, player placement, live rooms, recommendations, public Platforms, Premium surfaces, and ads may change at any time.",
        "Creators should not present Chi'llwood as guaranteed income, guaranteed sponsorship access, guaranteed audience growth, or guaranteed revenue share. Misleading financial claims, fake analytics, manipulated metrics, or scams can lead to enforcement, demonetization, termination, and legal review.",
      ]),
    ],
  }),
];

export const LEGAL_POLICY_BY_SLUG = Object.fromEntries(LEGAL_POLICIES.map((policy) => [policy.slug, policy]));
export const LEGAL_POLICY_BY_PATH = Object.fromEntries(LEGAL_POLICIES.map((policy) => [policy.path, policy]));

export function getLegalPolicy(slug) {
  return LEGAL_POLICY_BY_SLUG[slug] ?? null;
}

export function getPolicyText(policy) {
  if (!policy) return "";
  return [
    policy.title,
    policy.summary,
    ...policy.sections.flatMap((entry) => [entry.heading, ...entry.paragraphs]),
  ].join("\n\n");
}

export function countPolicyWords(policy) {
  const text = getPolicyText(policy);
  return (text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g) ?? []).length;
}

export function policyHasText(policy, search) {
  return getPolicyText(policy).toLowerCase().includes(String(search ?? "").toLowerCase());
}
