import { createRouter, createWebHashHistory } from 'vue-router'
import { loadPolicy, routeBlocked } from '../utils/policy.js'
import { NAV_ITEMS } from './nav.js'
import { countVisit } from '../utils/home.js'

const PAGES = {
  '/home': () => import('../views/home/HomePage.vue'),
  '/queries/saved': () => import('../views/queries/SavedQueriesPage.vue'),
  '/queries/workspace': () => import('../views/queries/WorkspacePage.vue'),
  '/queries/builder': () => import('../views/queries/BuilderPage.vue'),
  '/queries/cleanup': () => import('../views/queries/CleanupPage.vue'),
  '/emails': () => import('../views/emails/EmailsPage.vue'),
  '/data-extensions': () => import('../views/data/DataExtensionsPage.vue'),
  '/where-used': () => import('../views/data/WhereUsedPage.vue'),
  '/de-storage': () => import('../views/data/DEStoragePage.vue'),
  '/create-de': () => import('../views/data/CreateDEPage.vue'),
  '/contacts': () => import('../views/contacts/ContactsPage.vue'),
  '/email-validation': () => import('../views/data/EmailValidationPage.vue'),
  '/contact-journeys': () => import('../views/journey/ContactJourneysPage.vue'),
  '/automations': () => import('../views/automation/AutomationsPage.vue'),
  '/activities': () => import('../views/automation/ActivitiesPage.vue'),
  '/saved-activities': () => import('../views/automation/SavedActivitiesPage.vue'),
  '/templates': () => import('../views/automation/TemplatesPage.vue'),
  '/automation-overview': () => import('../views/automation/AutomationOverviewPage.vue'),
  '/journey-overview': () => import('../views/journey/JourneyOverviewPage.vue'),
  '/journeys': () => import('../views/journey/JourneysPage.vue'),
  '/journey-entry': () => import('../views/journey/JourneyEntryPage.vue'),
  '/cloudpages': () => import('../views/content/CloudPagesPage.vue'),
  '/cloudpages/saved': () => import('../views/emails/EmailsPage.vue'),
}

export const routes = [
  { path: '/', redirect: '/home' },
  ...NAV_ITEMS.map((item) => ({
    path: item.path,
    component: PAGES[item.path],
    ...(item.props ? { props: item.props } : {}),
    meta: { title: item.name, group: item.group },
  })),
  {
    path: '/automations/:id',
    component: () => import('../views/automation/AutomationDetailPage.vue'),
    meta: { title: 'Automations', group: 'Automation' },
  },
  {
    path: '/journeys/:id',
    component: () => import('../views/journey/JourneyDetailPage.vue'),
    meta: { title: 'Journeys', group: 'Journeys' },
  },
  {
    path: '/saved-activities/:id',
    component: () => import('../views/automation/SavedActivitiesPage.vue'),
    meta: { title: 'Saved Activities', group: 'Automation' },
  },
  {
    path: '/cloudpages/saved/:id',
    component: () => import('../views/emails/EmailDetailPage.vue'),
    props: { kind: 'cloudpage' },
    meta: { title: 'Saved CloudPages', group: 'Content' },
  },
  {
    path: '/emails/:id',
    component: () => import('../views/emails/EmailDetailPage.vue'),
    meta: { title: 'Saved Emails', group: 'Content' },
  },
  // To Test: test builds only; the store build drops this route and its page (#To Test, 2026-11-04).
  ...(__TEST_BUILD__ ? [{ path: '/to-test', component: () => import('../views/info/ToTestPage.vue'), meta: { title: 'To Test' } }] : []),
  { path: '/features', component: () => import('../views/info/InfoPage.vue'), props: { page: 'features' }, meta: { title: 'Features' } },
  // To do is hidden from users (feedback #77); old links and todo.html land on Features.
  { path: '/todo', redirect: '/features' },
  { path: '/settings', component: () => import('../views/settings/SettingsPage.vue'), meta: { title: 'Settings' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export function createAppRouter(history = createWebHashHistory()) {
  const router = createRouter({ history, routes })
  // Pages an admin policy turned off (utils/policy.js) send the user home.
  router.beforeEach(async (to) => {
    await loadPolicy()
    return routeBlocked(to.path) ? '/' : true
  })
  router.afterEach((to) => {
    countVisit(to.path) // Home's Most used (feedback #1025)
    document.title = to.meta?.title ? `${to.meta.title} · Marketing Cloud Toolkit` : 'Marketing Cloud Toolkit'
  })
  return router
}
