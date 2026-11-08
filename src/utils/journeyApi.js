// Journey entry events (event definitions), from SFMC Automation Viewer's Journey
// Activity Details. Journey Builder is reached with its own session cookies; the
// service worker starts that session when needed (src/background/sessions.js).
import { sfmcFetch } from './sfmcApi.js'
import { formatValue } from './activityTypes.js'
import { formatDateTime } from './format.js'

export const EVENT_TYPES = {
  EmailAudience: 'Data Extension (Email Audience)',
  ContactAudience: 'Contact Audience',
  AutomationAudience: 'Data Extension sent from Automation Studio',
  APIEvent: 'API Event',
  CloudPagesSmartCaptureSubmissionEvent: 'CloudPages',
  SalesforceObjectTriggerV2: 'Salesforce Data',
  ContactEvent: 'Contact Event',
}
export const EVENT_CATEGORIES = { Audience: 'Audience', Event: 'Event', ContactEvent: 'Contact Event' }

export async function fetchEventDefinitions(stack) {
  const data = await sfmcFetch(`https://jbinteractions.${stack}.marketingcloudapps.com/fuelapi/interaction/v1/eventDefinitions?$page=1&$pagesize=1000&$orderBy=modifiedDate%20desc`, 'GET')
  const items = data?.items || []
  return { items, total: data?.count ?? items.length }
}

const has = (value, part) => String(value ?? '').toLowerCase().includes(String(part).trim().toLowerCase())

/**
 * Client-side filters. Text filters are case-insensitive "contains"; `journeyStatus`
 * is 'active' (published in a journey) or 'inactive'; `scheduledFrom` keeps event
 * definitions whose schedule ends on or after that day.
 * (Automation Viewer's Event Definition Key filter read the DE ID box; fixed here.)
 */
export function filterEventDefinitions(items, f = {}, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return items.filter((it) =>
    (!f.type || it.type === f.type) &&
    (!f.category || it.category === f.category) &&
    (!f.name?.trim() || has(it.name, f.name)) &&
    (!f.key?.trim() || has(it.eventDefinitionKey, f.key)) &&
    (!f.deName?.trim() || has(it.dataExtensionName, f.deName)) &&
    (!f.deId?.trim() || has(it.dataExtensionId, f.deId)) &&
    (!f.journeyStatus || (f.journeyStatus === 'active' ? Number(it.publishedInteractionCount) > 0 : !Number(it.publishedInteractionCount))) &&
    (!f.scheduledFrom || (it.schedule?.endDateTime && new Date(it.schedule.endDateTime) >= today)))
}

const kv = (title, obj) => (obj && typeof obj === 'object' && Object.keys(obj).length
  ? { title, columns: ['Property', 'Value'], rows: Object.entries(obj).map(([k, v]) => [k, formatValue(v)]) }
  : null)

// Icon kind (components/results/ActivityIcon.vue) per entry type. Journey Builder's own
// icons are white glyphs drawn for its coloured tiles, so on the card's light header
// they showed as an empty box, and the Salesforce ones answer 404 (live test, 2026-11-07).
const AUDIENCE_TYPES = new Set(['EmailAudience', 'ContactAudience', 'AutomationAudience'])
export const eventIconType = (it) => (AUDIENCE_TYPES.has(it?.type) || it?.category === 'Audience' ? 'audience' : 'journey')

// The all-zero GUID SFMC sends when an event has no automation (API events, for example).
const isEmptyGuid = (v) => /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(String(v || ''))
export const eventAutomationId = (it) => (it?.automationId && !isEmptyGuid(it.automationId) ? it.automationId : null)

const dateValue = (v) => formatValue(formatDateTime(v))

/**
 * Display data for ActivityCard (see utils/activityTypes.js).
 * interactionCount and publishedInteractionCount count journey versions, not journeys:
 * a journey with versions 1 (Unpublished), 2 (Published) and 3 (Draft) gives 3 and 1
 * (live test, 2026-11-07). createdBy and modifiedBy are user IDs; SFMC gives no cheap
 * way to name them from here, so they are labelled as IDs.
 */
export function describeEventDefinition(it) {
  const published = Number(it.publishedInteractionCount) || 0
  const automationId = eventAutomationId(it)
  return {
    typeLabel: EVENT_TYPES[it.type] || it.type || 'Event',
    title: it.name || it.eventDefinitionKey || 'Event definition',
    icon: null,
    iconType: eventIconType(it),
    link: null,
    main: [
      ['Event definition key', formatValue(it.eventDefinitionKey)],
      ['Data extension', formatValue(it.dataExtensionName)],
      ['Journey status', published ? `Active (${published} published ${published === 1 ? 'version' : 'versions'})` : 'Not active'],
      ['Journey versions using it', formatValue(it.interactionCount)],
      ['Category', formatValue(it.category)],
      ['Mode', formatValue(it.mode)],
      ...(automationId ? [['Automation ID', automationId]] : []),
      ['Created', dateValue(it.createdDate)], ['Modified', dateValue(it.modifiedDate)],
    ],
    extra: [
      ['Description', formatValue(it.description)], ['Type', formatValue(it.type)], ['Data extension ID', formatValue(it.dataExtensionId)],
      ['ID', formatValue(it.id)], ['Created by (user ID)', formatValue(it.createdBy)], ['Modified by (user ID)', formatValue(it.modifiedBy)],
      ['Source application extension ID', formatValue(it.sourceApplicationExtensionId)],
      ['Platform object', formatValue(it.isPlatformObject)], ['Visible in picker', formatValue(it.isVisibleInPicker)],
      ['Arguments: criteria', formatValue(it.arguments?.criteria)], ['Arguments: serialized object type', formatValue(it.arguments?.serializedObjectType)],
      ['Arguments: event definition ID', formatValue(it.arguments?.eventDefinitionId)],
    ],
    code: null,
    tables: [kv('Schedule', it.schedule), { ...(kv('Metadata', it.metaData) || {}), extra: true }].filter((t) => t?.rows),
    // View, SFMC link and row count next to the data extension (feedback #72).
    deRefs: it.dataExtensionName ? { 'Data extension': { name: it.dataExtensionName, id: it.dataExtensionId || null, key: null } } : {},
  }
}
