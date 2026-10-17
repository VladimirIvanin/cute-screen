import {
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import SettingsApp from '../../../apps/desktop/src/SettingsApp.vue'
import { createEditorShellPinia } from '@cute-screen/editor-vue'
import { createSettingsHarnessBridge } from '../../../apps/desktop/src/settings/browser-harness'
import { recordTrigger } from '../../../apps/desktop/src/settings/labels'

function render(...args: Parameters<typeof renderComponent>) {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/?settings=shortcuts')
  return renderComponent(args[0], {
    ...args[1],
    global: { ...args[1]?.global, plugins: [createEditorShellPinia()] },
  })
}

describe('activation settings production mount flow', () => {
  it('offers system approval during setup without changing the startup choice', async () => {
    const bridge = createSettingsHarnessBridge()
    bridge.autostart = async () => ({ state: 'requiresApproval', message: null })
    const system = vi.spyOn(bridge, 'autostartSystemSettings')
    const setAutostart = vi.spyOn(bridge, 'setAutostart')
    render(SettingsApp, { props: { bridge, firstRun: true } })
    await fireEvent.click(await screen.findByRole('button', { name: 'System startup settings' }))
    await waitFor(() => expect(system).toHaveBeenCalledOnce())
    expect(setAutostart).not.toHaveBeenCalled()
  })

  it('keeps a cancelled system binding request distinct from an error', async () => {
    const bridge = createSettingsHarnessBridge()
    bridge.assign = async () => {
      throw { code: 'cancelled', message: 'shortcutBindCancelled' }
    }
    render(SettingsApp, { props: { bridge } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Ctrl+Shift+2' }))
    await screen.findByText('Available in registration check', { selector: 'p' })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect((await bridge.snapshot()).entries[0]?.trigger).toBeNull()
  })

  it('exposes loading failures with a retry that repeats the production load', async () => {
    const bridge = createSettingsHarnessBridge()
    const load = bridge.snapshot
    bridge.snapshot = vi.fn().mockRejectedValueOnce(new Error('service disconnected')).mockImplementation(load)
    render(SettingsApp, { props: { bridge } })
    expect((await screen.findByRole('alert')).textContent).toContain('service disconnected')
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Suggested for area capture')
  })

  it('uses the system editor for existing portal assignments', async () => {
    const bridge = createSettingsHarnessBridge()
    await bridge.assign('capture-area', 'CTRL+SHIFT+2')
    const original = bridge.snapshot
    bridge.snapshot = async () => ({ ...await original(), backend: 'portal', canConfigure: true })
    const system = vi.spyOn(bridge, 'systemSettings')
    const assign = vi.spyOn(bridge, 'assign')
    render(SettingsApp, { props: { bridge } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Change in system…: Capture area' }))
    await waitFor(() => expect(system).toHaveBeenCalledOnce())
    expect(assign).not.toHaveBeenCalled()
  })

  it('asks for launch at login with a checked choice and writes only on confirmation', async () => {
    const bridge = createSettingsHarnessBridge()
    const setAutostart = vi.spyOn(bridge, 'setAutostart')
    render(SettingsApp, { props: { bridge, firstRun: true } })
    const checkbox = await screen.findByRole('checkbox')
    expect((checkbox as HTMLInputElement).checked).toBe(true)
    expect(setAutostart).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(setAutostart).toHaveBeenCalledWith(true))
    await screen.findByText('Suggested for area capture')
  })

  it('cancels initial setup without enabling autostart', async () => {
    const bridge = createSettingsHarnessBridge()
    const setAutostart = vi.spyOn(bridge, 'setAutostart')
    const close = vi.spyOn(bridge, 'close')
    render(SettingsApp, { props: { bridge, firstRun: true } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(setAutostart).not.toHaveBeenCalled()
  })

  it('does not repeat the installer choice and preserves the active shortcut on failure', async () => {
    const bridge = createSettingsHarnessBridge()
    await bridge.setAutostart(false)
    await bridge.assign('capture-area', 'CTRL+SHIFT+2')
    const assign = vi.spyOn(bridge, 'assign')
    render(SettingsApp, { props: { bridge, firstRun: true } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Change shortcut: Capture area' }))
    await screen.findByText('Press the keys together')
    await fireEvent.keyDown(window, { key: '3', code: 'Digit3', ctrlKey: true, shiftKey: true })
    await screen.findByText('Already in use')
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    expect(assign).not.toHaveBeenCalled()
    expect((await bridge.snapshot()).entries[0]?.trigger).toBe('CTRL+SHIFT+2')
  })

  it('records a combination, applies it, and restores processing after blur', async () => {
    const bridge = createSettingsHarnessBridge()
    const recording = vi.spyOn(bridge, 'recording')
    render(SettingsApp, { props: { bridge } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Assign shortcut: Capture area' }))
    await screen.findByText('Press the keys together')
    await fireEvent.keyDown(window, { key: '2', code: 'Digit2', ctrlKey: true, shiftKey: true })
    await screen.findByText('Available in registration check', { selector: 'p' })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('Assigned')).toBeTruthy())
    expect((await bridge.snapshot()).entries[0]?.trigger).toBe('CTRL+SHIFT+2')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change shortcut: Capture area' }).hasAttribute('disabled')).toBe(false))
    await fireEvent.click(screen.getByRole('button', { name: 'Change shortcut: Capture area' }))
    await screen.findByText('Press the keys together')
    await fireEvent.blur(window)
    await waitFor(() => expect(recording).toHaveBeenLastCalledWith(false))
  })

  it('shows storage failures without closing or discarding the draft', async () => {
    const bridge = createSettingsHarnessBridge()
    bridge.assign = async () => {
      throw new Error('disk full')
    }
    render(SettingsApp, { props: { bridge } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Ctrl+Shift+2' }))
    await screen.findByText('Available in registration check', { selector: 'p' })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('disk full')
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })
})

describe('global shortcut recording', () => {
  it('uses physical codes for RU/EN and ignores IME, AltGr, repeat and reserved keys', () => {
    expect(recordTrigger(new KeyboardEvent('keydown', { key: 'ф', code: 'KeyA', ctrlKey: true }))).toBe('CTRL+A')
    expect(recordTrigger(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, repeat: true }))).toBeUndefined()
    expect(recordTrigger(new KeyboardEvent('keydown', { code: 'F12', ctrlKey: true }))).toBeUndefined()
    expect(recordTrigger(new KeyboardEvent('keydown', { code: 'KeyA', ctrlKey: true, isComposing: true }))).toBeUndefined()
    const altGr = new KeyboardEvent('keydown', { code: 'KeyA', ctrlKey: true, altKey: true })
    vi.spyOn(altGr, 'getModifierState').mockReturnValue(true)
    expect(recordTrigger(altGr)).toBeUndefined()
  })
})
