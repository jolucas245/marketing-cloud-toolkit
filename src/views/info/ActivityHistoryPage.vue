<script setup>
// Activity history (feedback #1092): background tasks such as Email validation, from this
// tab (live, with Stop and a link to the results) and from earlier tabs (stored entries:
// what, when, status and counts only).
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Loader2, Square, Trash2 } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { jobs, jobHistory, loadJobHistory, clearJobHistory, stopJob, findJob, markJobsSeen } from '@/composables/useJobs.js'
import { mergeHistory, displayStatus, durationText, progressText, STATUS_LABEL, MAX_HISTORY } from '@/utils/jobs.js'
import { formatDateTime } from '@/utils/format.js'
import { askConfirm } from '@/composables/useConfirm.js'

const now = ref(Date.now())
let timer = null
onMounted(() => {
  loadJobHistory()
  markJobsSeen()
  timer = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => clearInterval(timer))

const rows = computed(() => {
  const liveIds = new Set(jobs.filter((j) => j.status === 'running').map((j) => j.id))
  return mergeHistory(jobs, jobHistory.value, now.value).map((e) => ({
    ...e,
    shown: displayStatus(e, { now: now.value, liveIds }),
    job: e.live ? findJob(e.id) : null,
  }))
})
const TONE = {
  running: 'text-primary',
  done: 'text-green-700 dark:text-green-400',
  failed: 'text-red-600',
  stopped: 'text-amber-700 dark:text-amber-300',
  interrupted: 'text-amber-700 dark:text-amber-300',
}
const when = (t) => (t ? formatDateTime(new Date(t).toISOString()) : '')

async function clear() {
  const ok = await askConfirm({ title: 'Clear the activity history?', message: 'Removes the stored list of earlier tasks. Tasks still running in this tab stay.', confirmLabel: 'Clear' })
  if (ok) await clearJobHistory()
}
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-3 text-sm">
    <div class="flex items-center gap-2">
      <h1 class="text-base font-semibold flex-1">Activity history</h1>
      <Button variant="outline" size="sm" class="h-8 text-xs" :disabled="!jobHistory.length" data-clear-history @click="clear"><Trash2 class="h-3.5 w-3.5 mr-1" /> Clear</Button>
    </div>
    <div class="text-xs text-muted-foreground max-w-3xl space-y-1">
      <p>Long tasks such as Email validation run in the background of this tab: you can move to other Toolkit pages while they run, and a notice tells you when they end. <strong class="font-medium text-foreground">Closing or reloading the tab stops them.</strong></p>
      <p>What is kept: the last {{ MAX_HISTORY }} tasks in this browser (name, start and end, status, progress and counts; never email addresses or rows). Results stay in this tab's memory only (the last few tasks), until the tab is closed or reloaded.</p>
    </div>

    <p v-if="!rows.length" class="text-xs text-muted-foreground" data-history-empty>No background tasks yet.</p>
    <div v-else class="overflow-x-auto rounded-lg border border-border bg-card">
      <table class="w-full text-xs" data-history-table>
        <thead>
          <tr class="text-left text-muted-foreground border-b border-border">
            <th class="px-3 py-2">What</th><th class="px-3 py-2">Started</th><th class="px-3 py-2">Finished</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Progress</th><th class="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="border-b border-border/50 align-top" :data-history-row="r.id">
            <td class="px-3 py-2">
              <div class="font-medium">{{ r.title }}</div>
              <div v-if="r.error" class="text-red-600 mt-0.5">{{ r.error }}</div>
              <div v-else-if="r.summary" class="text-muted-foreground mt-0.5">{{ r.summary }}</div>
            </td>
            <td class="px-3 py-2 whitespace-nowrap">{{ when(r.startedAt) }}</td>
            <td class="px-3 py-2 whitespace-nowrap">{{ when(r.finishedAt) }}<div class="text-muted-foreground">{{ durationText(r.startedAt, r.finishedAt, now) }}</div></td>
            <td class="px-3 py-2 whitespace-nowrap" :class="TONE[r.shown]" data-history-status>
              <Loader2 v-if="r.shown === 'running'" class="inline h-3.5 w-3.5 mr-1 animate-spin" />{{ STATUS_LABEL[r.shown] || r.shown }}
              <div v-if="r.shown === 'running' && !r.live" class="text-muted-foreground">in another tab</div>
            </td>
            <td class="px-3 py-2 min-w-36">
              <template v-if="r.job && r.job.status === 'running'">
                <ProgressBar v-if="r.job.progress.total" :value="r.job.progress.done" :max="r.job.progress.total" />
                <span class="text-muted-foreground">{{ progressText(r.job.progress) }}</span>
              </template>
              <span v-else class="text-muted-foreground">{{ progressText(r.progress) }}</span>
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-right">
              <Button v-if="r.job && r.job.status === 'running'" variant="outline" size="sm" class="h-7 text-xs mr-2" :disabled="r.job.stopRequested" @click="stopJob(r.job)"><Square class="h-3 w-3 mr-1" /> Stop</Button>
              <RouterLink v-if="r.job && r.job.data" :to="r.route" class="text-primary hover:underline" data-history-open>{{ r.job.status === 'running' ? 'Open' : 'Results' }}</RouterLink>
              <span v-else-if="!r.live" class="text-muted-foreground" title="Results stay only in the tab that ran the task">Results not in this tab</span>
              <span v-else class="text-muted-foreground">Results no longer kept</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
