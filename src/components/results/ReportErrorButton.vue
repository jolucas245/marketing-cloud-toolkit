<script setup>
// Small "Report the error" link placed inside an error message: it reads the message
// it sits in (or `error`) and opens Feedback with it filled in. Hidden when an admin
// policy turns feedback off.
import { ref } from 'vue'
import { Flag } from 'lucide-vue-next'
import { reportError } from '@/composables/useReportError.js'
import { policy } from '@/utils/policy.js'

const props = defineProps({ error: { type: String, default: '' } })
const el = ref(null)

function open() {
  let text = props.error
  if (!text && el.value?.parentElement) {
    const copy = el.value.parentElement.cloneNode(true)
    copy.querySelectorAll('[data-report-error]').forEach((n) => n.remove())
    text = copy.textContent
  }
  // The page from the address bar and the tab title (no router needed, so it works in any component).
  const path = (window.location.hash || '').replace(/^#/, '').split('?')[0]
  const title = document.title.split(' · ')[0]
  reportError(text, { page: title && title !== 'Marketing Cloud Toolkit' ? `${title} (${path})` : path })
}
</script>

<template>
  <button v-if="!policy.disableFeedback" ref="el" type="button" data-report-error
    class="ml-2 inline-flex items-center gap-0.5 align-baseline text-[11px] font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    title="Open Feedback with this error filled in. You can edit it before sending." @click.stop="open">
    <Flag class="h-3 w-3" /> Report the error
  </button>
</template>
