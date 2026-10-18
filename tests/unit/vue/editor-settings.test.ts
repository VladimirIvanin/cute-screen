import {
  fireEvent,
  render,
  screen,
} from '@testing-library/vue'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createEditorShellPinia } from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import type { EditorShellProps } from '../../../packages/editor-vue/src/shell/contracts'
import { UI_PREFERENCES_STORAGE_KEY } from '../../../packages/editor-vue/src/shell/preferences'

function mount(props: EditorShellProps = {}) {
  return render(EditorShell, {
    props,
    global: { plugins: [createEditorShellPinia()] },
  })
}

async function open() {
  const trigger = screen.getByRole('button', { name: 'Settings' })
  await fireEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  return trigger
}

beforeEach(() => window.localStorage.clear())

describe('editor settings', () => {
  it('keeps live theme and locale choices open and restores them after remount', async () => {
    const view = mount()
    await open()
    await fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    await fireEvent.click(screen.getByRole('radio', { name: 'Русский' }))
    expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Русский' })).toBeChecked()
    expect(JSON.parse(window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      theme: 'dark', locale: 'ru',
    })
    view.unmount()
    mount()
    await fireEvent.click(await screen.findByRole('button', { name: 'Настройки' }))
    expect(screen.getByRole('radio', { name: 'Тёмная' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Русский' })).toBeChecked()
  })

  it('disables unavailable app and image actions while keeping preferences available', async () => {
    mount()
    await open()
    expect(screen.getByRole('button', { name: 'Flip horizontally' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Flip vertically' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Application settings' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Application settings' })).toHaveAccessibleDescription('Available in the desktop app.')
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeEnabled()
  })

  it('closes with Escape and returns focus to the settings trigger', async () => {
    mount()
    const trigger = await open()
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('blocks duplicate native opens, closes on success and allows another open', async () => {
    let finish: () => void = () => undefined
    const openSettings = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    mount({ openSettings })
    await open()
    await fireEvent.click(screen.getByRole('button', { name: 'Application settings' }))
    const pending = screen.getByRole('button', { name: 'Opening settings…' })
    expect(pending).toBeDisabled()
    await fireEvent.click(pending)
    expect(openSettings).toHaveBeenCalledTimes(1)
    finish()
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await open()
    expect(screen.getByRole('button', { name: 'Application settings' })).toBeEnabled()
  })

  it('dismisses with Escape before the opening animation transfers focus', async () => {
    mount()
    const trigger = await open()
    await fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('shows native rejection details and permits retry', async () => {
    const openSettings = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce({ message: 'Window creation failed' })
      .mockResolvedValueOnce(undefined)
    mount({ openSettings })
    await open()
    await fireEvent.click(screen.getByRole('button', { name: 'Application settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open settings. Window creation failed')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Application settings' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(openSettings).toHaveBeenCalledTimes(2)
  })

  it('keeps global settings out of Quick Capture', () => {
    mount({ quickMode: true })
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('lets the open settings dialog own Escape before background import feedback', async () => {
    mount({ contentImageBridge: {
      subscribeImageDrop: vi.fn().mockRejectedValue(new Error('Drop listener unavailable')),
      releaseImage: vi.fn(async () => undefined),
      readImageBytes: vi.fn(async () => new ArrayBuffer(0)),
      stageImage: vi.fn(),
      importContentImage: vi.fn(async () => ({ kind: 'cancelled' as const })),
    } })
    const feedback = await screen.findByText('File drop is unavailable. Use G to choose an image.')
    const trigger = await open()
    await fireEvent.keyDown(screen.getByRole('radio', { name: 'System' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(feedback).toBeInTheDocument()
    await fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(feedback).not.toBeInTheDocument()
  })
})
