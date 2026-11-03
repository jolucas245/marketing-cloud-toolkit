<script setup>
// One-time offer to turn on saving Query Studio runs (feedback #1039). Saving is on by
// default, but it needs the optional *.herokuapp.com permission, which Chrome grants
// only on a click. Shown until the permission is granted, the user says Not now, the
// setting is turned off, or an admin policy turns history off. Same keys as Settings.
import { ref } from 'vue'
import { History, X } from 'lucide-vue-next'
import { policy } from '@/utils/policy.js'
import { QUERY_STUDIO_PERMISSION, QUERY_STUDIO_SETTING } from '@/utils/queryStudio.js'
import { showToast } from '@/composables/useToast.js'

const DISMISSED = '_queryStudioNoticeDismissed'
const show = ref(false)

try {
  chrome.storage?.local.get([QUERY_STUDIO_SETTING, DISMISSED], (r) => {
    if (r?.[QUERY_STUDIO_SETTING] === false || r?.[DISMISSED]) return
    chrome.permissions?.contains(QUERY_STUDIO_PERMISSION, (has) => { show.value = !has })
  })
} catch { /* no extension APIs (tests) */ }

function turnOn() {
  chrome.permissions.request(QUERY_STUDIO_PERMISSION, (ok) => {
    void chrome.runtime.lastError
    chrome.storage.local.set({ [QUERY_STUDIO_SETTING]: !!ok })
    if (ok) { show.value = false; showToast('Query Studio runs will be saved.') }
    else showToast('Query Studio runs are not saved: Chrome did not get the permission.')
  })
}
function notNow() {
  show.value = false
  chrome.storage?.local.set({ [DISMISSED]: true })
}
</script>

<template>
  <div v-if="show && !policy.disableHistory" class="flex flex-wrap items-center gap-3 rounded-[14px] border border-primary/25 bg-primary/5 px-4 py-3 text-sm" role="status" data-qs-notice>
    <History class="h-4 w-4 text-primary shrink-0" />
    <span class="flex-1 min-w-[12rem]">
      <span class="font-semibold">Save your Query Studio runs?</span>
      <span class="text-muted-foreground"> The Toolkit keeps each query you run in Query Studio under Saved queries. Chrome asks once for access to Query Studio's site.</span>
    </span>
    <button type="button" class="h-8 px-3.5 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90" @click="turnOn">Turn on</button>
    <button type="button" class="h-8 px-3 rounded-full border border-border bg-card text-[13px] font-medium hover:bg-accent inline-flex items-center gap-1" @click="notNow"><X class="h-3.5 w-3.5" /> Not now</button>
  </div>
</template>
