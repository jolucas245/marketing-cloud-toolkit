// Automation Studio's icons, by name (user, 2026-11-10). The icons themselves are not
// shipped: utils/asIcons.js reads them at run time from the user's own SFMC stack
// (Automation Studio's public stylesheet, classes as-icon-<name>). This file holds only
// the names: which glyph Automation Studio uses for each activity type (its js/constants
// ACTIVITIES table, whiteIconClass per objectTypeId) and its tile colours.

/** The glyphs the Toolkit reads from Automation Studio's stylesheet. */
export const AS_GLYPH_NAMES = [
  'SQLQuery-white', 'SSJS-white', 'fileImport-white', 'importMobileContacts-white', 'dataExtract-white', 'transferFile-white',
  'sendEmail-white', 'sendSMS-white', 'sendPush-white', 'verification-white', 'filter-white', 'wait-white', 'jbEvent-white',
  'refreshGroup-white', 'refreshMobileFilteredList-white', 'refreshSegmentTemplate-white', 'publishAudience-white',
  'verifyAudienceCount-white', 'reportDefinition-white', 'dataFactoryUtility-white', 'groupConnect-white', 'th-refresh-white',
  'lightning-schedule', 'lightning-file-trigger', 'lightning-s3-trigger', 'lightning-pause', 'undefined-activity', 'bu-mapping',
]

export const AS_TILE = '#ED8B00'
export const AS_SOURCE = '#95D160'

/** objectTypeId -> glyph, as in Automation Studio's ACTIVITIES table (952 Journey Entry is not in it: the event glyph). */
export const AS_GLYPH_BY_TYPE = {
  33: 'sendSMS-white', 42: 'sendEmail-white', 43: 'fileImport-white', 45: 'refreshGroup-white', 53: 'transferFile-white',
  73: 'dataExtract-white', 84: 'reportDefinition-white', 93: 'sendSMS-white', 300: 'SQLQuery-white', 303: 'filter-white',
  423: 'SSJS-white', 425: 'dataFactoryUtility-white', 426: 'refreshSegmentTemplate-white', 427: 'publishAudience-white',
  467: 'wait-white', 614: 'jbEvent-white', 615: 'verifyAudienceCount-white', 724: 'refreshMobileFilteredList-white',
  725: 'sendSMS-white', 726: 'importMobileContacts-white', 736: 'sendPush-white', 749: 'jbEvent-white', 750: 'jbEvent-white',
  757: 'SQLQuery-white', 771: 'sendEmail-white', 783: 'sendSMS-white', 952: 'jbEvent-white', 999: 'lightning-file-trigger',
  1000: 'verification-white', 1010: 'th-refresh-white', 1101: 'th-refresh-white', 3700: 'bu-mapping',
}

/** Starting sources (green circles in Automation Studio). */
export const AS_SOURCE_GLYPH = { schedule: 'lightning-schedule', fileDrop: 'lightning-file-trigger', trigger: 'lightning-s3-trigger', none: 'lightning-schedule' }
