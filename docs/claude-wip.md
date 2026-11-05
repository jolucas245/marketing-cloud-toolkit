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
