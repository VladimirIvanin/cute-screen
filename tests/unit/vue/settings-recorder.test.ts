import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/vue'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import SettingsApp from '../../../apps/desktop/src/SettingsApp.vue'
import { createEditorShellPinia } from '@cute-screen/editor-vue'
import { createSettingsHarnessBridge } from '../../../apps/desktop/src/settings/browser-harness'
import type { ActivationSettingsBridge } from '../../../apps/desktop/src/settings/contracts'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/?settings=shortcuts')
})

async function mount(bridge = createSettingsHarnessBridge()) {
  const view = render(SettingsApp, { props: { bridge }, global: { plugins: [createEditorShellPinia()] } })
  await screen.findByRole('heading', { name: 'Keyboard shortcuts' })
  return { bridge, ...view }
}

async function start(name = 'Assign shortcut: Capture area') {
  await fireEvent.click(await screen.findByRole('button', { name }))
  await screen.findByText('Press the keys together')
}

async function chord(key = '4') {
  await fireEvent.keyDown(window, { key, code: `Digit${key}`, ctrlKey: true, shiftKey: true })
}

describe('inline shortcut lifecycle', () => {
  it('explains invalid input and permits recording again after Tab and blur', async () => {
    const { bridge } = await mount()
    const recording = vi.spyOn(bridge, 'recording')
    await start()
    await fireEvent.keyDown(window, { key: 'x', code: 'KeyX' })
    await screen.findByText(/Use Ctrl, Alt or Command/)
    await fireEvent.keyDown(window, { key: 'Tab', code: 'Tab' })
    await screen.findByText('Recording paused')
    expect(recording).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Record again' }))
    await screen.findByText('Press the keys together')
    await fireEvent.blur(window)
    await screen.findByText('Recording paused')
    await fireEvent.click(screen.getByRole('button', { name: 'Record again' }))
    await screen.findByText('Press the keys together')
    await chord()
    await screen.findByText('Available in registration check')
  })

  it('does not resume a delayed recorder lease after the window loses focus', async () => {
    const bridge = createSettingsHarnessBridge()
    let enable: () => void = () => {
      throw new Error('Recorder did not start')
    }
    bridge.recording = async (enabled) => {
      if (enabled) await new Promise<void>((resolve) => {
        enable = resolve
      })
    }
    const recording = vi.spyOn(bridge, 'recording')
    await mount(bridge)
    await fireEvent.click(screen.getByRole('button', { name: 'Assign shortcut: Capture area' }))
    await waitFor(() => expect(recording).toHaveBeenCalledWith(true))
    await fireEvent.blur(window)
    enable()
    await screen.findByText('Recording paused')
    expect(screen.queryByText('Press the keys together')).toBeNull()
  })

  it('cancels with Escape and returns focus to the initiating button', async () => {
    const { bridge } = await mount()
    const assign = vi.spyOn(bridge, 'assign')
    await start()
    await fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })
    const edit = await screen.findByRole('button', { name: 'Assign shortcut: Capture area' })
    await waitFor(() => expect(document.activeElement).toBe(edit))
    expect(assign).not.toHaveBeenCalled()
  })

  it('blocks the existing shortcut and identifies a different action using a candidate', async () => {
    const bridge = createSettingsHarnessBridge()
    await bridge.assign('capture-area', 'CTRL+SHIFT+2')
    await bridge.assign('show-editor', 'CTRL+SHIFT+4')
    await mount(bridge)
    await start('Change shortcut: Capture area')
    await chord('2')
    await screen.findByText('This shortcut is already assigned to this action.')
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Record again' }))
    await screen.findByText('Press the keys together')
    await chord('4')
    await screen.findByText('Already assigned to: Open editor')
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    expect((await bridge.snapshot()).entries[0]?.trigger).toBe('CTRL+SHIFT+2')
  })

  it('ignores a failed preflight response after another row starts recording', async () => {
    const bridge = createSettingsHarnessBridge()
    const original = bridge.probe
    let rejectProbe: (cause: Error) => void = () => {
      throw new Error('Probe did not start')
    }
    bridge.probe = (value) => value === 'CTRL+SHIFT+4'
      ? new Promise((_, reject) => {
          rejectProbe = reject
        })
      : original(value)
    await mount(bridge)
    await start()
    await chord()
    await screen.findByText('Checking shortcut…')
    await start('Assign shortcut: Capture screen')
    rejectProbe(new Error('obsolete failure'))
    await chord('5')
    await screen.findByText('Available in registration check')
    expect(screen.queryByText('obsolete failure')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
  })

  it('retains a failed draft and retries preflight by recording again', async () => {
    const bridge = createSettingsHarnessBridge()
    const original = bridge.probe
    let failed = false
    bridge.probe = async (value) => {
      if (value === 'CTRL+SHIFT+4' && !failed) {
        failed = true
        throw new Error('Check disconnected')
      }
      return original(value)
    }
    await mount(bridge)
    await start()
    await chord()
    expect((await screen.findByRole('alert')).textContent).toContain('Check disconnected')
    expect(screen.getByText('Ctrl+Shift+4', { selector: 'kbd' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Record again' }))
    await screen.findByText('Press the keys together')
    await chord()
    await screen.findByText('Available in registration check')
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Assigned')
  })

  it('places save errors next to the draft and preserves the previous binding', async () => {
    const bridge = createSettingsHarnessBridge()
    await bridge.assign('capture-area', 'CTRL+SHIFT+2')
    bridge.assign = async () => {
      throw new Error('disk full')
    }
    const { container } = await mount(bridge)
    await start('Change shortcut: Capture area')
    await chord()
    await screen.findByText('Available in registration check')
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const row = within(container.querySelector('[data-action="capture-area"]') as HTMLElement)
    expect((await row.findByRole('alert')).textContent).toContain('disk full')
    expect(row.getByText('Ctrl+Shift+4', { selector: 'kbd' })).toBeTruthy()
    expect((await bridge.snapshot()).entries[0]?.trigger).toBe('CTRL+SHIFT+2')
  })
})

describe('shortcut actions and system-owned bindings', () => {
  it('opens the ellipsis menu with the keyboard, tests in the row and removes via the menu', async () => {
    const bridge = createSettingsHarnessBridge()
    await bridge.assign('capture-area', 'CTRL+SHIFT+2')
    let tested: Parameters<ActivationSettingsBridge['listen']>[0] = () => undefined
    bridge.listen = async (callback) => {
      tested = callback
      return () => undefined
    }
    const test = vi.spyOn(bridge, 'test')
    const { container } = await mount(bridge)
    expect(screen.queryByRole('button', { name: 'Actions: Capture screen' })).toBeNull()
    const more = screen.getByRole('button', { name: 'Actions: Capture area' })
    await fireEvent.keyDown(more, { key: 'ArrowDown' })
    const check = await screen.findByRole('menuitem', { name: 'Test shortcut' })
    expect(document.activeElement).toBe(check)
    await fireEvent.keyDown(check, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Remove shortcut' }))
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(document.activeElement).toBe(more)
    await fireEvent.click(more)
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Test shortcut' }))
    await waitFor(() => expect(test).toHaveBeenCalledWith('capture-area'))
    const row = within(container.querySelector('[data-action="capture-area"]') as HTMLElement)
    await row.findByText(/Switch to another app/)
    tested('capture-area')
    await row.findByText('Shortcut received')
    await waitFor(() => expect(more.hasAttribute('disabled')).toBe(false))
    await fireEvent.click(more)
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove shortcut' }))
    await waitFor(async () => expect((await bridge.snapshot()).entries[0]?.trigger).toBeNull())
  })

  it('saves a GNOME shortcut without asking for another key press', async () => {
    const bridge = createSettingsHarnessBridge()
    await bridge.assign('capture-area', 'CTRL+SHIFT+2')
    const original = bridge.snapshot
    bridge.snapshot = async () => ({ ...await original(), backend: 'gnome' })
    const { container } = await mount(bridge)
    await start('Change shortcut: Capture area')
    await chord()
    await screen.findByText('Available in registration check')
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const row = within(container.querySelector('[data-action="capture-area"]') as HTMLElement)
    await row.findByText('Ctrl+Shift+4', { selector: 'kbd' })
    expect(row.queryByText(/Press the new shortcut within 60 seconds/)).toBeNull()
    expect(row.queryByText('Ctrl+Shift+2', { selector: 'kbd' })).toBeNull()
    expect(row.getByText('Assigned')).toBeTruthy()
    const saved = await bridge.snapshot()
    expect(saved.entries[0]?.trigger).toBe('CTRL+SHIFT+4')
    expect(saved.pendingAction).toBeNull()
  })

  it('keeps verification timeout feedback in the tested action row', async () => {
    const bridge = createSettingsHarnessBridge()
    await bridge.assign('capture-area', 'CTRL+SHIFT+2')
    const { container } = await mount(bridge)
    vi.useFakeTimers()
    try {
      await fireEvent.click(screen.getByRole('button', { name: 'Actions: Capture area' }))
      await fireEvent.click(screen.getByRole('menuitem', { name: 'Test shortcut' }))
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(30_000)
      const row = within(container.querySelector('[data-action="capture-area"]') as HTMLElement)
      expect(row.getByText(/Verification did not complete/)).toBeTruthy()
      expect(screen.queryByText(/Switch to another app/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('labels the initial portal assignment as a continuation in the system dialog', async () => {
    const bridge = createSettingsHarnessBridge()
    const original = bridge.snapshot
    bridge.snapshot = async () => ({ ...await original(), backend: 'portal' })
    await mount(bridge)
    await start()
    await chord()
    await screen.findByText('Available in registration check')
    expect(screen.getByRole('button', { name: 'Continue in system' }).hasAttribute('disabled')).toBe(false)
  })

  it('shows manual commands without offering an in-app recorder', async () => {
    const bridge = createSettingsHarnessBridge()
    const original = bridge.snapshot
    bridge.snapshot = async () => ({ ...await original(), backend: 'manual' })
    await mount(bridge)
    expect(screen.getByRole('button', { name: 'Assign shortcut: Capture area' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Actions: Capture area' })).toBeNull()
    expect(screen.getAllByText('CLI')).toHaveLength(6)
  })
})
