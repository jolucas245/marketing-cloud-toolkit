// Sidebar sections and the routes behind them (pages in router.js). Section order
// Queries, Data, Contacts, Automation, Journeys, Content (feedback #128, regrouped in
// the redesign, #1031). `hidden` pages have a route but no sidebar entry.
import {
  Bookmark, LayoutGrid, Blocks, Workflow, ListChecks, Database, Route, LogIn, Globe, Mail, Network, Trash2, LayoutTemplate, LayoutDashboard, Users, HardDrive, FilePlus2, History, MailCheck, Footprints, House, FileDown,
} from 'lucide-vue-next'

export const NAV_GROUPS = [
  // Home (feedback #1025): the start page, in a group without a heading.
  { label: '', items: [{ path: '/home', name: 'Home', icon: House }] },
  {
    label: 'Queries',
    items: [
      { path: '/queries/workspace', name: 'Run Query', icon: LayoutGrid },
      { path: '/queries/builder', name: 'Query Builder', icon: Blocks },
      { path: '/queries/saved', name: 'Saved queries', icon: Bookmark },
    ],
  },
  {
    label: 'Data',
    items: [
      { path: '/data-extensions', name: 'Data Extensions', icon: Database },
      { path: '/create-de', name: 'Create DE', icon: FilePlus2 },
      { path: '/where-used', name: 'Where used', icon: Network },
      { path: '/de-storage', name: 'DE storage', icon: HardDrive },
      { path: '/metadata', name: 'Download metadata', icon: FileDown },
    ],
  },
  {
    label: 'Contacts',
    items: [
      { path: '/contacts', name: 'Contacts', icon: Users },
      { path: '/contact-journeys', name: 'Contact journeys', icon: Footprints },
      { path: '/email-validation', name: 'Email validation', icon: MailCheck },
    ],
  },
  {
    label: 'Automation',
    items: [
      { path: '/automation-overview', name: 'Automation overview', icon: LayoutDashboard },
      { path: '/automations', name: 'Automations', icon: Workflow },
      { path: '/activities', name: 'Activities', icon: ListChecks },
      { path: '/saved-activities', name: 'Saved Activities', icon: History },
      { path: '/templates', name: 'Templates', icon: LayoutTemplate },
    ],
  },
  {
    label: 'Journeys',
    items: [
      { path: '/journey-overview', name: 'Journey overview', icon: LayoutDashboard },
      { path: '/journeys', name: 'Journeys', icon: Route },
      { path: '/journey-entry', name: 'Journey Entry', icon: LogIn },
    ],
  },
  {
    label: 'Content',
    items: [
      { path: '/cloudpages', name: 'CloudPages', icon: Globe },
      { path: '/emails', name: 'Saved Emails', icon: Mail },
    ],
  },
  // Delete Toolkit runs moved under Settings as Clean up (redesign, #1031).
  { label: 'Settings', hidden: true, items: [{ path: '/queries/cleanup', name: 'Clean up', icon: Trash2 }] },
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
