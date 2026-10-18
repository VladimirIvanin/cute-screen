import {
  render,
  fireEvent,
  within,
} from '@testing-library/vue'
import {
  describe,
  it,
  expect,
} from 'vitest'
import { createCalloutLayer } from '@cute-screen/editor-renderer'
import ContextToolbar from '../../../packages/editor-vue/src/shell/components/ContextToolbar.vue'

const payload = createCalloutLayer({ id: 'label', text: 'Label', target: { x: 0, y: 0 }, label: { x: 200, y: 100 } }, {})!.payload
const schema = { icon: 'callout' as const, title: 'Callout', hint: 'Callout settings', controls: [], callout: payload }

describe('compact callout toolbar', () => {
  it('exposes five groups, changes the route and enters segment insertion without a document mutation', async () => {
    const view = render(ContextToolbar, { props: { schema, label: 'Callout', pickerLocale: 'en' } })
    expect(view.container.querySelectorAll('.cs-callout-toolbar > button')).toHaveLength(5)
    await fireEvent.click(view.getByRole('button', { name: 'Route' }))
    const routePanel = within(await view.findByRole('dialog', { name: 'Route' }))
    await fireEvent.click(routePanel.getByRole('button', { name: 'Line' }))
    expect(view.emitted().change).toContainEqual(['calloutRoute', 'straight'])
    expect(view.queryByRole('combobox')).not.toBeInTheDocument()
    await fireEvent.click(view.getByRole('button', { name: 'Left' }))
    expect(view.emitted().change).toContainEqual(['calloutAttachment', 'right'])
    await fireEvent.click(view.getByRole('button', { name: 'Auto' }))
    expect(view.emitted().change).toContainEqual(['calloutAttachment', 'auto'])
    await fireEvent.click(view.getByRole('button', { name: 'Add step' }))
    expect(view.emitted().change).toContainEqual(['calloutInsert', ''])
    expect(view.queryByRole('dialog', { name: 'Route' })).not.toBeInTheDocument()
  })
  it('offers all five label appearances and restores trigger focus on Escape', async () => {
    const view = render(ContextToolbar, { props: { schema, label: 'Callout', pickerLocale: 'en' } })
    const trigger = view.getByRole('button', { name: 'Label' })
    await fireEvent.click(trigger)
    await fireEvent.click(await view.findByRole('button', { name: 'Pill' }))
    const changes = view.emitted().change as string[][]
    expect(JSON.parse(changes[0]![1]!)).toMatchObject({ kind: 'capsule' })
    await fireEvent.keyDown(view.getByRole('dialog', { name: 'Label' }), { key: 'Escape' })
    expect(trigger).toHaveFocus()
  })
  it('blocks every group in locked/read-only state', () => {
    const view = render(ContextToolbar, { props: { schema: { ...schema, disabled: true }, label: 'Callout', pickerLocale: 'ru' } })
    for (const button of view.container.querySelectorAll('.cs-callout-toolbar > button')) expect(button).toBeDisabled()
  })
  it('renders endpoint SVGs and exposes size/color without a disclosure', async () => {
    const view = render(ContextToolbar, { props: { schema, label: 'Callout', pickerLocale: 'en' } })
    await fireEvent.click(view.getByRole('button', { name: 'Endpoints' }))
    const panel = await view.findByRole('dialog', { name: 'Endpoints' })
    expect(panel.querySelectorAll('.cs-callout-marker-choices svg')).toHaveLength(10)
    expect(panel.querySelector('details')).toBeNull()
    expect(view.getByRole('spinbutton', { name: 'Size' })).toBeVisible()
    expect(view.getByRole('button', { name: 'Marker color' })).toBeVisible()
  })
})
