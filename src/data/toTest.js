// To Test (user, 2026-11-04): what to test in test builds, newest version first. Only the
// To Test page imports this, and that page exists only in test builds (__TEST_BUILD__),
// so none of it ships to the Chrome Web Store.
// Item: { id (stable, used to keep results), area, title, where, steps[], expect,
//         live: true when never checked against a live org, ref: feedback numbers }
// Add the next version's items at the top when its work starts.

export const TO_TEST = [
  {
    version: '2.0.20',
    status: 'Not released: test builds only',
    items: [
      {
        id: '2.0.20-ai-rules', area: 'Run Query', title: 'AI Assist writes better SFMC SQL', ref: '#1044', live: true,
        where: 'Run Query > Ask AI (Google Chrome on a desktop with the built-in model)',
        steps: [
          'Ask for "subscribers who opened an email in the last 30 days but never clicked".',
          'Open "What the model gets" and read the instructions.',
          'Ask for something with dates, something with duplicates, and something for a data extension you add.',
          'Try Copy prompt and paste it into another assistant.',
        ],
        expect: 'Instructions include only the rules that fit the request (for example date rules for "last 30 days") and the _Open and _Click fields with their join. Under the answer: "found no problems", "the model fixed them", or a list of what the SQL checks still find.',
      },
      {
        id: '2.0.20-saved-cloudpages', area: 'Content', title: 'Saved CloudPages (version history)', ref: '#1045', live: true,
        where: 'Content > Saved CloudPages; Settings > Emails and CloudPages',
        steps: ['In CloudPages, save a test landing page twice with a visible change, and a code resource once.', 'Open Content > Saved CloudPages, then the page.', 'Select the older version: check the preview (scripts off).', 'Revert to it, then reopen the page in CloudPages.', 'Turn Save CloudPage versions off in Settings and save again.'],
        expect: 'Each save is a new version (the CloudPages editor saving through the same API as Content Builder is a guess: if nothing appears, send a capture of the save request). Revert puts the older content back; publishing is still up to you. With the switch off, no new versions.',
      },
      {
        id: '2.0.20-code-compare', area: 'Content', title: 'Code view and Compare (emails and CloudPages)', ref: '#1046',
        where: 'Saved Emails or Saved CloudPages > a record with 2 or more versions',
        steps: ['Pick a version and click Code.', 'Click Compare (or pick a version in Compare with).', 'Switch between Preview and Code while comparing.', 'Open a code resource (CSS or JavaScript).'],
        expect: 'Code shows the HTML with AMPscript as written. Compare puts the older version on the left, marks changed lines and words, and counts added and removed lines; Preview shows both pages next to each other. A code resource opens straight in code.',
      },
      {
        id: '2.0.20-dialogs-messages', area: 'Everywhere', title: 'Dialogs and messages instead of alerts and toasts', ref: '#1050',
        where: 'Automations > an automation > Run once on an activity; Saved queries delete; Settings > Storage; any Copy button',
        steps: ['Click Run once on a Data Extract activity, then Cancel, then again and Run now.', 'Delete something in Settings > Storage.', 'Copy something, and cause an error (for example run a query with a typo).', 'Open a File Transfer activity.'],
        expect: 'Questions appear as an in-app dialog (Esc or Cancel says no). Run once shows its result inside the activity card until closed. Other messages appear in a bar at the top of the page: errors stay with Copy and Report, others close after a few seconds. File Transfer has no Run once.',
      },
      {
        id: '2.0.20-restore-by-myself', area: 'Saved Emails, CloudPages and Activities', title: 'Restore by myself', ref: '#1045',
        where: 'An older version in Saved Emails, Saved CloudPages or Saved Activities > Restore by myself',
        steps: ['Open Restore by myself; Download request body and Download instructions.', 'With an installed package (Saved Content Write and Documents and Images Write, or Automations Write), get a token and send the request with Postman or cURL.', 'Reopen the email, page or activity in SFMC.'],
        expect: 'The request puts that version back; the files hold no token or secret; Restore still works as before.',
      },
      {
        id: '2.0.20-send-results', area: 'To Test (test builds only)', title: 'Send results',
        where: 'To Test page > Send results',
        steps: ['Mark a few items Pass, Fail and Skip, and type a note on one.', 'Click Send results, add your name and send.'],
        expect: 'The Feedback form opens as Test results with a summary (counts) and every item with its result and note; it will not send without a name.',
      },
      {
        id: '2.0.20-features-page', area: 'Help', title: 'Features page matches the current version',
        where: 'Settings > About > Features, and What\'s New',
        steps: ['Read the sidebar, Clean up, colour and "What is sent where" entries.'],
        expect: 'No mention of Google Analytics, Salesforce blue, Delete Toolkit runs under Queries or the old request log.',
      },
    ],
  },
  {
    version: '2.0.19',
    status: 'On GitHub; store upload pending',
    items: [
      {
        id: '2.0.19-look-home', area: 'Look and Home', title: 'New look and the Home page', ref: '#1025, #1031',
        where: 'Home (the start page) and every page',
        steps: ['Open the Toolkit, connected to a sandbox.', 'Look at Home: connection, automations and journeys, what needs a look, recent queries.', 'Use the Home search box and Ctrl+K.', 'Narrow the window below 768px.'],
        expect: 'Teal and grey look in light and dark mode, Home filled from your business unit, the sidebar shows icons only in a narrow window and closes after a page is picked.',
      },
      {
        id: '2.0.19-load-everything', area: 'Connection', title: 'Load everything', ref: '#1037', live: true,
        where: 'Connection menu (the stack pill, top right) > Load everything',
        steps: ['Click Load everything on a business unit with many automations.', 'Watch each part\'s count and time; try Stop and Refresh.', 'Open Automation overview, Data Extensions, Run Query and Where used afterwards.', 'Optional: Settings > Connection, run it when the Toolkit connects.'],
        expect: 'Each part finishes or says why not; afterwards those pages open without loading again. Nothing is downloaded.',
      },
      {
        id: '2.0.19-qs-notice', area: 'Run Query', title: 'Offer to save Query Studio runs', ref: '#1039', live: true,
        where: 'Home and Run Query (top notice)',
        steps: ['On a profile without the Query Studio permission, click Turn on and accept Chrome\'s prompt.', 'Run a query in Query Studio and check Saved queries.', 'On another profile, click Not now.'],
        expect: 'Turn on shows Chrome\'s prompt; after accepting, runs appear in Saved queries and the notice is gone. Not now hides it for good.',
      },
      {
        id: '2.0.19-ai-places', area: 'AI (experimental)', title: 'AI in more places', ref: '#1029, #1032, #1034', live: true,
        where: 'Run Query, Home, Query Builder, saved queries, automations, journeys, Where used, Create DE',
        steps: ['Home: "Describe the query you need".', 'Run Query: Ask AI, then close the dialog while it thinks (Keep working).', 'Query Builder: Ask AI and Explain.', 'Explain on a saved query and a query activity; Summarize on an automation, a journey and Where used results.', 'Create DE: Suggest types.', 'Settings > Experimental: turn AI off.'],
        expect: 'Every button works with Chrome\'s built-in model; the panel pill says when a background answer is ready; emails and phone numbers are masked in prompts; turning it off hides every AI button.',
      },
      {
        id: '2.0.19-run-query-tools', area: 'Run Query', title: 'Toolbar menus and new tools', ref: '#1028, #1030',
        where: 'Run Query toolbar: Edit, Tables, Open, Save',
        steps: ['Preview (TOP 10) and Sample rows on a data extension.', 'Find and replace, Clear then Undo, Earlier text.', 'Open a query activity into a panel that has SQL; Save as query activity with Overwrite.', 'Make the panel narrow (2x2 layout).'],
        expect: 'Each menu item does what its line says; overwrites ask first; narrow panels drop labels and wrap instead of cutting buttons off.',
      },
      {
        id: '2.0.19-where-used-names', area: 'Where used', title: 'Automation names and run history from Where used', ref: '#1041, #1042', live: true,
        where: 'Activities > a query or script > Where used',
        steps: ['Run Where used on an activity that is in an automation.', 'Click the automation in the results.', 'Open Run history on that automation.'],
        expect: 'Results show the automation name with step and activity; the automation page opens and run history loads (no "not a valid identifier").',
      },
      {
        id: '2.0.19-prev-next', area: 'Automations and Journeys', title: 'Previous and Next', ref: '#1043',
        where: 'Automations or Journeys list > open one',
        steps: ['Search or filter the list, open one in the middle.', 'Use the arrows in the header and the ← → keys.', 'Open an automation from Where used instead.'],
        expect: '"3 of 40" and the arrows follow the list as shown; keys do nothing while typing; no arrows when not opened from a list.',
      },
      {
        id: '2.0.19-automation-canvas', area: 'Automations', title: 'Automation canvas', ref: '#1035, #1038',
        where: 'An automation > Overview; Download menu',
        steps: ['Open an automation (it opens in Full view).', 'Switch to Overview, click an activity on the canvas.', 'Download HTML and PDF.'],
        expect: 'Start source and one lane per step with its activities; the downloads include the canvas.',
      },
      {
        id: '2.0.19-journey-canvas', area: 'Journeys', title: 'Interactive journey canvas (contributed by João Lucas)', ref: 'PR #3',
        where: 'Journeys > a journey',
        steps: ['Pan, zoom, use the minimap and keyboard; switch horizontal and vertical.', 'Click activities of different types.', 'Download HTML and PDF.'],
        expect: 'Icons per activity type, settings in the side panel, the downloads draw the same canvas.',
      },
      {
        id: '2.0.19-contact-journeys', area: 'Contacts', title: 'Contact journeys as flows', ref: '#1017 to #1020', live: true,
        where: 'Contacts > Contact journeys',
        steps: ['Find a test contact that went through a journey.', 'Pick an entry; check its path on the canvas.', 'Visit another page and come back; Download and CSV.'],
        expect: 'One flow per entry (Entry, Email, Left the journey...) with times on hover; results kept; downloads include the path.',
      },
      {
        id: '2.0.19-des', area: 'Data Extensions', title: 'Data Extensions page', ref: '#1040',
        where: 'Data > Data Extensions',
        steps: ['Search; open a data extension\'s detail panel.', 'Columns menu: Description, Modified, Created and ID start hidden; turn them on.', 'Tabs: Storage and Where used.'],
        expect: 'Hidden columns come back from Columns and stay as chosen; the panel shows keys, dates, fields and preview.',
      },
      {
        id: '2.0.19-create-de-where-used', area: 'Data', title: 'Create DE and Where used pages (new design)',
        where: 'Data > Create DE; Data > Where used',
        steps: ['Create a test data extension from a pasted CSV.', 'Run Where used on a data extension.'],
        expect: 'Steps rail and sticky bar on Create DE; progress ring and count tiles on Where used; both work as before.',
      },
      {
        id: '2.0.19-report-error', area: 'Feedback', title: 'Report the error',
        where: 'Any error message',
        steps: ['Cause an error (for example run invalid SQL).', 'Click Report the error.'],
        expect: 'Feedback opens with the error, page and time filled in, editable before sending.',
      },
      {
        id: '2.0.19-saving-defaults', area: 'Settings', title: 'Saving on by default', ref: '#1021',
        where: 'Settings > Emails, Automation Studio activities, Running queries',
        steps: ['On a fresh profile, save an email in Content Builder and a query activity in Automation Studio.', 'Check Saved Emails and Saved Activities; turn each off in Settings.'],
        expect: 'Versions are kept by default; switches turn them off; Share still previews and asks first.',
      },
      {
        id: '2.0.19-unwatch', area: 'Automations', title: 'Unwatch options', ref: '#1027',
        where: 'Automation overview > Watched',
        steps: ['Watch two automations, then Unwatch one, Unwatch all, Unwatch the ones not found.'],
        expect: 'Each removes the right watches.',
      },
      {
        id: '2.0.19-reorder-off', area: 'Data Extensions', title: 'Reorder columns is hidden', ref: '#1033',
        where: 'Data Extensions > Fields',
        steps: ['Open a data extension\'s fields.'],
        expect: 'No Reorder columns button.',
      },
    ],
  },
  {
    version: '2.0.16 to 2.0.18',
    status: 'In the store: worth a retest',
    items: [
      {
        id: '2.0.18-email-validation', area: 'Data', title: 'Email validation', live: true,
        where: 'Data > Email validation',
        steps: ['One address; a pasted list; contacts by Contact Key; a test data extension column into three fields and into a new data extension.'],
        expect: 'Valid or not with the reason; results written back to the right rows by primary key.',
      },
      {
        id: '2.0.18-email-template', area: 'Templates', title: 'Email address validation template', live: true,
        where: 'Automation > Templates',
        steps: ['Create it in a sandbox with Script activities on; add the client ID and secret to its settings data extension; run the automation once.'],
        expect: 'The batch is validated and the run stops before 30 minutes.',
      },
      {
        id: '2.0.18-privacy', area: 'Settings', title: 'Share and Feedback show what is sent',
        where: 'Run Query > Save > Share; Feedback',
        steps: ['Share a query: read the preview.', 'Open a share link: Import.', 'Feedback: add a screenshot, Hide and Crop, Review and send.'],
        expect: 'Nothing is sent or imported without a click, and the payload shown is what is sent.',
      },
      {
        id: '2.0.17-column-values', area: 'Results', title: 'Column values and duplicates', ref: '#1012',
        where: 'Run Query results and Preview data: chart icon by a column name',
        steps: ['Open the values of a column; tick values; Duplicates only; Copy.', 'Preview data: Distinct values / Duplicates in SFMC.'],
        expect: 'Counts match the rows; ticking filters; the SFMC options open a GROUP BY query in Run Query.',
      },
      {
        id: '2.0.16-cloudpages', area: 'Content', title: 'CloudPages View', ref: '#1010, #1011', live: true,
        where: 'Content > CloudPages > View',
        steps: ['View a landing page and a code resource.'],
        expect: 'Preview (scripts off), the page\'s code and the raw record; code resources show their code; published pages say Published.',
      },
      {
        id: '2.0.16-de-description', area: 'Data Extensions', title: 'Description column in downloads', ref: '#1008',
        where: 'Data Extensions > Excel and Download',
        steps: ['Download the list as Excel and as a document.'],
        expect: 'Descriptions are included.',
      },
      {
        id: '2.0.16-run-trends', area: 'Automations', title: 'Run trends past 200 runs', ref: '#1007',
        where: 'Automation overview',
        steps: ['Look at run trends for an automation that runs often.'],
        expect: 'The chart covers the whole period, not only the newest 200 runs.',
      },
    ],
  },
]

export const toTestCount = () => TO_TEST.reduce((n, v) => n + v.items.length, 0)
