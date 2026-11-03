import { describe, expect, it } from 'vitest'
import { describeJourneyNode, journeyDoc, journeyGraph, layoutJourney, nodeDisplayType } from '../journeys.js'
import { journeyActivityVisual, journeyCanvasModel } from '../journeyCanvas.js'

const variants = [
  ['Salesforce_Activity_Account', 'Account', 'SALESFORCEACCOUNTACTIVITY', 'salesforceAccount'],
  ['Salesforce_Activity_CampaignMember', 'Campaign Member', 'SALESFORCECAMPAIGNMEMBERACTIVITY', 'salesforceCampaign'],
  ['Salesforce_Activity_Case', 'Case', 'SALESFORCECASEANDCONTACTACTIVITY', 'salesforceCase'],
  ['Salesforce_Activity_Contact', 'Contact', 'SALESFORCECONTACTACTIVITY', 'salesforceContact'],
  ['Salesforce__LeadConversion', 'Convert Lead', 'SALESFORCELEADCONVERSIONACTIVITY', 'salesforceConvertLead'],
  ['Salesforce_Activity_Lead', 'Lead', 'SALESFORCELEADACTIVITY', 'salesforceLead'],
  ['Salesforce_Activity', 'Object Activity', 'SALESFORCEGENERICOBJECTACTIVITY', 'salesforceObject'],
  ['Salesforce_Activity_Opportunity', 'Opportunity', 'SALESFORCEOPPORTUNITY', 'salesforceOpportunity'],
  ['Salesforce_Activity_Task', 'Task', 'SALESFORCETASKACTIVITY', 'salesforceTask'],
]

function activity(extension, overrides = {}) {
  const type = extension === 'Salesforce__LeadConversion' ? 'SALESFORCELEADCONVERSIONACTIVITY' : 'SALESCLOUDACTIVITY'
  return {
    key: `${type}-synthetic`, type, name: '',
    configurationArguments: { applicationExtensionKey: extension },
    metaData: { isConfigured: false }, outcomes: [], ...overrides,
  }
}

function modelOf(raw, orientation = 'horizontal') {
  const graph = journeyGraph({ activities: [raw] })
  const layout = layoutJourney(graph)
  return { graph, layout, model: journeyCanvasModel(graph, layout, orientation, raw.key) }
}

describe('Sales and Service Cloud presentation', () => {
  it.each(variants)('identifies %s from its definition without rewriting the raw type', (extension, name, displayType, icon) => {
    const raw = activity(extension)
    const before = JSON.stringify(raw)
    const { graph, model } = modelOf(raw)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(nodeDisplayType(raw)).toBe(displayType)
    expect(nodeDisplayType(node)).toBe(displayType)
    expect(node).toMatchObject({ name, type: raw.type })
    expect(node.raw).toBe(raw)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({
      key: raw.key, name, typeLabel: name, active: true, iconUrl: null,
      visual: { icon, shape: 'square', color: '#a8b7c7' },
    })
    expect(describeJourneyNode(node)).toMatchObject({ title: name, typeLabel: name })
    expect(JSON.stringify(raw)).toBe(before)
  })

  it.each(variants)('keeps %s blue when configuration is true or unspecified', (extension, name, displayType, icon) => {
    for (const metaData of [{ isConfigured: true }, {}, undefined]) {
      const raw = activity(extension, { metaData })
      const { model } = modelOf(raw)
      expect(model.nodes.find((node) => node.id === raw.key).data.visual).toEqual({ icon, shape: 'square', color: '#00a1e0' })
    }
  })

  it.each(variants)('normalizes technical names for %s while keeping custom names', (extension, name, displayType) => {
    for (const rawName of ['', undefined, activity(extension).type, displayType]) {
      const raw = activity(extension, { name: rawName })
      expect(modelOf(raw).graph.nodes.find((node) => node.key === raw.key).name).toBe(name)
    }
    const raw = activity(extension, { name: 'Synthetic follow-up' })
    const { graph, layout, model } = modelOf(raw)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: raw.name, typeLabel: name })
    expect(journeyDoc({ name: 'Synthetic journey' }, graph, layout).blocks).toContainEqual({ type: 'h', level: 3, text: `${name}: Synthetic follow-up` })
  })

  it.each(['horizontal', 'vertical'])('preserves the nine activities and their connections in %s', (orientation) => {
    const activities = variants.map(([extension], i) => activity(extension, {
      key: `synthetic-step-${i}`, outcomes: i < variants.length - 1 ? [{ next: `synthetic-step-${i + 1}` }] : [],
    }))
    const journey = { activities }
    const before = JSON.stringify(journey)
    const graph = journeyGraph(journey)
    const model = journeyCanvasModel(graph, layoutJourney(graph), orientation, activities[4].key)
    expect(model.nodes.filter((node) => activities.some((activity) => activity.key === node.id))).toHaveLength(9)
    expect(model.edges.map((edge) => [edge.source, edge.target])).toEqual(graph.edges.map((edge) => [edge.from, edge.to]))
    expect(model.edges.every((edge) => !/NaN|undefined/.test(edge.data.path))).toBe(true)
    expect(model.nodes.find((node) => node.id === activities[4].key).data.active).toBe(true)
    expect(JSON.stringify(journey)).toBe(before)
  })

  it.each([undefined, '', 'PartnerActivity', 'Salesforce_Activity_AccountExtra', 'salesforce_activity_account', '__proto__'])('keeps the generic fallback for unknown extension %s', (extension) => {
    const raw = activity(extension, { key: 'Salesforce_Activity_Account', name: 'Account' })
    expect(nodeDisplayType(raw)).toBe('SALESCLOUDACTIVITY')
    const { model } = modelOf(raw)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: 'Account', typeLabel: 'Salesforce activity', visual: { icon: 'cloud', color: '#a8b7c7' } })
    expect(journeyActivityVisual(raw.type).color).toBe('#167bbb')
  })

  it.each(['EMAILV2', 'REST', 'WAIT', 'PartnerActivity'])('does not reinterpret an unrelated raw type %s', (type) => {
    expect(nodeDisplayType(activity('Salesforce_Activity_Account', { type }))).toBe(type)
  })
})
