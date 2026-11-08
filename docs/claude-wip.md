# Work in progress

## State (2026-11-06)

- 2.0.21 is published in the Chrome Web Store (release branch `release-2.0.21`, merged into main by PR #7).
- Nothing is uncommitted; the user closed the work for the day.
- Shipped in 2.0.21: Setup > Domains and Installed Packages with package secret alerts (#1077 part, #1078, #1079), Preview data filter from a later page (#1082), Run Query cleanup after 7 days (#1081), Contacts > Publication Lists (#1080), plain single-DE reads without a Query Activity plus loading the rest up to 50,000 rows (#1076), search in the results table, Email validation (DE picked on the page with its details, sendable only, 50,000-row limit, stay-on-screen guard, Email addresses tab), DE folder tree look, Customize Home, Salesforce blue as the primary colour.

## Medium series and live-test fixes (2026-11-07)

- 32 article drafts in `docs/medium/` (plan in `README.md`, screenshots in `images/`), all written; each ends with "Notes for Mathes". Not committed; the author reviews first. Medium drafts not created yet (needs the author's Medium login in the controlled browser).
- Screenshots: Mathes Sandbox (s10, MID 515010937) via Puppeteer-controlled Chrome for Testing with `dist/` loaded (launch outside the Bash sandbox; branded Chrome no longer loads unpacked extensions). Rule from the author: no client DEs or assets in screenshots. Fictional DEs in folder "0 - Demo": Demo_Customers (40, sendable on SubscriberKey), Demo_Orders (80), Demo_Products (12), Demo_Newsletter_Signups (30, 5 bad addresses).
- Bug fixes on branch `fixes-from-live-testing` (uncommitted, not yet verified in a rebuilt extension): Create DE send field and required defaults; DE search `_` wildcard; SFMC placeholder dates and UNTIL 2079; import target name and update types (0 Add and Update, 1 Add Only, 4 Overwrite, checked against Automation Studio); step-only note for refused details; watch last-run status; Run history health chips (averageTime is seconds); plurals and spacing; template "daily"; features.js and Settings text; DE picker dialog overflow; Home secrets card capped at 5; email search requires every word (SFMC `contains` matches any word); build-query-from-fields joins on any shared column and dedupes names.
- Also fixed by helpers (unit-tested, full suite 190 files / 1596 tests passing twice, build OK, manifest guard OK): Run Query engine (unique names, failure marker, per-run call count, field-name case, BU on save, "under a second"), editor/results UI (US date sort, Join note tone and aliases, schema panel height, SFMC-only autocomplete, tooltip width, Likely cause in Validate), Automation Studio list-ID links and frame-following summary tab, Setup app sessions (SSO.aspx landings), journey versions, entry cards and email step names.
- Next: relaunch the controlled browser (the author closed it twice; ask first), reload the rebuilt extension, live-verify every fix (each helper listed its live check), delete probe objects SFMCQS_*_probe_* via Settings > Clean up, update articles that describe fixed behaviour, retake affected screenshots. Nothing committed yet.
- Author's decisions (2026-11-08): keep the marker; show SFMC's reason for a failed run; keep Publication Lists starting on first visit.
- Done 2026-11-08 (live-verified on s10): failed runs show SFMC's reason via a rerun in a temporary automation (conversion error checked; divide by zero gives only "system error"); result DEs without primary key or required fields (UNION ALL now 80 rows, was 40); deleteAutomation fixed (Templates rollback used the 404 endpoint); Clean up lists and deletes SFMCQS_run_ automations. Probe automations SFMCQS_diag_probe_* all deleted.
- Live check 2026-11-08, more fixes (all verified on s10): Home journeys "—" (preload skipped a read in progress instead of waiting), Home Try chips deduped, SFMC status names in words ("Paused schedule", "Scheduled to publish") via `format.js statusWords`, Journey overview and Home count each journey by its live version (40 live, was 28), journey detail version picker with "Version N is published: show it", import target labelled "Target" (lists too), email text search checked locally (Content Builder `contains` is a loose match), automation opened by REST GUID no longer stuck on "Loading" (router.replace kept the old path). Verified fine: Domains and Installed Packages load, Automation Studio list-ID links, import update types and targets, DE search with `_`, Create DE optional fields and EmailAddress send field, build-query join, journey entry versions.
- Still to live-verify: the other fixes from 2026-11-07 (Setup pages, Automation Studio links, journeys, Create DE defaults, search fixes), then update articles and screenshots (Day 2/3 failure message, Day 8 Clean up, Day 19, 21, 17, 22-25, 30, 31).

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
- Flaky test: 1 of 9 full runs on 2026-11-06 failed one test, name not captured. Next time: `npx vitest run --reporter=verbose 2>&1 | grep -B2 -A20 FAIL`.
- Offered, not started: paste raw email headers on the Domains page to extract each DKIM-Signature (d=, s=), check keys and alignment, remember the selector per domain.
- Open gaps: `docs/release-process.md` (referenced by `release.yml`) is missing; store listing data-use text for DNS checks.
