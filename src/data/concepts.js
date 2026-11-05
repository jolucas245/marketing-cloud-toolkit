// Concepts explained in plain words (feedback #1067), by sidebar group, shown by the
// Concepts button in the top bar for the section you are in. Facts about SFMC only;
// keep each short.
export const CONCEPTS = {
  Queries: [
    { term: 'Query activity', text: 'A saved SQL query in Automation Studio. It writes its results into a target data extension when it runs, alone (Run once) or as a step of an automation.' },
    { term: 'Target data extension', text: 'Where a query activity writes its rows. Its fields must match the columns the SQL returns, by name and type.' },
    { term: 'Data action', text: 'How the rows are written: Overwrite (empty the target first), Update (change rows with the same primary key, add new ones) or Append (only add rows).' },
    { term: 'Data views', text: 'System tables such as _Sent, _Open, _Click, _Bounce, _Subscribers, _Job and _Journey that hold about six months of tracking. They can be read in SQL but not changed.' },
    { term: 'Run in the Toolkit', text: 'Run Query makes a results data extension and a temporary query activity in a QuerySaver folder, runs it and reads the rows back. Clean up under Settings removes what is left.' },
    { term: 'SFMC SQL', text: 'Microsoft SQL Server syntax, SELECT only, with a 30-minute limit per run. No variables, temporary tables or ORDER BY without TOP.' },
  ],
  Data: [
    { term: 'Data extension (DE)', text: 'A table in Marketing Cloud. It has fields (columns), an optional primary key and settings such as sendable and data retention.' },
    { term: 'Primary key', text: 'One or more fields whose values identify a row. Update and upsert match rows on it; without one, rows can only be added.' },
    { term: 'Sendable', text: 'A sendable DE can be the audience of a send. One of its fields is related to Subscriber Key (or Subscriber ID) so SFMC knows who each row is.' },
    { term: 'Shared and Synchronized', text: 'Shared DEs live in the parent (Enterprise) business unit and are read as ENT.[Name] from a child unit. Synchronized DEs are copies of Salesforce CRM objects kept by Marketing Cloud Connect.' },
    { term: 'Data retention', text: 'Rows (or the whole DE) are deleted after a set period. Off means they stay until someone deletes them.' },
    { term: 'Folders', text: 'Contact Builder folders that group DEs. A folder only organizes; it does not change who can read a DE.' },
  ],
  Contacts: [
    { term: 'Contact', text: 'A person in Contact Builder across every channel, identified by a Contact Key (the same value as Subscriber Key for email).' },
    { term: 'Subscriber Key', text: 'The ID of an email subscriber. Using the CRM ID or another stable value (not the email address) lets the address change without making a new subscriber.' },
    { term: 'All Subscribers', text: 'The email list that holds every subscriber of a business unit and their status (Active, Unsubscribed, Held, Bounced).' },
  ],
  Automation: [
    { term: 'Automation', text: 'A set of steps that run in order in Automation Studio, started by a schedule, a file drop or by hand. Activities in one step run side by side.' },
    { term: 'Status', text: 'Scheduled (will run at its next time), Running, Paused, Ready or Building (not scheduled), Inactive, and Error for the last run.' },
    { term: 'Activity', text: 'One piece of work in a step: SQL query, import, data extract, file transfer, script, filter, send and others. The same activity can be used in several automations.' },
    { term: 'Schedule', text: 'When the automation starts: once, or repeating by minute, hour, day, week or month, in the time zone set on the schedule.' },
    { term: 'File drop', text: 'Starts the automation when a file with a matching name arrives in the SFTP folder it watches.' },
    { term: 'Run history', text: 'One record per run and per activity, with its status and error message. The _AutomationInstance and _AutomationActivityInstance data views hold the same information for SQL.' },
  ],
  Journeys: [
    { term: 'Journey', text: 'A path in Journey Builder that contacts enter and move along: sends, waits, decisions and updates. Each published change makes a new version.' },
    { term: 'Entry source', text: 'How contacts get in: a data extension on a schedule, an API event, a Salesforce record change, or an audience.' },
    { term: 'Entry event', text: 'The definition behind the entry source, with its key and the data extension that keeps the data each contact entered with.' },
    { term: 'Re-entry', text: 'Whether a contact can enter again: never, any time, or only after leaving the journey.' },
    { term: 'Decision split', text: 'Sends each contact down one path based on its data. Engagement splits look at opens or clicks of an earlier email.' },
    { term: 'Goal and exit criteria', text: 'Rules checked as contacts move: a goal counts who reached it, exit criteria take contacts out of the journey.' },
  ],
  Content: [
    { term: 'Content Builder', text: 'Where emails, templates, content blocks and images live, in folders. Emails are assets with a subject line, preheader, HTML and text views.' },
    { term: 'Template-based and HTML emails', text: 'A template-based email fills the slots of a template with blocks; an HTML email is one piece of code. Both can hold AMPscript.' },
    { term: 'Personalization string', text: 'A field name between %% signs, such as %%FirstName%%. SFMC fills it from the sending data extension or the subscriber profile.' },
    { term: 'AMPscript', text: 'SFMC\'s scripting language, inside %%[ ]%% blocks or %%= =%% for output. It runs when the email is sent or previewed, so the Toolkit shows it as written unless SFMC renders the preview.' },
    { term: 'CloudPages', text: 'Landing pages, web pages and code resources published on an SFMC address. Changes go live only after Publish.' },
    { term: 'Saved versions', text: 'The Toolkit keeps a copy each time you save an email or CloudPage, in this browser only, so you can compare and go back.' },
  ],
}

/** Concepts for a sidebar group (route meta.group), or every group's when unknown. */
export function conceptsFor(group) {
  if (group && CONCEPTS[group]) return [{ group, items: CONCEPTS[group] }]
  return Object.entries(CONCEPTS).map(([g, items]) => ({ group: g, items }))
}
