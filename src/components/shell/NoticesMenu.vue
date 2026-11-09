<script setup>
// The bell in the top bar: changes to watched automations (feedback #50) and journeys (#59),
// and background jobs of this tab that ended (feedback #1092), with a link to Activity history.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Bell } from 'lucide-vue-next'
import { NOTICES_KEY, unreadCount, noticeRoute } from '@/utils/watches.js'
import { formatDateTime } from '@/utils/format.js'
import { sendToBackground } from '@/utils/messaging.js'
import { jobs, unseenJobs, markJobsSeen } from '@/composables/useJobs.js'
import { STATUS_LABEL } from '@/utils/jobs.js'

const notices = ref([])
const open = ref(false)
const unread = computed(() => unreadCount(notices.value) + unseenJobs.value.length)
// This tab's ended jobs, newest first (running ones show in the header pill).
const endedJobs = computed(() => jobs.filter((j) => j.status !== 'running').slice(0, 10))
const load = () => chrome.storage.local.get(NOTICES_KEY, (r) => { notices.value = r?.[NOTICES_KEY] || [] })
const onChange = (c, area) => { if (area === 'local' && NOTICES_KEY in c) notices.value = c[NOTICES_KEY].newValue || [] }
onMounted(() => { try { load(); chrome.storage.onChanged.addListener(onChange) } catch { /* not in an extension */ } })
onUnmounted(() => { try { chrome.storage.onChanged.removeListener(onChange) } catch { /* ignore */ } })

async function write(list) {
  await chrome.storage.local.set({ [NOTICES_KEY]: list })
  sendToBackground({ type: 'WATCH_BADGE' }).catch(() => undefined)
}
function toggle() {
  open.value = !open.value
  // Opening the list counts as reading it.
  if (open.value && unreadCount(notices.value)) write(notices.value.map((n) => ({ ...n, read: true })))
  if (!open.value) markJobsSeen()
}
const clear = () => { write([]); markJobsSeen(); open.value = false }
const close = () => { open.value = false; markJobsSeen() }
const JOB_TONE = {
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  stopped: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  done: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
}
const KIND = { paused: 'Paused', activated: 'Activated', fails: 'Failed', runs: 'Ran', edited: 'Changed' }
</script>

<template>
  <div class="relative">
    <button class="relative h-9 w-9 flex items-center justify-center rounded-lg text-foreground/80 hover:bg-accent" :title="unread ? `${unread} new notices` : 'Notices: background tasks, watched automations and journeys'" data-notices-bell :aria-expanded="open" @click="toggle">
      <Bell class="h-4 w-4" />
      <span v-if="unread" class="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-4 text-center">{{ unread > 99 ? '99+' : unread }}</span>
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-30" @click="close" />
      <div class="absolute right-0 mt-1 z-40 w-96 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover shadow-lg text-xs" role="dialog" aria-label="Notices">
        <template v-if="endedJobs.length">
          <div class="flex items-center px-3 py-2 border-b border-border">
            <span class="font-semibold flex-1">Background tasks in this tab</span>
          </div>
          <RouterLink v-for="j in endedJobs" :key="j.id" :to="j.route" class="block px-3 py-2 border-b border-border/50 hover:bg-accent" :class="j.seen ? '' : 'bg-primary/5'" data-job-notice @click="close">
            <span class="inline-block mr-1.5 rounded px-1.5 text-[10px] font-semibold" :class="JOB_TONE[j.status] || 'bg-muted text-foreground'">{{ STATUS_LABEL[j.status] || j.status }}</span>
            <span class="font-medium">{{ j.title }}</span>
            <span v-if="j.summary || j.error" class="block mt-0.5" :class="j.error ? 'text-red-600' : ''">{{ j.error || j.summary }}</span>
            <span class="block text-muted-foreground mt-0.5">{{ formatDateTime(new Date(j.finishedAt || j.startedAt).toISOString()) }}</span>
          </RouterLink>
        </template>
        <div class="flex items-center px-3 py-2 border-b border-border">
          <span class="font-semibold flex-1">Watched automations and journeys</span>
          <button v-if="notices.length" class="text-muted-foreground hover:underline" @click="clear">Clear</button>
        </div>
        <p v-if="!notices.length" class="px-3 py-4 text-muted-foreground">Nothing new. Use Watch on an automation or journey (or tick several in the list) to be told when it is paused, activated, fails or changes.</p>
        <RouterLink v-for="n in notices" :key="n.id" :to="noticeRoute(n)" class="block px-3 py-2 border-b border-border/50 hover:bg-accent" @click="close">
          <span class="inline-block mr-1.5 rounded px-1.5 text-[10px] font-semibold" :class="n.kind === 'fails' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' : n.kind === 'paused' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-muted text-foreground'">{{ KIND[n.kind] || n.kind }}</span>
          <span class="font-medium">{{ n.name }}</span> {{ n.text }}
          <span class="block text-muted-foreground mt-0.5">{{ formatDateTime(new Date(n.at).toISOString()) }} · {{ n.stack }}</span>
        </RouterLink>
        <RouterLink to="/activity" class="block px-3 py-2 text-primary hover:underline" data-activity-link @click="close">Activity history: every background task, its status and results</RouterLink>
      </div>
    </template>
  </div>
</template>
