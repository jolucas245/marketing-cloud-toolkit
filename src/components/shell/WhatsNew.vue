<script setup>
// Shown once after an update that has news: to SFMC Query Saver users the rename
// to Marketing Cloud Toolkit (2.0.0) plus the latest news, to Toolkit users only the news.
// Fresh installs skip it. Uses Query Saver's `_seenVersion` key.
import { ref } from 'vue'
import { X } from 'lucide-vue-next'

const VERSION = '2.0.20'
const open = ref(false)
const fromQuerySaver = ref(false)

try {
  chrome.storage.local.get(null, (all) => {
    if (all?._seenVersion === VERSION) return
    const upgrading = !!all?._seenVersion || Object.keys(all || {}).some((k) => /^(sql|email|workspace)_/.test(k))
    // Query Saver stored 1.x here; the Toolkit stores 2.x.
    fromQuerySaver.value = !String(all?._seenVersion || '').startsWith('2.')
    if (upgrading) open.value = true
    else chrome.storage.local.set({ _seenVersion: VERSION })
  })
} catch { /* not in an extension */ }

function close() {
  open.value = false
  try { chrome.storage.local.set({ _seenVersion: VERSION }) } catch { /* not in an extension */ }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-150 flex items-center justify-center bg-black/50 p-4" @mousedown.self="close">
    <div class="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title">
      <div class="flex items-center justify-between px-5 pt-5">
        <span class="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1 uppercase tracking-wide">Version {{ VERSION }}</span>
        <button class="p-1 rounded hover:bg-accent" title="Close" @click="close"><X class="h-4 w-4" /></button>
      </div>
      <h2 id="whatsnew-title" class="px-5 mt-3 text-lg font-bold">{{ fromQuerySaver ? 'SFMC Query Saver is now Marketing Cloud Toolkit' : 'What\'s new in Marketing Cloud Toolkit' }}</h2>
      <ul v-if="!fromQuerySaver" class="px-5 mt-3 mb-5 space-y-3 text-sm">
        <li><strong class="block">Emails and CloudPages, browsed</strong><span class="text-muted-foreground">Content Builder folders, a preview of any email with data from a data extension row or values you type, and the code of each version. Every CloudPage save is kept like email versions, with Code and Compare.</span></li>
        <li><strong class="block">Folders and Concepts</strong><span class="text-muted-foreground">Automations, Journeys and Data Extensions list by folder. The book icon in the top bar explains the terms of the section you are on.</span></li>
        <li><strong class="block">Faster, with fewer calls to SFMC</strong><span class="text-muted-foreground">Folders, lists and automation details are kept in this browser for 30 days and only the changes are read again. Settings can forget them.</span></li>
        <li><strong class="block">Automations like Automation Studio</strong><span class="text-muted-foreground">The canvas has a Starting source column and one column per step with numbered cards. AI dialogs can be minimized while they work.</span></li>
        <li><strong class="block">Restore by myself</strong><span class="text-muted-foreground">Saved versions give you the request that puts a version back, to send with your own installed package.</span></li>
        <li><strong class="block">Query Studio saving without a prompt</strong><span class="text-muted-foreground">Chrome asked you once to allow herokuapp.com for this update, so Query Studio runs are saved without another prompt.</span></li>
        <li><strong class="block">A new look and a Home page</strong><span class="text-muted-foreground">Teal and grey, the header across the top, a regrouped sidebar, and Home as the start page: your connection, automations and journeys at a glance, what needs a look, and the pages and queries you use most.</span></li>
        <li><strong class="block">AI Assist (experimental, Chrome only)</strong><span class="text-muted-foreground">Write, fix and explain queries, and summarize automations and journeys, with Chrome's built-in model. It runs on your computer: nothing is sent over the network. Settings > Experimental turns it off.</span></li>
        <li><strong class="block">Run Query toolbar and tools</strong><span class="text-muted-foreground">Edit, Tables, Open and Save menus; Preview the first 10 rows, Sample a data extension, Find and replace, Clear with Undo, and Earlier text from the last 24 hours.</span></li>
        <li><strong class="block">Load everything</strong><span class="text-muted-foreground">The connection menu can read automations, journeys, activities, Content Builder items and data extensions up front, so overviews, Data Extensions, Run Query and Where used open without a wait.</span></li>
        <li><strong class="block">Automation canvas and Previous / Next</strong><span class="text-muted-foreground">Automations under Overview are drawn like Automation Studio, also in downloads. Automation and journey pages step through the list you opened them from (buttons or the arrow keys).</span></li>
        <li><strong class="block">Contact journeys, step by step</strong><span class="text-muted-foreground">Each entry into a journey shows as one flow with times, its path on the canvas, and Download or CSV.</span></li>
        <li><strong class="block">Report the error</strong><span class="text-muted-foreground">Error messages have a link that opens Feedback with the error and page filled in, for you to check before sending.</span></li>
        <li><strong class="block">Saving on by default</strong><span class="text-muted-foreground">Email versions, Query and Script versions, Share and Query Studio runs are on unless you turn them off in Settings. Query Studio still needs your OK in Chrome once.</span></li>
        <li><strong class="block">Email validation</strong><span class="text-muted-foreground">Data > Email validation checks addresses with SFMC's validation API: one, a list, contacts by Contact Key, or a data extension column, with the results written back to that data extension or a new one.</span></li>
        <li><strong class="block">Contact journeys</strong><span class="text-muted-foreground">Journey > Contact journeys shows the journeys a contact is in and the path it took through each, step by step and outlined on the journey canvas.</span></li>
        <li><strong class="block">Email address validation template</strong><span class="text-muted-foreground">Automation > Templates builds an automation that validates every subscriber's address a batch at a time (needs Script activities in your business unit).</span></li>
        <li><strong class="block">Automation Summary with step details</strong><span class="text-muted-foreground">The Automation Summary tab in Automation Studio shows what each step's activities do (targets, SQL, scripts, waits).</span></li>
        <li><strong class="block">Column values and duplicates</strong><span class="text-muted-foreground">The chart icon by a column name in Preview data and Run Query results lists its distinct values with counts; tick values to filter, or keep only duplicates.</span></li>
        <li><strong class="block">View a CloudPage</strong><span class="text-muted-foreground">CloudPages: View shows the page itself (scripts off), its code (landing pages included), and the raw record; for code resources, their code.</span></li>
        <li><strong class="block">The journey diagram in downloads</strong><span class="text-muted-foreground">HTML and PDF downloads of a journey include its canvas.</span></li>
        <li><strong class="block">Data extension descriptions</strong><span class="text-muted-foreground">Data Extensions has a Description column, also in the Excel and document downloads.</span></li>
        <li><strong class="block">Run trends further back</strong><span class="text-muted-foreground">Automation overview reads past the newest 200 runs of each automation.</span></li>
        <li><strong class="block">Run Query runs again</strong><span class="text-muted-foreground">Fixed "selectCols is not defined" at the Create DE step in 2.0.12, which stopped every run and Save as query activity.</span></li>
        <li><strong class="block">Data Extensions filters</strong><span class="text-muted-foreground">Search all sources, this BU only, Shared only or Synchronized only, and hide QueryStudioResults data extensions.</span></li>
        <li><strong class="block">Smaller query preview</strong><span class="text-muted-foreground">The Saved queries preview fits the window, and Esc or a click outside closes it.</span></li>
        <li><strong class="block">Query Builder, easier</strong><span class="text-muted-foreground">Opens in Visual, the SQL sits at the bottom (minimize or maximize it), aliases come from table names, and ? icons and Help explain each part.</span></li>
        <li><strong class="block">Contacts work</strong><span class="text-muted-foreground">The count and the search use Contact Builder's own session, and you can search up to 1,000 contact keys at once (paste or load a file).</span></li>
        <li><strong class="block">Templates and run history</strong><span class="text-muted-foreground">Pick folders, get the automation's emails, edit the SQL before creating; failed runs name the step and its error.</span></li>
        <li><strong class="block">A visual Query Builder</strong><span class="text-muted-foreground">Tables as cards you join by dragging from field to field, like Diagramforce. Paste SQL to see it as a diagram (From SQL, or Open in Query Builder from Run Query), with subqueries, UNION tabs, AND/OR groups and HAVING. Open any query in Diagramforce as a data model or lineage.</span></li>
        <li><strong class="block">Run Query helps more</strong><span class="text-muted-foreground">Failed runs explain the error and the fix; Fix all applies every one-click fix; stale results are greyed; save results to a data extension; shared team snippets; Join from the schema search.</span></li>
        <li><strong class="block">Checks before saving a query activity</strong><span class="text-muted-foreground">Required fields, dropped columns, types, lengths, primary keys and duplicate keys are checked against the target first.</span></li>
        <li><strong class="block">20 new SQL checks</strong><span class="text-muted-foreground">Syntax from other databases (LIMIT, NOW(), IFNULL), window functions, aliases not in FROM, ORDER BY without TOP, double-quoted text, a LEFT JOIN undone by WHERE, and more. Settings > Lint rules can copy the rules for an AI assistant.</span></li>
        <li><strong class="block">Create DE</strong><span class="text-muted-foreground">Data > Create DE: paste or drop a sample (CSV, TSV, JSON, Parquet, Excel) or start empty, check the guessed fields, pick the folder and retention, and create the data extension.</span></li>
        <li><strong class="block">Preview data</strong><span class="text-muted-foreground">Data Extensions: Preview data reads the rows straight from SFMC, no query needed. Load more or all (up to 50,000), Refresh, sort and filter by column, hide columns, tick rows to copy or download only those (CSV, Excel, Markdown).</span></li>
        <li><strong class="block">Run once</strong><span class="text-muted-foreground">Activities: start a Data Extract (and, not yet checked against SFMC, an Import, File Transfer or Script) from its card, after a confirm.</span></li>
        <li><strong class="block">Sort and filter tables</strong><span class="text-muted-foreground">Click a column header to sort Automations, Journeys, Data Extensions and CloudPages; open Filters for a box per column.</span></li>
        <li><strong class="block">Running automations at a glance</strong><span class="text-muted-foreground">An automation that is running shows a moving bar with the step it is on, kept up to date while you look. Statuses and activity types have icons, and long loads show progress bars.</span></li>
        <li><strong class="block">Query and Script versions</strong><span class="text-muted-foreground">Automation > Saved Activities keeps the SQL and scripts you save in Automation Studio, with the version from before each edit. Compare, copy or restore one.</span></li>
        <li><strong class="block">Save as query activity</strong><span class="text-muted-foreground">From Run Query, create a named Query Activity in the folder you pick, writing to a new or existing data extension. Nothing is run or scheduled.</span></li>
        <li><strong class="block">See where results went</strong><span class="text-muted-foreground">After a run, the results data extension and Query Activity are named, with links.</span></li>
        <li><strong class="block">Query Builder</strong><span class="text-muted-foreground">Drag data extensions to reorder or swap them, and the search finds every data extension.</span></li>
        <li><strong class="block">Overviews ready sooner</strong><span class="text-muted-foreground">Automation overview and Journey overview load quietly in the background after the app opens.</span></li>
        <li><strong class="block">No more empty searches</strong><span class="text-muted-foreground">When an SFMC app has no session, a search connects it and tries again; if that fails it says which app, with Retry and a link to log in.</span></li>
      </ul>
      <ul v-else class="px-5 mt-3 mb-5 space-y-3 text-sm">
        <li><strong class="block">Everything you saved is here</strong><span class="text-muted-foreground">Saved queries with their run history, workspaces, Query Builder queries and email versions, under Queries and Saved Emails in the sidebar.</span></li>
        <li><strong class="block">New sections</strong><span class="text-muted-foreground">Automations, Activities, Journeys, Journey Entry, Data Extensions and CloudPages.</span></li>
        <li><strong class="block">Settings have their own page</strong><span class="text-muted-foreground">Email versions, reuse DE, lint rules, backups and the API console are under Settings.</span></li>
        <li><strong class="block">Several tabs</strong><span class="text-muted-foreground">The toolbar icon opens a new tab each time; Ctrl+K jumps to any section.</span></li>
        <li><strong class="block">Where used</strong><span class="text-muted-foreground">Data > Where used shows what uses a data extension, field, email or content block, and what an automation touches.</span></li>
      </ul>
      <div class="px-5 pb-5"><button class="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium" @click="close">Got it</button></div>
    </div>
  </div>
</template>
