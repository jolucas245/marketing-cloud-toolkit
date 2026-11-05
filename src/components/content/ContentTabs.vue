<script setup>
// Tabs that fold Saved Emails into Emails and Saved CloudPages into CloudPages
// (feedback #1059): the Content Builder view and the versions kept by the Toolkit.
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({ section: { type: String, required: true } }) // emails | cloudpages
const route = useRoute()
const TABS = {
  emails: [{ to: '/emails', label: 'Content Builder' }, { to: '/emails/saved', label: 'Saved versions' }],
  cloudpages: [{ to: '/cloudpages', label: 'CloudPages' }, { to: '/cloudpages/saved', label: 'Saved versions' }],
}
const tabs = computed(() => TABS[props.section] || [])
// Saved versions also covers a version's own page (/emails/email_1, /cloudpages/saved/x).
const isSaved = computed(() => (props.section === 'emails' ? route.path !== '/emails' : route.path.startsWith('/cloudpages/saved')))
const active = (t, i) => (i === 1 ? isSaved.value : !isSaved.value)
</script>

<template>
  <div class="inline-flex items-center rounded-full border border-border bg-card p-0.5 text-xs" role="tablist" data-content-tabs>
    <RouterLink v-for="(t, i) in tabs" :key="t.to" :to="t.to" role="tab" :aria-selected="active(t, i)"
      class="h-7 px-3 inline-flex items-center rounded-full" :class="active(t, i) ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'">{{ t.label }}</RouterLink>
  </div>
</template>
