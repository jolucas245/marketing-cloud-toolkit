# Work in progress

## Now (2026-11-05)

- Setup > Domains and Account (target 2.0.21), not committed yet.
  - Domains: SAP and Private Domains with SPF, DKIM, DMARC, NS and MX from public DNS (opt-in, Cloudflare DoH); From addresses rated by their domain's DMARC; custom domains with certificate days, slots and live CNAME; "What these mean" tab.
  - Account (hidden route, from Settings, alerts, Ctrl+K): API endpoints, all installed package secrets, Automation Studio activity access.
  - Alerts for package secrets expiring within 7 days (or expired): bar on every page (dismissible) and card on Home.
  - New policy `disableDnsLookup`; CSP adds `https://cloudflare-dns.com`; manifest baseline updated (to be committed on its own).
  - PRIVACY.md (and generated privacy.html), security-summary, enterprise-deployment, README, features.js, toTest.js updated. CHANGELOG.md left for the user.
- Also fixed: vitest on Node 25 (`--no-experimental-webstorage`).
- Verified: 163 files / 1411 tests pass, `npm run build` clean, DNS module checked against live DNS for the user's sample domains.

- Feedback read 2026-11-05 (rows #1076-#1079, all 2.0.20, status null, nothing triaged yet):
  - #1076 Queries workspace: `SELECT TOP 1000 GUID FROM [Master_DE]` still running after 3 minutes (screenshot). Reproduce first.
  - #1077 Feature: SPF, DKIM, DMARC validation plus IP and org/instance settings. Mostly covered by the uncommitted Setup > Domains work; IP/sender settings not yet.
  - #1078 Done (uncommitted): Account is now Setup > Installed Packages (`/installed-packages`, `InstalledPackagesPage.vue`), in the sidebar under Setup, secrets section first; Settings link, features.js, toTest.js updated. No `/account` redirect (never released).
  - #1079 Done (uncommitted): cause was the alert bar's Details linking to the page already open. Bar now links to `/installed-packages` and hides Details there; test reproduces it. Feedback rows not marked yet (wait for the user's live check).
  - Reading needs `CLOUDFLARE_ACCOUNT_ID` of the Mathes.btech Cloudflare account (wrangler login sees two accounts; the D1 is in this one).
- #1076 Done (uncommitted): `utils/directRead.js` plans plain single-DE reads (no WHERE/JOIN/ORDER/GROUP/expressions/data views/ENT.) and reads them with the rowset; useQueryPanel branches before Validate, keeps the DE only as `run.direct` (never deId/deKey, so nothing deletes it), load more projects columns and caps TOP. Run step shows a long-wait note after 60s (RunStepper `data-long-wait`).
  - Follow-up (user tested, 2026-11-06): a direct read loads the remaining rows on its own, up to LOAD_ALL_LIMIT (50,000), via fetchAllRows. The panel offered Load more only for `createdDeKey`; it now uses `canLoadMore` (direct or created DE). `rowsGen` drops pages still loading for an earlier run. Test: `composables/__tests__/useQueryPanelDirectRead.test.js`.
- Email validation (user 2026-11-06, uncommitted): picker lists only sendable DEs (DEBrowser `sendableOnly`, node isSendable from the list, unknown kept and checked on pick), row count with a 50,000 message, stay-on-screen note, leave guard (askConfirm) and beforeunload. Unconfirmed live: whether SFMC's DE list carries isSendable.
- New feedback 2026-11-06:
  - #1082 Done: the Preview data dialog filters rows outside ResultsTable, which kept its page; ResultsTable now goes back to page 1 when the rows are replaced and keeps the page when rows are only appended. Tests in DERowsViewer.test.js and ResultsTable.test.js.
  - #1082 committed (faa1a8a).
  - #1081 Done (uncommitted): not SFMC retention (it cannot delete the Query Activity). `utils/runCleanup.js` deletes the Query Activity and DE of runs made in this browser more than 7 days ago (Settings > Running queries > Delete old runs from SFMC, `_queryRunCleanupDays`, 0 = off), once a day per stack, a minute after the app opens (App.vue). Only SFMCQS_ names, never ids a newer run uses (Reuse DE setting); 404 counts as done; runs stay in history with `cleanedAt` (History shows Cleaned up from SFMC). useQueryPanel takes in run changes from storage so autosave does not restore deleted ids. Needs a live check (To Test 2.0.21-run-cleanup).
  - #1081 committed (03b2f9b).
  - #1080 Done, checked live by the user 2026-11-06 (SQL works on the page): Contacts > Publication Lists (`views/contacts/PublicationListsPage.vue`, `utils/publicationLists.js`) with the user's SQL on _ListSubscribers (GROUP BY ListName, Status). Async: first visit starts it, says it will tell the user, toast when done; job state (no counts) in `_publicationLists` per stack:accountId, resumed on app start (App.vue). One SFMCQS_publist DE + activity per BU reused; recreated when the DE is gone. Counts read from the DE (never stored, PRIVACY.md updated). Unverified live: whether a failed SFMC run leaves the old counts (Overwrite) and looks like success.
  - #1080 idea (Publication Lists viewer): discuss with the user before any work.
- Flaky test: 1 of 9 full `npm test` runs on 2026-11-06 failed one test (1423/1424); not caught again in 8 more runs, name not captured. Next time, capture with `npx vitest run --reporter=verbose 2>&1 | grep -B2 -A20 FAIL`.
- Added `workers/feedback/.rows.json` to `.gitignore`.
- Offered (not started, awaiting yes): paste raw email headers on the Domains page to extract every DKIM-Signature (d=, s=), check each key, check alignment with the From domain, and remember the selector per domain.
- User is restarting the browser; Claude in Chrome may be connected afterwards, which would allow checking the Setup apps' auth live instead of via the test build.

## Uncommitted (all of the above, nothing committed yet)

- Suggested commits: 1) `security/manifest-baseline.json` alone (reason: CSP adds cloudflare-dns.com; new SFMC hosts email-app, custom-domains-ui, mc-domainwhitelist-admin-app); 2) the feature + docs; vite.config.js Node 25 fix and .gitignore can go separately. Wait for the user to ask before committing.
- Test build is in `dist/` (TOOLKIT_TEST_BUILD=1); load unpacked to test.
- Suggested CHANGELOG text for the user: "New: Setup > Domains (SAP, Private Domain, From address and custom domain checks with optional DNS lookups), Account page, and alerts for installed package secrets expiring within a week."

## Next

- User checks a test build against a live org (s12): do email-app, custom-domains-ui and mc-domainwhitelist-admin-app answer with their own session cookies, and do their landing pages start a session? If they need the Bearer token, set `bearer: true` in `src/background/apps.js`.
- Confirm the secretexpirations call works with a single slash after `fuelapi` (SFMC's UI used `fuelapi//internal`).
- Store listing data-use text for DNS checks; CHANGELOG entry.
- Open gap: `docs/release-process.md` (referenced by `release.yml`) is missing.
- Results search (user, 2026-11-06, uncommitted): ResultsTable has a Search rows box over every column of the loaded rows (prop `searchable`, off in DERowsViewer, which has its own). Tests in ResultsTable.test.js.
- Email validation tabs (user, 2026-11-06, uncommitted): three tabs, Email addresses (one or many, replaces One address + List of addresses; Ctrl/Cmd+Enter runs), Data extension, Contacts. Buttons say "Run email validation" ("Find contacts and run email validation" on Contacts). Test: `views/data/__tests__/EmailValidationPage.test.js`.
- Folder tree matches the DE tree (user, 2026-11-06, uncommitted): DEFolderPicker rows now use DETreeNode's look (13px, 3.5 icons, 12px indent, rounded rows, primary highlight, "selected" label), so every screen using it changed (Save as query activity, Save results, Create DE, Templates, Email validation). A folder set from outside is revealed (ancestors opened via `deApi.fetchDEFolderChain`, scrolled into view); a folder outside the local Data Extensions root is cleared. Email validation presets the new DE's folder to the picked DE's folder (`detail.categoryId`); tree is h-80 like the DE tree. Tests: `components/data/__tests__/DEFolderPicker.test.js`. Not yet checked live.
- Email validation DE picker on the page (user, 2026-11-06, uncommitted): `components/data/DEPickPanel.vue` (DEBrowser tree + details) replaces DEPickerDialog there. Details from `utils/deProperties.js` (rows, sendable, send relationship, testable, retention, key, folder, dates) and the field list. The sendable property names are the ones createDE.js sends; not yet confirmed in a GET response from a live org, so a missing one is left out. DEBrowser got `selectedLabel` ("selected" in pickers instead of "in query").
