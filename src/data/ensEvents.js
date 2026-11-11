// Event Notification Service: the notification types a subscription can ask for, from
// Salesforce's documentation (read 2026-11-10: guide/transactional_email_events,
// engagement_email_events, transactional_sms_events, automation_studio_events,
// mobilepush_events, engagement_ott_events_delivery_receipts, ens-subscription-filters).
// SFMC has no API that lists them, so they are kept here. A subscription names them as
// "<category>.<type>", e.g. TransactionalSendEvents.EmailSent.

export const ENS_DOCS = 'https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/ens-supported-events.html'

export const ENS_EVENT_GROUPS = [
  { title: 'Transactional email', doc: 'transactional_email_events', events: [
    ['TransactionalSendEvents.EmailSent', 'A transactional email was sent.', 'definitionKey'],
    ['TransactionalSendEvents.EmailNotSent', 'A transactional email was not sent (with a status code).', 'definitionKey, statusCode'],
    ['TransactionalSendEvents.EmailBounced', 'A transactional email bounced.', 'definitionKey, bounceCode, smtpReason'],
  ] },
  { title: 'Engagement (email)', doc: 'engagement_email_events', events: [
    ['EngagementEvents.EmailOpen', 'An email was opened.', ''],
    ['EngagementEvents.EmailClick', 'A link in an email was clicked.', ''],
    ['EngagementEvents.EmailUnsubscribe', 'Someone unsubscribed from an email.', ''],
  ] },
  { title: 'Transactional SMS', doc: 'transactional_sms_events', events: [
    ['TransactionalSendEvents.SmsSent', 'A transactional SMS was sent.', 'definitionKey'],
    ['TransactionalSendEvents.SmsNotSent', 'A transactional SMS was not sent.', 'definitionKey, statusCode'],
    ['TransactionalSendEvents.SmsTransient', 'A transactional SMS hit a temporary failure.', ''],
    ['TransactionalSendEvents.SmsDelivered', 'A transactional SMS was delivered.', ''],
    ['TransactionalSendEvents.SmsBounced', 'A transactional SMS bounced.', ''],
  ] },
  { title: 'Automation Studio', doc: 'automation_studio_events', events: [
    ['SendEvents.AutomationInstanceStarted', 'An automation run started.', 'automationName, automationCustomerKey, automationType'],
    ['SendEvents.AutomationInstanceCompleted', 'An automation run completed.', 'automationName, automationCustomerKey, automationType'],
    ['SendEvents.AutomationInstanceStopped', 'An automation run stopped.', 'automationName, automationCustomerKey, automationType'],
    ['SendEvents.AutomationInstanceErrored', 'An automation run stopped with an error.', 'automationName, automationCustomerKey, automationType'],
    ['SendEvents.AutomationInstanceSkipped', 'An automation run was skipped.', 'automationName, automationCustomerKey, automationType'],
  ] },
  { title: 'MobilePush', doc: 'mobilepush_events', events: [
    ['SendEvents.PushSent', 'A push message was sent.', 'sendMethod'],
    ['SendEvents.PushNotSent', 'A push message was not sent.', 'sendMethod'],
    ['SendEvents.PushBounced', 'A push message bounced.', 'sendMethod'],
    ['EngagementEvents.PushOpen', 'A push message was opened.', 'sendMethod'],
    ['EngagementEvents.PushDeliveryReceipt', 'A push delivery receipt arrived.', 'sendMethod'],
    ['EngagementEvents.PushImageClick', 'An image in a push message was tapped.', 'sendMethod'],
    ['EngagementEvents.PushButtonClick', 'A button in a push message was tapped.', 'sendMethod'],
    ['EngagementEvents.PushInstall', 'The app was installed.', ''],
    ['EngagementEvents.PushInactive', 'A device became inactive.', ''],
    ['EngagementEvents.InAppDisplay', 'An in-app message was shown.', ''],
    ['EngagementEvents.InAppDismiss', 'An in-app message was dismissed.', ''],
    ['EngagementEvents.InAppClick', 'An in-app message was tapped.', ''],
    ['EngagementEvents.InboxOpen', 'An inbox message was opened.', ''],
  ] },
  { title: 'OTT (WhatsApp, LINE) delivery receipts', doc: 'engagement_ott_events_delivery_receipts', events: [
    ['EngagementEvents.OttSent', 'An OTT message was sent.', 'sendMethod'],
    ['EngagementEvents.OttDelivered', 'An OTT message was delivered.', 'sendMethod'],
    ['EngagementEvents.OttRead', 'An OTT message was read.', 'sendMethod'],
    ['EngagementEvents.OttFailed', 'An OTT message failed.', 'sendMethod'],
  ] },
]

/** The group and description of a subscribed type, or null when the list above lacks it. */
export function ensEventInfo(type) {
  for (const g of ENS_EVENT_GROUPS) for (const [name, desc] of g.events) if (name.toLowerCase() === String(type || '').toLowerCase()) return { group: g.title, desc }
  return null
}

// A CloudPage (JSON Code Resource) that can be registered as an ENS callback URL. Not run
// by the Toolkit (read-only); the user copies it into Content Builder. SSJS has no
// HMAC-SHA256, so the signature header is stored with each event for checking elsewhere.
export const ENS_SAMPLE_DES = [
  { name: 'ENS_Verification', fields: 'CallbackId (Text 50), VerificationKey (Text 100), ReceivedAt (Date)' },
  { name: 'ENS_Events', fields: 'EventCategoryType (Text 100), DefinitionKey (Text 200, nullable), TimestampUTC (Text 20), Mid (Text 20), Signature (Text 200, nullable), Payload (Text 4000), ReceivedAt (Date)' },
]

export const ENS_SAMPLE_PAGE = `<script runat="server">
// Event Notification Service callback (sample from Marketing Cloud Toolkit).
// Publish as a JSON Code Resource; its URL has no query string, as ENS needs.
// ENS waits up to 3 seconds for a 2xx answer, so this only stores what arrives.
Platform.Load("Core", "1.1.1");
var raw = Platform.Request.GetPostData();
var signature = Platform.Request.GetRequestHeader("x-sfmc-ens-signature") || "";
var now = Platform.Function.Now();
try {
  var data = Platform.Function.ParseJSON(raw);
  if (data && data.verificationKey) {
    // Step 1 of registering this URL: keep the single-use key, then send it to
    // POST /platform/v1/ens-verify with { callbackId, verificationKey }.
    Platform.Function.InsertData("ENS_Verification",
      ["CallbackId", "VerificationKey", "ReceivedAt"],
      [data.callbackId, data.verificationKey, now]);
  } else if (data) {
    // Notifications arrive as a batch (an array of events).
    var events = data.length !== undefined ? data : [data];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var payload = Stringify(e);
      Platform.Function.InsertData("ENS_Events",
        ["EventCategoryType", "DefinitionKey", "TimestampUTC", "Mid", "Signature", "Payload", "ReceivedAt"],
        [e.eventCategoryType || "", e.definitionKey || "", String(e.timestampUTC || ""), String(e.mid || ""),
         i === 0 ? signature : "", payload.length > 4000 ? payload.substring(0, 4000) : payload, now]);
    }
  }
} catch (err) {
  // Answer 200 anyway: ENS retries failures for up to 7 days.
}
Write('{"ok":true}');
</script>`

export const ENS_VERIFY_CURL = `curl -X POST https://YOUR_SUBDOMAIN.rest.marketingcloudapis.com/platform/v1/ens-verify \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "callbackId": "<CallbackId from ENS_Verification>", "verificationKey": "<VerificationKey>" }'`
