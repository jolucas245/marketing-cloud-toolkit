import { nodeDisplayType, nodeSummary, nodeTypeLabel } from './journeys.js'
import { JOURNEY_GEOMETRY, journeyFlowModel } from './journeyFlow.js'

export const ACTIVITY_WIDTH = JOURNEY_GEOMETRY.width
export const ACTIVITY_HEIGHT = JOURNEY_GEOMETRY.height
export const MIN_JOURNEY_ZOOM = 0.15
export const MAX_JOURNEY_ZOOM = 2.5

const visual = (icon, shape, color) => ({ icon, shape, color })
const MESSAGE = '#48c6c2'
const FLOW = '#f58a00'
const EINSTEIN = '#032d60'
const SALESFORCE = '#00a1e0'
const VISUALS = {
  ENTRY: visual('entry', 'circle', '#95d160'),
  EXIT: visual('exit', 'circle', '#95d160'),
  EMAIL: visual('email', 'square', MESSAGE),
  EMAILV2: visual('email', 'square', MESSAGE),
  SMSSYNC: visual('sms', 'square', MESSAGE),
  SMS: visual('sms', 'square', MESSAGE),
  SENDSMS: visual('sms', 'square', MESSAGE),
  SENDTOLINESYNC: visual('line', 'square', MESSAGE),
  WHATSAPPACTIVITY: visual('whatsapp', 'square', MESSAGE),
  WHATSAPPSESSIONTRANSFERACTIVITY: visual('sessionTransfer', 'square', MESSAGE),
  PUSH: visual('push', 'square', MESSAGE),
  PUSHNOTIFICATIONACTIVITY: visual('push', 'square', MESSAGE),
  INAPPSYNCACTIVITY: visual('mobile', 'square', MESSAGE),
  INBOXACTIVITY: visual('inbox', 'square', MESSAGE),
  PUSHINBOXACTIVITY: visual('inbox', 'square', MESSAGE),
  MULTICRITERIADECISION: visual('decision', 'diamond', FLOW),
  DECISIONSPLIT: visual('decision', 'diamond', FLOW),
  CONTACTDECISION: visual('decision', 'diamond', FLOW),
  ENGAGEMENTSPLIT: visual('engagement', 'diamond', FLOW),
  ENGAGEMENTDECISION: visual('engagement', 'diamond', FLOW),
  RANDOMSPLIT: visual('random', 'diamond', FLOW),
  ABNTEST: visual('optimizer', 'diamond', FLOW),
  ABNTESTSTOP: visual('winner', 'circle', FLOW),
  EINSTEINSPLIT: visual('engagement', 'diamond', EINSTEIN),
  STOWAIT: visual('wait', 'diamond', EINSTEIN),
  WAITUNTILSPECIFICDATE: visual('waitDate', 'diamond', FLOW),
  WAITUNTILDATE: visual('waitDate', 'diamond', FLOW),
  WAITBYATTRIBUTE: visual('waitAttribute', 'diamond', FLOW),
  WAITUNTILCHATRESPONSE: visual('waitChat', 'diamond', FLOW),
  WAITUNTILAPI: visual('waitEvent', 'diamond', FLOW),
  WAITUNTILEVENT: visual('waitEvent', 'diamond', FLOW),
  WAITUNTILPUSHINAPPENGAGEMENT: visual('waitInApp', 'diamond', FLOW),
  UPDATECONTACTDATA: visual('contact', 'square', MESSAGE),
  SALESCLOUDACTIVITY: visual('cloud', 'square', '#167bbb'),
  SALESFORCESALESCLOUDACTIVITY: visual('cloud', 'square', '#167bbb'),
  OBJECTACTIVITY: visual('cloud', 'square', '#167bbb'),
  SALESFORCEACCOUNTACTIVITY: visual('salesforceAccount', 'square', SALESFORCE),
  SALESFORCECAMPAIGNMEMBERACTIVITY: visual('salesforceCampaign', 'square', SALESFORCE),
  SALESFORCECASEANDCONTACTACTIVITY: visual('salesforceCase', 'square', SALESFORCE),
  SALESFORCECONTACTACTIVITY: visual('salesforceContact', 'square', SALESFORCE),
  SALESFORCELEADCONVERSIONACTIVITY: visual('salesforceConvertLead', 'square', SALESFORCE),
  SALESFORCELEADACTIVITY: visual('salesforceLead', 'square', SALESFORCE),
  SALESFORCEGENERICOBJECTACTIVITY: visual('salesforceObject', 'square', SALESFORCE),
  SALESFORCEOPPORTUNITY: visual('salesforceOpportunity', 'square', SALESFORCE),
  SALESFORCETASKACTIVITY: visual('salesforceTask', 'square', SALESFORCE),
  REST: visual('custom', 'square', '#65758b'),
  EVENT: visual('event', 'square', '#167bbb'),
  JOIN: visual('join', 'diamond', FLOW),
}

export const JOURNEY_ICON_PATHS = {
  salesforceAccount: [
    'M2 0h20a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2ZM7.5 1l4 4H23V2a1 1 0 0 0-1-1Z',
  ],
  salesforceCampaign: [
    'M10.5 0a10.5 10.5 0 0 1 10.45 11.5h-1.8a8.7 8.7 0 1 0-7.65 7.65v1.8A10.5 10.5 0 1 1 10.5 0ZM10.5 3.5a7 7 0 0 1 6.92 8h-1.85a5.2 5.2 0 1 0-4.07 4.07v1.85a7 7 0 1 1-1-13.92ZM14 10.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 1 1 7 0Z',
    'M24 18a6 6 0 1 1-12 0 6 6 0 1 1 12 0ZM17 13.5V17h-3.5v2H17v3.5h2V19h3.5v-2H19v-3.5Z',
  ],
  salesforceCase: [
    'M7 0h10a1 1 0 0 1 1 1v3h-2V2H8v2H6V1a1 1 0 0 1 1-1ZM2 4h20a2 2 0 0 1 2 2v5H14V9h-4v2H0V6a2 2 0 0 1 2-2ZM0 12h10v4h4v-4h10v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2Z',
  ],
  salesforceContact: [
    'M10 4a4.5 4.5 0 0 1 7.1-.5A5.3 5.3 0 1 1 19 14a5 5 0 0 1-7.9 2.7 4.7 4.7 0 0 1-7.5-1.6A3.5 3.5 0 0 1 2 8.5a4.6 4.6 0 0 1 8-4.5ZM10 6.5c-1.5 0-2.2 1.1-2 2.5.1.8.4 1.5.9 2v.8c-.3.5-1.4.8-2.7 1.2-.9.3-1.2 1-1.2 1.6h10c0-.6-.3-1.3-1.2-1.6-1.3-.4-2.4-.7-2.7-1.2V11c.5-.5.8-1.2.9-2 .2-1.4-.5-2.5-2-2.5ZM14 7.5v1h4v-1ZM14 10v1h3v-1Z',
  ],
  salesforceConvertLead: [
    'M7 2a2 2 0 1 1-4 0 2 2 0 1 1 4 0ZM.5 4h9c.5 0 .7.6.3.9L7 7l1 3.6c.2.6-.4 1-.8.5L5 8.6l-2.2 2.5c-.4.5-1 .1-.8-.5L3 7 .2 4.9c-.4-.3-.2-.9.3-.9ZM15 7c-2 0-3 1.5-2.7 3.5.1 1.1.5 2 1.2 2.7v1.2c-.5.7-1.9 1.2-3.7 1.8-1.3.4-1.8 1.3-1.8 2.3V21h14v-2.5c0-1-.5-1.9-1.8-2.3-1.8-.6-3.2-1.1-3.7-1.8v-1.2c.7-.7 1.1-1.6 1.2-2.7C18 8.5 17 7 15 7ZM19 7h5v1.5h-5ZM19 10h5v1.5h-5Z',
  ],
  salesforceLead: [
    'M15.5 3.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 1 1 7 0ZM1.5 9h21c1.1 0 1.5 1.4.5 1.9l-6.4 3.4 2.8 8.1c.4 1.2-1.1 2-1.8 1L12 17.3l-5.6 6.1c-.7 1-2.2.2-1.8-1l2.8-8.1L1 10.9c-1-.5-.6-1.9.5-1.9Z',
  ],
  salesforceObject: [
    'M2 0h16a2 2 0 0 1 2 2v9a7 7 0 0 0-9 9H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2ZM3.5 4v2h3V4ZM8 4v2h8V4ZM3.5 8v2H16V8ZM3.5 12v2h7v-2Z',
    'M24 18a6 6 0 1 1-12 0 6 6 0 1 1 12 0ZM13.5 18c1.2-1.9 2.8-2.8 4.5-2.8s3.3.9 4.5 2.8c-1.2 1.9-2.8 2.8-4.5 2.8s-3.3-.9-4.5-2.8ZM19.8 18a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 1 1 3.6 0Z',
  ],
  salesforceOpportunity: [
    'M3 8.5 8 11l4-6 4 6 5-2.5-3 11H6ZM3.4 8a1.7 1.7 0 1 1-3.4 0 1.7 1.7 0 1 1 3.4 0ZM13.7 3.4a1.7 1.7 0 1 1-3.4 0 1.7 1.7 0 1 1 3.4 0ZM24 8a1.7 1.7 0 1 1-3.4 0A1.7 1.7 0 1 1 24 8Z',
  ],
  salesforceTask: [
    'M2 0h20a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2ZM4.3 13.7l4 4a1.7 1.7 0 0 0 2.4 0l9-9a1.7 1.7 0 0 0-2.4-2.4l-7.8 7.8-2.8-2.8a1.7 1.7 0 0 0-2.4 2.4Z',
  ],
  sessionTransfer: ['M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z'],
  line: ['M12 2.5C5.9 2.5 1 6.4 1 11.3c0 4.2 3.7 7.7 8.7 8.6.7.2.8.5.7 1.1l-.3 1.8c-.1.5.3.8.8.6 2.1-.8 6.8-3.8 9-6.4C22 14.9 23 13.3 23 11.3 23 6.4 18.1 2.5 12 2.5Z'],
  entry: ['M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', 'M8 8h1m3 0h4M8 12h1m3 0h4M8 16h1m3 0h4'],
  exit: ['M11 5H5v14h6', 'M9 12h11m-4-4 4 4-4 4'],
  email: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z','M2 7l7.4 6.2a4 4 0 0 0 5.2 0L22 7M2 17l6-5m14 5-6-5',],
  sms: [
    'M8 1.5h8a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-17a2 2 0 0 1 2-2ZM7.5 4.5v14h9v-14ZM10.3 2.7v.4h3.4v-.4ZM10.8 20v1.2h2.4V20Z',
    'M9 6h6a.5.5 0 0 1 .5.5v2.3a.5.5 0 0 1-.5.5H9a.5.5 0 0 1-.5-.5V6.5A.5.5 0 0 1 9 6ZM9 10.4h6a.5.5 0 0 1 .5.5v2.3a.5.5 0 0 1-.5.5H9a.5.5 0 0 1-.5-.5v-2.3a.5.5 0 0 1 .5-.5Z',
  ],
  whatsapp: [
    'M12 2a9.5 9.5 0 0 1 0 19 9.4 9.4 0 0 1-4.5-1.1L2 21.5l1.5-5.4A9.5 9.5 0 0 1 12 2ZM12 3.7a7.8 7.8 0 0 0-6.6 12l.3.5-.9 3.1 3.2-.8.5.3A7.8 7.8 0 1 0 12 3.7Z',
    'M9.5 6.6c-.3-.3-.8-.3-1.1-.1l-.9.8c-.5.5-.6 1.2-.4 1.9.8 3.5 3.5 6.2 7 7 .7.2 1.4 0 1.9-.4l.8-.9c.3-.3.2-.8-.1-1.1l-2-1.2c-.3-.2-.7-.1-.9.1l-.8 1c-1.7-.7-3-2-3.8-3.8l1-.8c.3-.2.3-.6.1-.9Z',
  ],
  push: [
    'M8 1.5h8a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-17a2 2 0 0 1 2-2ZM7.5 4.5v14h9v-14ZM10.3 2.7v.4h3.4v-.4ZM10.8 20v1.2h2.4V20Z',
    'M12 6a1.6 1.6 0 0 1 1.6 1.6c0 1.8-1 5.3-1.6 5.3s-1.6-3.5-1.6-5.3A1.6 1.6 0 0 1 12 6Z',
    'M13.35 15.6a1.35 1.35 0 1 1-2.7 0 1.35 1.35 0 1 1 2.7 0Z',
  ],
  mobile: [
    'M8 1.5h8a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-17a2 2 0 0 1 2-2ZM7.5 4.5v14h9v-14ZM10.3 2.7v.4h3.4v-.4ZM10.8 20v1.2h2.4V20Z',
    'M9 8h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM9.5 9.5v2h2v-2ZM12.2 9.5v.6h2.3v-.6ZM12.2 10.8v.6h2.3v-.6ZM9.5 12.5v.6h5v-.6ZM9.5 14v.6h4.3V14Z',
  ],
  inbox: [
    'M8 1.5h8a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-17a2 2 0 0 1 2-2ZM7.5 4.5v14h9v-14ZM10.3 2.7v.4h3.4v-.4ZM10.8 20v1.2h2.4V20Z',
    'M8.6 8h6.8a.6.6 0 0 1 .6.6v5a.6.6 0 0 1-.6.6H8.6a.6.6 0 0 1-.6-.6v-5a.6.6 0 0 1 .6-.6ZM8 9.2l3.3 2.9c.4.4 1 .4 1.4 0L16 9.2v-.9l-3.7 3.2a.45.45 0 0 1-.6 0L8 8.3Z',
  ],
  wait: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z', 'M12 7v5l3 2'],
  waitInApp: [
    'M13 20.8A10 10 0 1 1 20.8 13L18.55 12.58A7.7 7.7 0 1 0 12.58 18.55Z',
    'M11 5a1.1 1.1 0 0 1 1.1 1.1v4.8l2.6 2.6a1.1 1.1 0 0 1-1.6 1.6l-2.9-2.9a1.1 1.1 0 0 1-.3-.8V6.1A1.1 1.1 0 0 1 11 5Z',
    'M17 13h4a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM17 15v7h4v-7ZM18 13.7v.5h2v-.5ZM18.6 22.7v.5h.8v-.5Z',
    'M17.7 16.1h2.6a.4.4 0 0 1 .4.4v4a.4.4 0 0 1-.4.4h-2.6a.4.4 0 0 1-.4-.4v-4a.4.4 0 0 1 .4-.4ZM17.9 17v.5h.7V17ZM19 17v.5h1.1V17ZM17.9 18.2v.5h2.2v-.5ZM17.9 19.4v.5h1.8v-.5Z',
  ],
  waitEvent: [
    'M13 20.8A10 10 0 1 1 20.8 13L18.55 12.58A7.7 7.7 0 1 0 12.58 18.55Z',
    'M11 5a1.1 1.1 0 0 1 1.1 1.1v4.8l2.6 2.6a1.1 1.1 0 0 1-1.6 1.6l-2.9-2.9a1.1 1.1 0 0 1-.3-.8V6.1A1.1 1.1 0 0 1 11 5Z',
    'M18.6 13.8h-1.7l-1.9 4.4h2.5l-.4 4.1 4.3-5.9h-2.8Z',
  ],
  waitChat: [
    'M13 20.8A10 10 0 1 1 20.8 13L18.55 12.58A7.7 7.7 0 1 0 12.58 18.55Z',
    'M11 5a1.1 1.1 0 0 1 1.1 1.1v4.8l2.6 2.6a1.1 1.1 0 0 1-1.6 1.6l-2.9-2.9a1.1 1.1 0 0 1-.3-.8V6.1A1.1 1.1 0 0 1 11 5Z',
    'M19 13.2c2.3 0 4.2 1.6 4.2 3.7 0 1.8-1.4 3.2-3.2 3.6l-2.3 1.8.5-2c-2-.3-3.4-1.7-3.4-3.4 0-2.1 1.9-3.7 4.2-3.7Z',
  ],
  waitAttribute: [
    'M10.5 16.35A7.5 7.5 0 1 1 16.35 10.5L14.3 10.5A5.5 5.5 0 1 0 10.5 14.3Z',
    'M8.1 4.5h1.8v4.1l3 2.8-1.2 1.3-3.6-3.4Z',
    'M19.2 14.7a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 1 1 4.8 0ZM12 21c0-1.2.8-1.9 2.4-2.5.8-.3 1.5-.6 2.4-.6s1.6.3 2.4.6c1.6.6 2.4 1.3 2.4 2.5v.3c0 .7-.5 1.2-1.2 1.2h-7.2c-.7 0-1.2-.5-1.2-1.2Z',
  ],
  waitDate: [
    'M10.5 16.35A7.5 7.5 0 1 1 16.35 10.5L14.3 10.5A5.5 5.5 0 1 0 10.5 14.3Z',
    'M8.1 4.5h1.8v4.1l3 2.8-1.2 1.3-3.6-3.4Z',
    'M13.5 12.5H21a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM14 14.2v.8h6.5v-.8ZM14 16v1.3h1.3V16ZM16.7 16v1.3H18V16ZM19.4 16v1.3h1.3V16ZM14 18.2v1.3h1.3v-1.3ZM16.7 18.2v1.3H18v-1.3ZM19.4 18.2v1.3h1.3v-1.3ZM14 20.4v1.3h1.3v-1.3ZM16.7 20.4v1.3H18v-1.3ZM19.4 20.4v1.3h1.3v-1.3ZM14 11h1.2v2.5H14ZM19.2 11h1.2v2.5h-1.2Z',
  ],
  decision: ['M7 7a5 5 0 0 1 10 0c0 3-5 4-5 8v1','M12 19v2.4',],
  engagement: ['M12 2.5v4M6.3 4.3l2.8 2.8M4 10h4M6.3 15.7l2.8-2.8M17.7 4.3l-2.8 2.8M20 10h-4',],
  random: ['M17 5H8v14h9M5 12h12'],
  optimizer: ['M8 2h6v1H8Z', 'M9 3v7l-4.7 8.4A1.1 1.1 0 0 0 5.3 20H12M13 3v7l2.7 4.8'],
  winner: ['M6 4v17', 'M9 5c3-2 6 2 11 0v9c-5 2-8-2-11 0Z'],
  contact: [
    'M1.5 2.5h16v12h-16ZM2.4 3.4v10.2h14.2V3.4Z',
    'M8.3 5.5c-1.1 0-1.7.9-1.5 2 .1.7.3 1.2.6 1.6v.5c-.2.4-1 .6-2.1 1-1 .3-1.3.9-1.3 1.6h8.6c0-.7-.3-1.3-1.3-1.6-1.1-.4-1.9-.6-2.1-1v-.5c.3-.4.5-.9.6-1.6.2-1.1-.4-2-1.5-2ZM11.8 5.7h3.1v.7h-3.1ZM11.8 7.6h3.1v.7h-3.1ZM11.8 9.5h3.1v.7h-3.1Z',
    'M22.5 17a5.5 5.5 0 1 1-11 0 5.5 5.5 0 1 1 11 0ZM13.685 15.725 14.705 15.98C15.045 14.62 16.575 14.11 17.765 14.79L16.915 15.64L19.805 15.98L19.38 13.09L18.615 13.94C16.745 12.665 14.195 13.515 13.685 15.725ZM20.315 18.275 19.295 18.02C18.955 19.38 17.425 19.89 16.235 19.21L17.085 18.36L14.195 18.02L14.62 20.91L15.385 20.06C17.255 21.335 19.805 20.485 20.315 18.275Z',
  ],
  cloud: ['M6 18a4 4 0 0 1-1-8 5 5 0 0 1 9-3 4 4 0 0 1 5 4 3.5 3.5 0 0 1-1 7H6Z'],
  custom: ['m8 6-5 6 5 6m8-12 5 6-5 6M14 4l-4 16'],
  event: ['m13 3-8 11h6l-1 7 9-12h-7l1-6Z'],
  join: ['M5 3v5a4 4 0 0 0 4 4h3m7-9v5a4 4 0 0 1-4 4h-3v9', 'm8 17 4 4 4-4'],
}

export function journeyActivityVisual(type, isConfigured, isEinstein = false) {
  const key = String(type || '').replace(/[^a-z0-9]/gi, '').toUpperCase()
  const appearance = VISUALS[key] || (key.includes('WAIT') ? visual('wait', 'diamond', FLOW) : visual('custom', 'square', '#65758b'))
  const color = isConfigured === false ? '#a8b7c7' : isEinstein ? EINSTEIN : appearance.color
  return { ...appearance, color }
}

export function journeyActivityIcon(activity) {
  for (const value of [activity?.metaData?.icon, activity?.icon, activity?.configurationArguments?.icon]) {
    if (typeof value !== 'string') continue
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port
        && (url.hostname === 'sfmc-einstein.com' || url.hostname.endsWith('.sfmc-einstein.com'))) return url.href
    } catch {}
  }
  return null
}

export function journeyCanvasModel(graph, layout, orientation = 'horizontal', selected = null) {
  const mergeTargets = new Set(graph.nodes.filter((node) => String(node.type || '').toUpperCase() === 'ABNTESTSTOP').map((node) => node.key))
  const flow = journeyFlowModel(graph, layout, orientation, { mergeTargets })
  const branchExits = new Set(flow.edges.filter((edge) => edge.sourceHandle === 'branch').map((edge) => edge.from))
  const nodes = graph.nodes.flatMap((node) => {
    const at = flow.positions.get(node.key)
    if (!at) return []
    const iconUrl = journeyActivityIcon(node.raw)
    const displayType = nodeDisplayType(node)
    const name = node.name || nodeTypeLabel(displayType)
    const summary = ['WAIT', 'WAITBYDURATION'].includes(String(displayType).toUpperCase()) ? '' : nodeSummary(node)
    return [{
      id: node.key, type: 'journeyActivity', position: at,
      width: ACTIVITY_WIDTH, height: ACTIVITY_HEIGHT,
      draggable: false, connectable: false, selectable: false, focusable: false,
      style: { pointerEvents: 'all' },
      data: {
        key: node.key,
        name,
        typeLabel: nodeTypeLabel(displayType),
        iconUrl,
        summary,
        visual: journeyActivityVisual(displayType, node.raw?.metaData?.isConfigured, Boolean(iconUrl)),
        active: node.key === selected,
        branchExit: branchExits.has(node.key),
        orientation,
      },
    }]
  })
  for (const branch of flow.branches) {
    nodes.push({
      id: branch.id, type: 'journeyRoute', position: branch.position,
      width: ACTIVITY_WIDTH, height: ACTIVITY_HEIGHT,
      draggable: false, connectable: false, selectable: false, focusable: false,
      data: { visual: { color: 'transparent' } },
    })
  }
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges = flow.edges.map((edge) => {
    const junction = edge.junction && {
      x: edge.junction.x, y: edge.junction.y, count: edge.junction.count,
      color: journeyActivityVisual('JOIN').color,
      description: `${edge.junction.count} joining ${edge.junction.count === 1 ? 'path' : 'paths'} before ${byId.get(edge.junction.target).data.name}`,
    }
    return {
      id: `journey-edge-${edge.index}`, source: edge.from, target: edge.to, type: 'journeyStep',
      selectable: false, focusable: false, updatable: false,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      data: { path: edge.path, x: edge.x, y: edge.y, label: edge.label, ...(junction ? { junction } : {}) },
    }
  })
  return { nodes, edges }
}
