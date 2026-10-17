import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import SettingsApp from '../../../apps/desktop/src/SettingsApp.vue'
import { createSettingsHarnessBridge } from '../../../apps/desktop/src/settings/browser-harness'

async function openShortcuts() {
  const bridge = createSettingsHarnessBridge()
  const view = render(SettingsApp, { props: { bridge } })
  await fireEvent.click(await screen.findByRole('button', { name: 'Keyboard shortcuts' }))
  await screen.findByRole('button', { name: 'Assign shortcut: Capture area' })
  return { bridge, ...view }
}

describe('settings navigation and inline recorder', () => {
  it('starts on General and exposes both sections', async () => {
    render(SettingsApp, { props: { bridge: createSettingsHarnessBridge() } })
    await screen.findByRole('heading', { name: 'General' })
    expect(screen.queryByText('Suggested for area capture')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    await screen.findByRole('heading', { name: 'Keyboard shortcuts' })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('records immediately in the action row and saves after preflight', async () => {
    const { bridge, container } = await openShortcuts()
    const recording = vi.spyOn(bridge, 'recording')
    await fireEvent.click(screen.getByRole('button', { name: 'Assign shortcut: Capture area' }))
    const row = within(container.querySelector('[data-action="capture-area"]') as HTMLElement)
    await row.findByText('Press the keys together')
    expect(recording).toHaveBeenLastCalledWith(true)
    await fireEvent.keyDown(window, { key: '2', code: 'Digit2', ctrlKey: true, shiftKey: true })
    await row.findByText('Available in registration check')
    await fireEvent.click(row.getByRole('button', { name: 'Save' }))
    await row.findByText('Assigned')
    expect((await bridge.snapshot()).entries[0]?.trigger).toBe('CTRL+SHIFT+2')
  })

  it('cancels recording on navigation without assigning a draft', async () => {
    const { bridge } = await openShortcuts()
    const assign = vi.spyOn(bridge, 'assign')
    const recording = vi.spyOn(bridge, 'recording')
    await fireEvent.click(screen.getByRole('button', { name: 'Assign shortcut: Capture area' }))
    await screen.findByText('Press the keys together')
    await fireEvent.click(screen.getByRole('button', { name: 'General' }))
    await screen.findByRole('heading', { name: 'General' })
    await waitFor(() => expect(recording).toHaveBeenLastCalledWith(false))
    expect(assign).not.toHaveBeenCalled()
  })
})
