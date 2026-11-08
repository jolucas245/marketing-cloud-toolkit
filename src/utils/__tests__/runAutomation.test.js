import { describe, it, expect } from 'vitest'
import { createRunAutomation, runAutomationOnce, fetchLatestAutomationRun, deleteAutomation } from '../sfmcApi.js'
import { waitForAutomationRun, automationRunError, RunFailedError, runNames } from '../queryRun.js'
import { explainRunError } from '../runErrors.js'

// Run Query through an automation, from the live test on 2026-11-08 (s10): a Query
// Activity started on its own never says why it failed; inside an automation, the run
// log does.

const recorder = (answer = {}) => {
  const calls = []
  const fetch = async (url, method, body) => { calls.push({ url, method, body }); return typeof answer === 'function' ? answer(url) : answer }
  return { calls, fetch }
}
const GUID = 'ceb83d0f-ece2-4458-bd5e-d5d807f40ee6'
const LIST_ID = 'RHoyNHp1THNXRVM5WHRYWUJfUU81ZzoyNTow' // Automation Studio's ID for GUID (live)

describe('SFMC calls', () => {
  it('creates the automation with a Schedule start source and no schedule, so Run Once is allowed', async () => {
    const { calls, fetch } = recorder({ id: GUID })
    await createRunAutomation('s10', { name: 'SFMCQS_run_x', activityId: 'qd-1', activityName: 'SFMCQS_act_x' }, fetch)
    expect(calls[0].url).toBe('https://mc.s10.exacttarget.com/cloud/fuelapi/automation/v1/automations')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toMatchObject({
      name: 'SFMCQS_run_x',
      startSource: { typeId: 1 },
      steps: [{ step: 1, activities: [{ objectTypeId: 300, activityObjectId: 'qd-1', name: 'SFMCQS_act_x' }] }],
    })
    expect(calls[0].body.schedule).toBeUndefined()
  })

  it('runs it once', async () => {
    const { calls, fetch } = recorder()
    await runAutomationOnce('s10', GUID, fetch)
    expect(calls[0]).toMatchObject({ url: `https://mc.s10.exacttarget.com/cloud/fuelapi/automation/v1/automations/${GUID}/actions/runallonce`, method: 'POST' })
  })

  it('reads the newest run from the run log by the list ID, around today', async () => {
    const { calls, fetch } = recorder({ entry: [{ status: 'Complete' }] })
    expect(await fetchLatestAutomationRun('s10', GUID, fetch, new Date('2026-11-08T15:00:00Z'))).toEqual({ status: 'Complete' })
    expect(calls[0].url).toContain(`/legacy/v1/beta/automations/automation/instance/?definition_id=${LIST_ID}&$top=1&begin_date=2026-11-07&end_date=2026-11-09`)
    expect(await fetchLatestAutomationRun('s10', GUID, recorder({ entry: [] }).fetch)).toBeNull()
  })

  it('deletes the way Automation Studio does: the REST DELETE answers 404 and deletes nothing', async () => {
    const { calls, fetch } = recorder()
    await deleteAutomation('s10', GUID, fetch)
    expect(calls[0]).toEqual({ url: `https://mc.s10.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/legacy/v1/beta/automation/Delete/${LIST_ID}`, method: 'DELETE', body: null })
  })
})

describe('runNames', () => {
  it('names the automation with the same token as the DE and the activity', () => {
    const n = runNames(new Date(2026, 10, 8, 9, 0, 0), () => 0.5)
    expect(n.autoName).toBe(n.deName.replace('SFMCQS_sql_', 'SFMCQS_run_'))
  })
})

const LIVE_ERROR = {
  status: 'Error',
  processes: [{ workerCounts: [{ name: 'QueryDefinition', status: 'Error', error: { translatedMsg: "Query failed during execution. Error: Conversion failed when converting the nvarchar value 'Leo' to data type int." } }] }],
}

describe('automationRunError', () => {
  it('gives SFMC\'s reason without its lead-in', () => {
    expect(automationRunError(LIVE_ERROR)).toBe("Conversion failed when converting the nvarchar value 'Leo' to data type int.")
  })
  it('falls back to the run\'s statusMessage, and is empty without either', () => {
    expect(automationRunError({ status: 'Error', statusMessage: 'Timed out' })).toBe('Timed out')
    expect(automationRunError({ status: 'Error' })).toBe('')
  })
})

describe('waitForAutomationRun', () => {
  const run = (records) => {
    let i = 0
    return waitForAutomationRun({ latestRun: async () => records[Math.min(i++, records.length - 1)], sleep: async () => {} })
  }

  it('waits while the run is not shown yet or executing, then returns the completed run', async () => {
    expect(await run([null, { status: 'Executing' }, { status: 'Complete' }])).toEqual({ status: 'Complete' })
  })

  it('throws SFMC\'s reason for a failed run, which the run error help then explains', async () => {
    const err = await run([{ status: 'Executing' }, LIVE_ERROR]).catch((e) => e)
    expect(err).toBeInstanceOf(RunFailedError)
    expect(err.message).toBe("The query failed in SFMC: Conversion failed when converting the nvarchar value 'Leo' to data type int.")
    expect(explainRunError(err.message).fix).toMatch(/TRY_CAST/)
  })

  it('says so when SFMC gives no reason', async () => {
    const err = await run([{ status: 'Error' }]).catch((e) => e)
    expect(err.message).toBe('The query failed in SFMC, and SFMC gave no reason beyond "system error".')
    // What SFMC said for a division by zero (live test, 2026-11-08), with the SQL hints.
    const zero = await run([{ status: 'Error', processes: [{ workerCounts: [{ error: { translatedMsg: 'Automation failed due to system error.' } }] }] }]).catch((e) => e)
    expect(zero.message).toBe('The query failed in SFMC, and SFMC gave no reason beyond "system error".')
    expect(explainRunError(zero.message, 'SELECT 100 / (LEN(FirstName) - 3) AS Ratio FROM Demo_Customers').sqlHints.join(' ')).toMatch(/NULLIF/)
  })

  it('gives up after maxMs and stops when aborted', async () => {
    let t = 0
    const slow = waitForAutomationRun({ latestRun: async () => ({ status: 'Executing' }), sleep: async (ms) => { t += ms }, now: () => t, maxMs: 60000 })
    await expect(slow).rejects.toThrow(/still running the query after 1 minutes/)
    const stopped = waitForAutomationRun({ latestRun: async () => null, sleep: async () => {}, aborted: () => true })
    await expect(stopped).rejects.toThrow('Poll aborted')
  })
})
