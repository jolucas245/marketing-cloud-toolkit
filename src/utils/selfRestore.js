// "Restore by myself" (feedback #1045): instead of the Toolkit putting a version back,
// the person gets the exact request (method, REST path, JSON body) and sends it with
// their own API access (an installed package), for example with Postman or cURL.
// Restore stays available; this is the second option.

const KINDS = {
  email: { method: 'PUT', path: (id) => `/asset/v1/content/assets/${id}`, what: 'email', app: 'Content Builder', scopes: 'Saved Content: Write and Documents and Images: Write (Content Builder)', check: 'Reopen the email in Content Builder.' },
  cloudpage: { method: 'PUT', path: (id) => `/asset/v1/content/assets/${id}`, what: 'CloudPage', app: 'CloudPages', scopes: 'Saved Content: Write and Documents and Images: Write (Content Builder)', check: 'Reopen the page in CloudPages and publish it again to put it live.' },
  query: { method: 'PATCH', path: (id) => `/automation/v1/queries/${id}`, what: 'SQL Query activity', app: 'Automation Studio', scopes: 'Automations: Write (Automation)', check: 'Reopen the activity in Automation Studio.' },
  script: { method: 'PATCH', path: (id) => `/automation/v1/scripts/${id}`, what: 'Script activity', app: 'Automation Studio', scopes: 'Automations: Write (Automation)', check: 'Reopen the activity in Automation Studio.' },
}

const REST_BASE = 'https://YOUR_SUBDOMAIN.rest.marketingcloudapis.com'
const AUTH_BASE = 'https://YOUR_SUBDOMAIN.auth.marketingcloudapis.com'

const slug = (s) => String(s || 'restore').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'restore'

/**
 * The request that puts a version back.
 * @param {{ kind: 'email'|'cloudpage'|'query'|'script', id, name, versionLabel, savedAt, body }} v
 */
export function selfRestoreRequest({ kind, id, name, versionLabel, savedAt, body }) {
  const k = KINDS[kind]
  if (!k) throw new Error(`Unknown kind: ${kind}`)
  const path = k.path(encodeURIComponent(id))
  const file = `${slug(name)}-${slug(versionLabel)}-body.json`
  return { ...k, kind, method: k.method, path, url: `${REST_BASE}${path}`, body, file, name, versionLabel, savedAt }
}

export const bodyText = (req) => `${JSON.stringify(req.body, null, 2)}\n`

export function curlFor(req) {
  return [
    `curl -X ${req.method} "${req.url}" \\`,
    '  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\',
    '  -H "Content-Type: application/json" \\',
    `  --data @${req.file}`,
  ].join('\n')
}

export function tokenCurl() {
  return [
    `curl -X POST "${AUTH_BASE}/v2/token" \\`,
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"grant_type":"client_credentials","client_id":"YOUR_CLIENT_ID","client_secret":"YOUR_CLIENT_SECRET","account_id":"YOUR_MID"}\'',
  ].join('\n')
}

/** The steps, as plain lines. */
export function selfRestoreSteps(req) {
  return [
    `Download the request body (${req.file}). It is the ${req.what} as it was in ${req.versionLabel}.`,
    `In Marketing Cloud Setup > Apps > Installed Packages, use a package with an API Integration (Server-to-Server) that has ${req.scopes}, in the business unit that owns the ${req.what}.`,
    'Get an access token with its client ID and secret (the token call below). Use the subdomain from the package\'s Authentication Base URI, and the business unit\'s MID as account_id.',
    `Send ${req.method} ${req.path} to your REST Base URI with the token and the downloaded body (the request below, or the same in Postman).`,
    `${req.check} If something looks wrong, the newest version is still in the Toolkit.`,
  ]
}

/** Everything as one Markdown file, to keep or hand to someone with API access. */
export function selfRestoreMarkdown(req) {
  const when = req.savedAt ? new Date(req.savedAt).toISOString() : ''
  return [
    `# Restore ${req.what} "${req.name}" to ${req.versionLabel}`,
    '',
    when ? `Version saved ${when}. Made by Marketing Cloud Toolkit.` : 'Made by Marketing Cloud Toolkit.',
    '',
    '## Steps',
    '',
    ...selfRestoreSteps(req).map((s, i) => `${i + 1}. ${s}`),
    '',
    '## Get a token',
    '',
    '```sh',
    tokenCurl(),
    '```',
    '',
    '## Send the request',
    '',
    `${req.method} ${req.path}`,
    '',
    '```sh',
    curlFor(req),
    '```',
    '',
    `The body is in ${req.file}. Keep the client secret and the token to yourself; neither is in this file.`,
    '',
  ].join('\n')
}
