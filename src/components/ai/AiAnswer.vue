<script setup>
// An AI answer drawn from its Markdown (feedback #1096). Text bindings only.
import { computed, h } from 'vue'
import { parseAnswer } from '../../utils/aiMarkdown.js'

const props = defineProps({ text: { type: String, default: '' } })
const blocks = computed(() => parseAnswer(props.text))

// Inline parts as spans: bold, italic, code.
const Parts = (p) => (p.parts || []).map((s) => h(
  s.code ? 'code' : 'span',
  { class: [s.code && 'rounded bg-muted px-1 font-mono text-[12px]', s.bold && 'font-semibold', s.italic && 'italic'] },
  s.text,
))
Parts.props = ['parts']
</script>

<template>
  <div class="space-y-2" data-ai-answer-blocks>
    <template v-for="(b, i) in blocks" :key="i">
      <p v-if="b.type === 'p'"><Parts :parts="b.parts" /></p>
      <p v-else-if="b.type === 'h'" class="font-semibold" :class="b.level <= 2 ? 'text-[14px]' : ''"><Parts :parts="b.parts" /></p>
      <ul v-else-if="b.type === 'ul'" class="list-disc space-y-1 pl-5">
        <li v-for="(it, j) in b.items" :key="j" :style="it.indent ? { marginLeft: `${it.indent * 1.25}rem` } : null"><Parts :parts="it.parts" /></li>
      </ul>
      <ol v-else-if="b.type === 'ol'" class="list-decimal space-y-1 pl-5" :start="b.start">
        <li v-for="(it, j) in b.items" :key="j" :style="it.indent ? { marginLeft: `${it.indent * 1.25}rem` } : null"><Parts :parts="it.parts" /></li>
      </ol>
      <pre v-else-if="b.type === 'code'" class="overflow-x-auto rounded bg-muted p-2 font-mono text-[12px] whitespace-pre">{{ b.text }}</pre>
      <hr v-else-if="b.type === 'hr'" class="border-border" />
    </template>
  </div>
</template>
