# Work in progress

## State (2026-11-06)

- 2.0.21 is published in the Chrome Web Store (release branch `release-2.0.21`, merged into main by PR #7).
- Nothing is uncommitted; the user closed the work for the day.
- Shipped in 2.0.21: Setup > Domains and Installed Packages with package secret alerts (#1077 part, #1078, #1079), Preview data filter from a later page (#1082), Run Query cleanup after 7 days (#1081), Contacts > Publication Lists (#1080), plain single-DE reads without a Query Activity plus loading the rest up to 50,000 rows (#1076), search in the results table, Email validation (DE picked on the page with its details, sendable only, 50,000-row limit, stay-on-screen guard, Email addresses tab), DE folder tree look, Customize Home, Salesforce blue as the primary colour.

## Release follow-up

- Tag `v2.0.21` is not pushed: `release.yml` builds the GitHub release from a `## 2.0.21 (date)` section in `CHANGELOG.md`, which still says `## Unreleased (next 2.0.21)` and lists only #1075. The user writes that section (Claude never edits CHANGELOG), then tags.
- Store zip: `releases/sfmc-toolkit-2.0.21.zip`, SHA-256 7257864c2704b0cc9de3831d6998eac646ce0ea640c7b372c1930663b88099f0, built at 483ab74.

## Feedback statuses to set

- Claude's D1 write was refused by auto mode on 2026-11-06; the user runs this from `workers/feedback` (with `CLOUDFLARE_ACCOUNT_ID` of the Mathes.btech account):
  `npx wrangler d1 execute sfmc-query-saver-feedback --remote --command "UPDATE fb_toolkit SET status='released', status_version='2.0.21', status_note='Plain single-DE reads skip the Query Activity and load the rest up to 50,000 rows; long waits are explained (commit 1bb961d).', status_at=$(date +%s000) WHERE id=1076; UPDATE fb_toolkit SET status='released' WHERE status='fixed' AND status_version='2.0.21'"`
- #1077 stays partial.

## Next

- #1077 rest: IP addresses and org or sender settings. Find the SFMC Setup endpoints first (documented or seen in SFMC's own UI calls), then decide with the user.
- #1080 idea: a subscriber list per publication list. Explained to the user; wait for them to ask.
- Live checks still open:
  - Does the customobjects GET return `sendableCustomObjectField`, `sendableSubscriberField`, `isTestable` and `dataRetentionProperties` (Email validation details)?
  - Does SFMC's DE list carry `isSendable` (sendable-only tree)?
  - Setup apps (email-app, custom-domains-ui, mc-domainwhitelist-admin-app): cookie session or Bearer token (`bearer: true` in `src/background/apps.js`)?
  - secretexpirations with a single slash after `fuelapi`.
  - Run cleanup (To Test 2.0.21-run-cleanup); Publication Lists when the SFMC run fails (old counts could look like success).
- Known risks in Run Query: a failed SFMC run is not read, so it can look like 0 rows; a queued run longer than about 60 s may return 0 rows; the 10-minute poll cap is shorter than SFMC's 30-minute limit.
- Flaky test: 1 of 9 full runs on 2026-11-06 failed one test, name not captured. Next time: `npx vitest run --reporter=verbose 2>&1 | grep -B2 -A20 FAIL`.
- Offered, not started: paste raw email headers on the Domains page to extract each DKIM-Signature (d=, s=), check keys and alignment, remember the selector per domain.
- Open gaps: `docs/release-process.md` (referenced by `release.yml`) is missing; store listing data-use text for DNS checks.
