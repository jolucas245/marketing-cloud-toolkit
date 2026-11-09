import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// useQueryPanel holds the Run Query engine; the layout only needs its state.
const state = {}
const FUNCTIONS = new Set(['onEditorChange', 'enableNameEditing', 'saveName', 'runValidation', 'runQuery',
  'handleDeleteDE', 'handleDeleteActivity', 'onResizeStart', 'toggleHistoryResults', 'openSfmcLogin',
  'openQueryPicker', 'refreshQueryPicker', 'selectQueryActivity', 'toggleQaFolder', 'copyToClipboard',
  'cleanQueryText', 'resolveTargetFields', 'takeSnapshot', 'restoreSnapshot', 'readSnapshots',
  'fetchMoreRows', 'fetchAllRows', 'answerPrompt'])
vi.mock('../../../composables/useQueryPanel.js', () => ({
  useQueryPanel: () => new Proxy(state, {
    get(target, key) {
      if (!(key in target)) target[key] = FUNCTIONS.has(key) ? vi.fn() : ref(null)
      return target[key]
    },
  }),
}))

function resetState() {
  for (const k of Object.keys(state)) delete state[k]
  Object.assign(state, {
    queryText: ref('SELECT 1'), editorHeightPct: ref(25), resultsMode: ref('empty'), activeTab: ref('editor'),
    runs: ref([]), snapshots: ref([]), stepStatuses: ref([]), stepErrors: ref([]), stepDetails: ref([]),
    resultRows: ref([]), resultColumns: ref([]), filteredPickerItems: ref([]), queryPickerTree: ref([]),
    queryPickerItems: ref([]), expandedQaFolders: ref(new Set()), LOAD_ALL_LIMIT: 50000, isRunning: ref(false),
    showRunStepper: ref(false), formatRunDate: () => '', relativeDate: () => '',
  })
}

// Child components as empty stubs that keep their props out of the DOM.
const stub = (name, props = []) => ({ name, props, inheritAttrs: false, render: () => null })
const CHILDREN = ['AiAssistDialog', 'AiButton', 'CleanupActions', 'EarlierTextDialog', 'InsertFieldsMenu',
  'QueryActivityTreeNode', 'QueryEditor', 'ReportErrorButton', 'ResultsTable', 'RouterLink', 'RunStepper',
  'SampleDialog', 'SaveAsActivityDialog', 'SaveResultsDialog', 'SharedSnippetsDialog', 'ShareQueryDialog',
  'ToolbarMenu', 'DialogRoot']
const stubs = {
  ...Object.fromEntries(CHILDREN.map((n) => [n, stub(n)])),
  SchemaPanel: stub('SchemaPanel', ['editor', 'stack']),
  ValidationPanel: stub('ValidationPanel', ['results', 'isRunning', 'sql']),
}
const mountPanel = (QueryPanel) => shallowMount(QueryPanel, { props: { queryId: 'sql_1', stack: 's10', canInteract: true }, global: { stubs } })

describe('QueryPanel layout', () => {
  beforeEach(() => {
    resetState()
    try { localStorage.clear() } catch { /* no storage */ }
  })

  // At the default 25% the schema search showed one field before scrolling (live test, 2026-11-07).
  it('gives the editor row a minimum height while the schema search is open', async () => {
    localStorage.setItem('toolkit_schemaPanel', '1')
    const { default: QueryPanel } = await import('../QueryPanel.vue')
    const w = mountPanel(QueryPanel)
    const row = w.find('[data-editor-row]')
    expect(row.attributes('style')).toContain('height: 25%')
    expect(row.attributes('style')).toContain('min-height: min(20rem, 70%)')
    expect(w.findComponent({ name: 'SchemaPanel' }).exists()).toBe(true)
  })

  it('keeps the plain editor height with the schema search closed', async () => {
    localStorage.setItem('toolkit_schemaPanel', '0')
    const { default: QueryPanel } = await import('../QueryPanel.vue')
    const w = mountPanel(QueryPanel)
    expect(w.find('[data-editor-row]').attributes('style')).not.toContain('min-height')
  })

  it('passes the SQL to the Validate panel for its explanations', async () => {
    state.resultsMode.value = 'validation'
    state.validationResults = ref({ queryValid: false, errors: [{ message: 'x' }], warnings: [] })
    const { default: QueryPanel } = await import('../QueryPanel.vue')
    const w = mountPanel(QueryPanel)
    expect(w.findComponent({ name: 'ValidationPanel' }).props('sql')).toBe('SELECT 1')
  })
})
