# App Store Privacy Worksheet

Status: repository evidence draft. This is not a legal attestation and is not authorization to publish App Privacy answers in App Store Connect.

## Submission identity

| Field | Repository evidence | Status |
| --- | --- | --- |
| App | Chi'llywood | Confirmed in app configuration |
| Bundle identifier | `com.chillywood.mobile` | Confirmed |
| Apple Team ID | `CU7536UQK9` | Confirmed |
| Privacy policy | `https://chillywoodstream.com/privacy` | Repository-backed; recheck immediately before submission |
| Account deletion | `https://chillywoodstream.com/account-deletion` and in-app Settings controls | Repository-backed; reviewer path must be retested |
| Tracking posture | No ATT/IDFA evidence | Source-level result only; provider and archive review remain required |

## Required-reason API declarations

The canonical source is `config/ios/privacy-manifest.json`. Its declarations are the union of reason codes already present in installed Expo, React Native, and AsyncStorage dependency privacy manifests. Product Engineering owns the source and guard. Release Engineering owns final archive inspection. Privacy/Legal owns whether any data-practice declarations or tracking statements need to change.

| API category | Reason codes | Current repository evidence | Owner | Uncertainty / required recheck |
| --- | --- | --- | --- | --- |
| File timestamps | `0A2A.1`, `3B52.1`, `C617.1` | Expo FileSystem, Expo Application, React Native, AsyncStorage manifests | Product Engineering | Re-run after every native dependency update and compare the archived application manifest |
| Disk space | `85F4.1`, `E174.1` | Expo FileSystem manifest | Product Engineering | Confirm both reasons remain in the resolved SDK version and archive |
| User defaults | `CA92.1` | Expo Localization, Notifications, Constants, System UI, and React Native manifests | Product Engineering | Native pods may add other categories during CocoaPods resolution |
| System boot time | `35F9.1` | Expo Device manifest | Product Engineering | Confirm the submitted build still includes Expo Device behavior requiring this reason |

The manifest intentionally does not declare collected-data types. Those answers require the complete submitted binary, live provider configuration, and owner/legal review. Do not interpret omission as a claim that the application collects no data.

## Candidate App Privacy disclosures

The following is a conservative evidence map, not a completed App Store Connect questionnaire. For each row, Privacy/Legal must decide the exact Apple purpose labels, whether the data is linked to identity, whether collection is optional, and whether provider-only processing qualifies for disclosure. The submitted build and provider settings govern.

| Apple data family | Repository-observed examples | Likely use | Linked to user? | Tracking? | Final owner decision |
| --- | --- | --- | --- | --- | --- |
| Contact information | Account email; support and copyright-report contact fields | App functionality, account management, support, legal intake | Usually yes | No evidence | Required |
| User ID | Supabase user ID, profile identity, RevenueCat app user ID mapping | Authentication, entitlements, fraud prevention, support | Yes | No evidence | Required |
| User content | Profile details, photos, social images, videos, thumbnails, chat/messages, comments, reports, live audio/video | Core social, creator, moderation, and communications functionality | Usually yes | No evidence | Required |
| Purchase history | Product, transaction, entitlement, renewal, refund, revocation, restore state | App functionality, customer support, fraud prevention | Yes | No evidence | Required before Apple purchases are enabled |
| Product interaction | Opens, searches, follows, playback, room membership, notification actions, feature usage | App functionality, analytics, reliability | Often yes | No evidence | Required |
| Device ID / push identifiers | Installation ID, Expo push token fingerprints, app/device/build metadata | Notifications, security, fraud prevention, diagnostics | May be linked | No evidence | Required after final push implementation review |
| Diagnostics | Crash reports, performance traces, errors, network/route timing | App functionality, analytics, reliability | Provider-dependent | No evidence | Required |
| Coarse operational location | IP-derived security or infrastructure signals, if retained by providers | Security, fraud prevention, service delivery | Provider-dependent | No evidence | Confirm with provider retention/configuration; do not claim GPS collection |
| Financial information | App Store handles payment credentials; Chi'llywood should receive store transaction/entitlement metadata, not card data | Purchase processing and support | Transaction metadata linked | No evidence | Confirm Apple/RevenueCat boundary; do not disclose card collection without evidence |

## Provider review matrix

| Provider/runtime | Repository role | Review before App Privacy publication |
| --- | --- | --- |
| Supabase | Authentication, database, storage, functions, account deletion, moderation | Confirm production logs, retention, IP handling, and data regions |
| Firebase Analytics | Product interaction analytics and signed-in user association | Confirm Analytics collection, user properties, advertising features, and consent posture |
| Firebase Crashlytics / Performance | Diagnostics and performance | Confirm identifiers, retention, diagnostic payload redaction, and collection defaults |
| Firebase Remote Config | Runtime configuration | Confirm fetched metadata and analytics coupling |
| LiveKit | Live room and call media transport | Confirm logs, participant metadata, recording posture, and region |
| RevenueCat / Apple | Purchases, entitlements, subscription lifecycle | Confirm sandbox/production data, app user ID, receipts/transactions, and retention |
| Expo / EAS | Builds, updates, notifications, project identity | Confirm submitted runtime configuration and notification token handling |
| Cloudflare and media infrastructure | Public legal hosting, security/CDN, media delivery where enabled | Confirm IP/log retention and which hosts are used by the submitted build |

## No ATT/IDFA evidence

Repository inspection found no ATT package, `NSUserTrackingUsageDescription`, `ATTrackingManager`, tracking-permission request, AdSupport framework declaration, or advertising-identifier API. The canonical manifest therefore sets `NSPrivacyTracking` to `false` and supplies no tracking domains. This is not a permanent legal conclusion. Re-audit the final archive, Firebase settings, RevenueCat settings, and every added SDK. If Apple-defined tracking is introduced, stop release work until ATT, disclosures, consent design, and legal review are complete.

## Owner/legal completion gate

- Review Apple’s current [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) definitions against the submitted binary and all third parties.
- Confirm the privacy-policy text matches actual production behavior.
- Complete each App Store Connect data-type purpose/linking/tracking question.
- Do not select “data not collected”; repository evidence contradicts that answer.
- Do not publish the answers until the Account Holder, Admin, or App Manager can truthfully attest to them.
- Preserve a dated export or screenshot of the final answers outside source control if it contains private account information.

References: [Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files), [Expo privacy-manifest guidance](https://docs.expo.dev/guides/apple-privacy/), and [App Store Connect privacy management](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).
