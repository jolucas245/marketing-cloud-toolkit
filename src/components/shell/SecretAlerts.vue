<script setup>
// Installed package secrets that expire within a week, or have expired (user,
// 2026-11-05). `bar`: a strip at the top of every page. `home`: a card on Home.
// Both close with the same dismissal (Home's close button, user 2026-11-06): hidden
// until a secret's expiry changes or another secret starts expiring.
// Both link to Setup > Installed Packages; the bar drops its link there (feedback #1079).
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { KeyRound, X } from 'lucide-vue-next'
import { useSecretAlerts } from '@/composables/useSecretAlerts.js'
import { expiryText } from '@/utils/secretExpirations.js'
import { formatDateTime } from '@/utils/format.js'

const props = defineProps({ variant: { type: String, default: 'bar' } })
const { undismissed, dismissAll } = useSecretAlerts()
const PAGE = '/installed-packages'
const route = useRoute()
const onPage = computed(() => route?.path === PAGE)
const shown = computed(() => undismissed.value)
const anyExpired = computed(() => shown.value.some((s) => s.expired))
const title = computed(() => {
  const n = shown.value.length
  return anyExpired.value
    ? `${n} installed package secret${n === 1 ? '' : 's'} expired or expiring`
    : `${n} installed package secret${n === 1 ? '' : 's'} expiring within a week`
})
const tone = computed(() => (anyExpired.value
  ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200'
  : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200'))
</script>

<template>
  <div v-if="shown.length && variant === 'bar'" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs" :class="tone" role="alert" data-secret-alert>
    <KeyRound class="h-4 w-4 shrink-0" />
    <span class="font-semibold">{{ title }}:</span>
    <span class="flex-1 min-w-0 truncate">{{ shown.map((s) => `${s.name} (${expiryText(s)})`).join(', ') }}</span>
    <RouterLink v-if="!onPage" :to="PAGE" class="font-medium underline">Details</RouterLink>
    <button type="button" class="inline-flex items-center gap-1 opacity-80 hover:opacity-100" title="Hide until a secret's expiry changes" @click="dismissAll"><X class="h-3.5 w-3.5" /> Dismiss</button>
  </div>
  <section v-else-if="shown.length" class="rounded-[14px] border px-4 py-3 text-sm space-y-2" :class="tone" role="alert" data-secret-alert>
    <div class="flex items-center gap-2 font-semibold">
      <KeyRound class="h-4 w-4" /> <span class="flex-1">{{ title }}</span>
      <button type="button" class="-mr-1 h-7 w-7 inline-flex items-center justify-center rounded-full opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Close" title="Hide until a secret's expiry changes or another secret starts expiring" data-close-secret-alert @click="dismissAll"><X class="h-4 w-4" /></button>
    </div>
    <p class="m-0 text-xs">Apps and integrations that use these packages' client secret stop authenticating once it expires. Renew the secret in Setup > Apps > Installed Packages, then update it where it is used.</p>
    <ul class="m-0 pl-0 list-none space-y-1 text-xs">
      <li v-for="s in shown" :key="s.packageId || s.name" class="flex flex-wrap gap-x-2">
        <span class="font-medium">{{ s.name || s.packageId }}</span>
        <span>{{ expiryText(s) }}</span>
        <span class="opacity-75">{{ formatDateTime(s.expires) }}</span>
      </li>
    </ul>
    <RouterLink :to="PAGE" class="text-xs font-medium underline">All installed package secrets</RouterLink>
  </section>
</template>
