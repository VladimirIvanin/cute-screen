import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import WindowCaptureRecovery from '../../../apps/desktop/src/WindowCaptureRecovery.vue'

const native = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: { outcome: string } }) => void>(),
  request: vi.fn().mockResolvedValue({ outcome: 'cancelled' }),
  stop: vi.fn(),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, listener: (event: { payload: { outcome: string } }) => void) => {
    native.listeners.set(name, listener)
    return native.stop
  }),
}))
vi.mock('../../../apps/desktop/src/desktop-bridge', () => ({
  tauriDesktopBridge: { captureRequest: native.request, openScreenRecordingSettings: vi.fn() },
}))

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  native.listeners.clear()
  native.request.mockClear()
})

async function mount(locale: 'en' | 'ru' = 'en') {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
  const pinia = createEditorShellPinia()
  const store = useEditorShellStore(pinia)
  store.preferences = { ...store.preferences, locale }
  const view = render(WindowCaptureRecovery, { global: { plugins: [pinia] } })
  await waitFor(() => expect(native.listeners.has('cute-screen:window-capture-outcome')).toBe(true))
  return { view, receive: (outcome: string) => native.listeners.get('cute-screen:window-capture-outcome')!({ payload: { outcome } }) }
}

describe('window capture recovery', () => {
  it('offers explicit area capture when the system cannot isolate a window', async () => {
    const { receive } = await mount()
    receive('unavailable')
    expect(await screen.findByRole('button', { name: 'Choose window again' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Capture an area' })).toHaveFocus())
    await fireEvent.click(screen.getByRole('button', { name: 'Capture an area' }))
    expect(native.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'area' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('focuses retry for an invalidated window and restores focus on Escape', async () => {
    const previous = document.createElement('button')
    document.body.append(previous)
    previous.focus()
    const { receive } = await mount('ru')
    receive('invalidTarget')
    const retry = await screen.findByRole('button', { name: 'Выбрать окно снова' })
    await waitFor(() => expect(retry).toHaveFocus())
    await fireEvent.keyDown(retry, { key: 'Escape' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(previous).toHaveFocus()
    previous.remove()
  })

  it('keeps cancellation quiet and releases the native listener', async () => {
    const { receive, view } = await mount()
    receive('cancelled')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    view.unmount()
    expect(native.stop).toHaveBeenCalled()
  })
})
