// Email address validation (user, 2026-11-02): an automation that keeps every
// subscriber's email address validated with SFMC's REST endpoint
// POST /address/v1/validateEmail, a batch per run.
//
// Step 1 (query, Update): new subscribers, and subscribers whose address changed,
//   go into the results DE with their validation cleared.
// Step 2 (query, Overwrite): the oldest N rows not yet validated go into the batch DE.
// Step 3 (Script activity, SSJS): gets a token with the client ID and secret the user
//   puts in the settings DE, validates each batch row and writes the result back.
//   SFMC stops a Script activity after 30 minutes, so the script stops itself before
//   its time limit; what it did not reach stays unvalidated and is in the next batch.
//
// Needs Script activities (the SERVER_SIDE_JS_ACTIVITY business rule; a business unit
// without it refuses to create one, checked live 2026-11-02) and an installed package
// with a Server-to-Server API integration. The script has not been run live.

const text = (name, length, extra = {}) => ({ name, type: 'text', length, ...extra })
const key = (name) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-de`
const VALIDATOR_IDS = { syntax: 'SyntaxValidator', mx: 'MXValidator', listDetective: 'ListDetectiveValidator' }
const jsString = (s) => JSON.stringify(String(s))
const sqlName = (s) => `[${String(s).replace(/]/g, ']]')}]`

export const MAX_BATCH = 500000

export const emailValidationTemplate = {
  id: 'email-validation',
  title: 'Email address validation',
  summary: 'Validates every subscriber\'s email address with SFMC\'s validation API, a batch per run: new and changed subscribers are added, the next unvalidated batch is picked, and a Script activity checks it and writes isValidEmail, invalidReason and APIresponse.',

  defaults: {
    fromParent: false,
    activeOnly: false,
    batchSize: 50000,
    minutes: 25,
    syntax: true,
    mx: true,
    listDetective: true,
    resultsName: 'Email Validation',
    batchName: 'Email Validation Batch',
    settingsName: 'Email Validation Settings',
    logName: 'Email Validation Log',
    automationName: 'Email address validation',
  },

  options: [
    { key: 'fromParent', label: 'Read subscribers from the parent business unit (ENT._Subscribers; needed in a child business unit)', type: 'checkbox' },
    { key: 'activeOnly', label: 'Only active subscribers (skip unsubscribed, held and bounced)', type: 'checkbox' },
    { key: 'batchSize', label: 'Rows per run (the batch)', type: 'number', min: 1, max: MAX_BATCH },
    { key: 'minutes', label: 'Script time limit in minutes (SFMC stops Script activities at 30)', type: 'number', min: 1, max: 28 },
    { key: 'syntax', label: 'Check: syntax', type: 'checkbox' },
    { key: 'mx', label: 'Check: mail server (MX record)', type: 'checkbox' },
    { key: 'listDetective', label: 'Check: List Detective (known bad, role and spam-trap addresses)', type: 'checkbox' },
    { key: 'resultsName', label: 'Results data extension name', type: 'text' },
    { key: 'batchName', label: 'Batch data extension name', type: 'text' },
    { key: 'settingsName', label: 'Settings data extension name (holds the client ID and secret)', type: 'text' },
    { key: 'logName', label: 'Run log data extension name', type: 'text' },
    { key: 'automationName', label: 'Automation name', type: 'text' },
  ],

  before: [
    'Needs Script activities in Automation Studio. If this business unit does not have them, SFMC refuses to create the Script activity ("SERVER_SIDE_JS_ACTIVITY business rule"); Salesforce support can turn them on.',
    'Make an installed package (Setup > Apps > Installed Packages) with an API Integration component of type Server-to-Server. Note its Client Id, Client Secret and Authentication Base URI. If the validation calls come back 403, give the component more scopes (the error is written to APIresponse).',
    'Each address is one API call. A run checks as many as it can within the time limit, typically a few thousand to over ten thousand; the rest are checked in later runs.',
  ],

  after: (o) => [
    `Open "${o.settingsName}" in Contact Builder and add one row: ClientId, ClientSecret and AuthBaseUri from the installed package (AuthBaseUri looks like https://<subdomain>.auth.marketingcloudapis.com/), and AccountId (the MID of this business unit) if the package is installed in more than one. Anyone who can read this data extension can read the secret: keep it in a folder only admins can open.`,
    `Run "${o.automationName}" once in Automation Studio (Run Once), then check "${o.logName}" and a few rows of "${o.resultsName}". It is not scheduled and was not run.`,
    'Schedule it (hourly is common) until every address is validated; later runs only check new and changed subscribers and what earlier runs did not reach.',
    `Rows the API could not check (for example a rate limit) keep ValidatedDate empty with the error in invalidReason and APIresponse, so the next run tries them again.`,
  ],

  plan(o) {
    const validators = Object.entries(VALIDATOR_IDS).filter(([k]) => o[k]).map(([, v]) => v)
    if (!validators.length) throw new Error('Pick at least one check.')
    const batch = Number.isInteger(o.batchSize) && o.batchSize > 0 && o.batchSize <= MAX_BATCH ? o.batchSize : 50000
    const minutes = Number.isInteger(o.minutes) && o.minutes > 0 && o.minutes <= 28 ? o.minutes : 25
    const names = [o.resultsName, o.batchName, o.settingsName, o.logName].map((n) => String(n || '').trim())
    if (names.some((n) => !n)) throw new Error('Name every data extension.')
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new Error('Give the data extensions different names.')

    const results = {
      ref: 'results', name: o.resultsName, key: key(o.resultsName),
      fields: [
        text('SubscriberKey', 254, { isPrimaryKey: true, isNullable: false }), text('EmailAddress', 254),
        { name: 'isValidEmail', type: 'boolean' }, text('invalidReason', 500), text('APIresponse', 4000),
        { name: 'ValidatedDate', type: 'date' }, { name: 'AddedDate', type: 'date' },
      ],
    }
    const batchDE = {
      ref: 'batch', name: o.batchName, key: key(o.batchName),
      fields: [text('SubscriberKey', 254, { isPrimaryKey: true, isNullable: false }), text('EmailAddress', 254)],
    }
    const settings = {
      ref: 'settings', name: o.settingsName, key: key(o.settingsName),
      fields: [text('ClientId', 100, { isPrimaryKey: true, isNullable: false }), text('ClientSecret', 200), text('AuthBaseUri', 254), text('AccountId', 20)],
    }
    const log = {
      ref: 'log', name: o.logName, key: key(o.logName),
      fields: [
        text('RunId', 50, { isPrimaryKey: true, isNullable: false }), { name: 'StartedDate', type: 'date' }, { name: 'EndedDate', type: 'date' },
        { name: 'BatchRows', type: 'number' }, { name: 'Checked', type: 'number' }, { name: 'Valid', type: 'number' }, { name: 'NotValid', type: 'number' },
        { name: 'NotChecked', type: 'number' }, { name: 'StoppedAtTimeLimit', type: 'boolean' }, text('Message', 4000),
      ],
    }
    const subs = o.fromParent ? 'ENT._Subscribers' : '_Subscribers'
    const add = {
      ref: 'add', name: `${o.automationName} - Add new and changed subscribers`, target: 'results', updateType: 1,
      sql: `SELECT
    s.SubscriberKey,
    s.EmailAddress,
    GETDATE() AS AddedDate,
    CAST(NULL AS BIT) AS isValidEmail,
    CAST(NULL AS NVARCHAR(500)) AS invalidReason,
    CAST(NULL AS NVARCHAR(4000)) AS APIresponse,
    CAST(NULL AS DATETIME) AS ValidatedDate
FROM ${subs} AS s
    LEFT JOIN ${sqlName(o.resultsName)} AS v ON v.SubscriberKey = s.SubscriberKey
WHERE (v.SubscriberKey IS NULL OR ISNULL(v.EmailAddress, '') <> ISNULL(s.EmailAddress, ''))${o.activeOnly ? "\n    AND s.Status = 'active'" : ''}`,
    }
    const pick = {
      ref: 'pick', name: `${o.automationName} - Next batch`, target: 'batch', updateType: 0,
      sql: `SELECT TOP ${batch}
    v.SubscriberKey,
    v.EmailAddress
FROM ${sqlName(o.resultsName)} AS v
WHERE v.ValidatedDate IS NULL
ORDER BY v.AddedDate, v.SubscriberKey`,
    }
    const script = {
      ref: 'validate', name: `${o.automationName} - Validate batch`, key: `${key(o.automationName).replace(/-de$/, '')}-script`,
      script: validationScript({ resultsKey: results.key, batchKey: batchDE.key, settingsKey: settings.key, logKey: log.key, validators, minutes }),
    }
    return {
      des: [results, batchDE, settings, log],
      queries: [add, pick],
      scripts: [script],
      automation: {
        name: o.automationName,
        description: 'Created by Marketing Cloud Toolkit (Email address validation template). Validates a batch of subscriber email addresses per run.',
        steps: [
          { name: 'Step 1', queries: [add.ref] },
          { name: 'Step 2', queries: [pick.ref] },
          { name: 'Step 3', queries: [], scripts: [script.ref] },
        ],
      },
    }
  },
}

/** The SSJS for step 3 (ES3: SFMC's server-side JavaScript has no let, const or arrow functions). */
export function validationScript({ resultsKey, batchKey, settingsKey, logKey, validators, minutes }) {
  return `<script runat="server">
Platform.Load("core", "1.1.1");
// Created by Marketing Cloud Toolkit (Email address validation template).
// Validates the rows of the batch data extension with POST /address/v1/validateEmail and
// writes isValidEmail, invalidReason, APIresponse and ValidatedDate to the results data extension.
var RESULTS_KEY = ${jsString(resultsKey)};
var BATCH_KEY = ${jsString(batchKey)};
var SETTINGS_KEY = ${jsString(settingsKey)};
var LOG_KEY = ${jsString(logKey)};
var VALIDATORS = ${JSON.stringify(validators)};
var TIME_LIMIT_MS = ${minutes} * 60 * 1000;
var WRITE_BATCH = 200;
var MAX_ERRORS_IN_A_ROW = 25;
var REASONS = {
  SyntaxValidator: "Syntax: the address is not written correctly",
  MXValidator: "Mail server: the domain has no mail server (MX record)",
  ListDetectiveValidator: "List Detective: SFMC treats this address as known bad, a role address, a spam trap or a domain that takes no mail"
};

var started = new Date().getTime();
var api = new Script.Util.WSProxy();
var runId = Platform.Function.GUID();
var counts = { rows: 0, checked: 0, valid: 0, invalid: 0, notChecked: 0 };
var stoppedAtLimit = false;
var message = "";
var pending = [];
var token = null, tokenAt = 0, restBase = "", cfg = null;

function pad(n) { return (n < 10 ? "0" : "") + n; }
function stamp(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
function cut(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.substring(0, n) : s; }
function slash(u) { u = String(u || ""); return u.charAt(u.length - 1) == "/" ? u : u + "/"; }

function post(url, body, bearer) {
  var req = new Script.Util.HttpRequest(url);
  req.emptyContentHandling = 0;
  req.retries = 1;
  req.continueOnError = true;
  req.contentType = "application/json";
  req.method = "POST";
  if (bearer) req.setHeader("Authorization", "Bearer " + bearer);
  req.postData = Stringify(body);
  var resp = req.send();
  return { status: Number(resp.statusCode), text: String(resp.content) };
}

function getToken() {
  var body = { grant_type: "client_credentials", client_id: cfg.ClientId, client_secret: cfg.ClientSecret };
  if (cfg.AccountId) body.account_id = String(cfg.AccountId);
  var r = post(slash(cfg.AuthBaseUri) + "v2/token", body);
  if (r.status != 200) throw "Token request failed (HTTP " + r.status + "): " + cut(r.text, 300);
  var j = Platform.Function.ParseJSON(r.text);
  token = j.access_token;
  restBase = slash(j.rest_instance_url);
  tokenAt = new Date().getTime();
}

function flush() {
  if (!pending.length) return;
  var r = api.updateBatch("DataExtensionObject", pending, { SaveOptions: [{ PropertyName: "*", SaveAction: "UpdateAdd" }] });
  pending = [];
  if (r && r.Status && r.Status != "OK") message += "Write: " + cut(Stringify(r.Results && r.Results[0] ? r.Results[0].StatusMessage : r.Status), 300) + " ";
}

function save(subscriberKey, props) {
  var list = [{ Name: "SubscriberKey", Value: subscriberKey }];
  for (var k in props) list.push({ Name: k, Value: props[k] });
  pending.push({ CustomerKey: RESULTS_KEY, Properties: list });
  if (pending.length >= WRITE_BATCH) flush();
}

function readBatch() {
  var rows = [];
  var res = api.retrieve("DataExtensionObject[" + BATCH_KEY + "]", ["SubscriberKey", "EmailAddress"]);
  while (res) {
    for (var i = 0; i < res.Results.length; i++) {
      var o = {}, p = res.Results[i].Properties;
      for (var j = 0; j < p.length; j++) o[p[j].Name] = p[j].Value;
      rows.push(o);
    }
    if (!res.HasMoreRows) break;
    res = api.getNextBatch("DataExtensionObject[" + BATCH_KEY + "]", res.RequestID);
  }
  return rows;
}

try {
  var settingsRows = DataExtension.Init(SETTINGS_KEY).Rows.Retrieve();
  cfg = settingsRows && settingsRows.length ? settingsRows[0] : null;
  if (!cfg || !cfg.ClientId || !cfg.ClientSecret || !cfg.AuthBaseUri) throw "Add the ClientId, ClientSecret and AuthBaseUri of an installed package to the settings data extension.";
  getToken();
  var rows = readBatch();
  counts.rows = rows.length;
  var errorsInARow = 0;
  for (var i = 0; i < rows.length; i++) {
    if (new Date().getTime() - started > TIME_LIMIT_MS) { stoppedAtLimit = true; break; }
    if (new Date().getTime() - tokenAt > 15 * 60 * 1000) getToken();
    var row = rows[i];
    var email = String(row.EmailAddress || "");
    if (!email) {
      save(row.SubscriberKey, { isValidEmail: "false", invalidReason: "No email address", APIresponse: "", ValidatedDate: stamp(new Date()) });
      counts.checked++; counts.invalid++;
      continue;
    }
    var r = post(restBase + "address/v1/validateEmail", { email: email, validators: VALIDATORS }, token);
    if (r.status == 401) { getToken(); r = post(restBase + "address/v1/validateEmail", { email: email, validators: VALIDATORS }, token); }
    if (r.status == 200) {
      errorsInARow = 0;
      var j = Platform.Function.ParseJSON(r.text);
      var ok = j.valid === true || String(j.valid) == "true";
      var reason = ok ? "" : (REASONS[j.failedValidation] || String(j.failedValidation || "Not valid (SFMC gave no reason)"));
      save(row.SubscriberKey, { isValidEmail: ok ? "true" : "false", invalidReason: reason, APIresponse: cut(r.text, 4000), ValidatedDate: stamp(new Date()) });
      counts.checked++;
      if (ok) counts.valid++; else counts.invalid++;
    } else {
      // Not checked: ValidatedDate stays empty, so the next run tries again.
      save(row.SubscriberKey, { invalidReason: cut("Not checked: HTTP " + r.status, 500), APIresponse: cut(r.text, 4000) });
      counts.notChecked++;
      if (++errorsInARow >= MAX_ERRORS_IN_A_ROW) { message += "Stopped after " + errorsInARow + " failed calls in a row (last HTTP " + r.status + "). "; break; }
    }
  }
  flush();
} catch (e) {
  try { flush(); } catch (e2) {}
  message += "Error: " + cut(Stringify(e), 1000);
}

try {
  api.createItem("DataExtensionObject", { CustomerKey: LOG_KEY, Properties: [
    { Name: "RunId", Value: runId }, { Name: "StartedDate", Value: stamp(new Date(started)) }, { Name: "EndedDate", Value: stamp(new Date()) },
    { Name: "BatchRows", Value: counts.rows }, { Name: "Checked", Value: counts.checked }, { Name: "Valid", Value: counts.valid },
    { Name: "NotValid", Value: counts.invalid }, { Name: "NotChecked", Value: counts.notChecked },
    { Name: "StoppedAtTimeLimit", Value: stoppedAtLimit ? "true" : "false" }, { Name: "Message", Value: cut(message, 4000) }
  ] });
} catch (e) {}
</script>`
}
