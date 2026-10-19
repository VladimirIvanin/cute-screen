import {
  cleanup,
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
import CaptureSourceSettings from '../../../apps/desktop/src/settings/CaptureSourceSettings.vue'
import type { LinuxCaptureMethods } from '../../../apps/desktop/src/generated/desktop-ipc'

const initial: LinuxCaptureMethods = { selected: 'auto', resolved: 'gnomeScreenshot', available: ['auto', 'portal', 'gnomeScreenshot'] }
afterEach(cleanup)

describe('Wayland screenshot method settings', () => {
  it('hides on other platforms and retries failed capability loading', async () => {
    const snapshot = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue(null)
    render(CaptureSourceSettings, { props: { locale: 'en', bridge: { snapshot, save: vi.fn() } } })
    await screen.findByRole('alert')
    await fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument())
  })

  it('reports the active method, disables unavailable helpers and cancels without saving', async () => {
    const bridge = { snapshot: vi.fn().mockResolvedValue(initial), save: vi.fn() }
    render(CaptureSourceSettings, { props: { locale: 'ru', bridge } })
    const select = await screen.findByRole('combobox', { name: 'Способ захвата' })
    select.focus()
    expect(select).toHaveFocus()
    expect(screen.getByRole('option', { name: /wlroots/u })).toBeDisabled()
    expect(screen.queryByText(/ScreenCast/u)).not.toBeInTheDocument()
    await fireEvent.update(select, 'portal')
    await fireEvent.click(screen.getByRole('button', { name: 'Отменить изменение' }))
    expect(select).toHaveValue('auto')
    expect(bridge.save).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled()
  })

  it('blocks duplicate saves and preserves the draft after a busy error', async () => {
    let reject: (error: unknown) => void = () => undefined
    const save = vi.fn().mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => {
      reject = rejectPromise
    }))
      .mockResolvedValue({ ...initial, selected: 'portal', resolved: 'portal' })
    render(CaptureSourceSettings, { props: { locale: 'en', bridge: { snapshot: vi.fn().mockResolvedValue(initial), save } } })
    const select = await screen.findByRole('combobox', { name: 'Capture method' })
    await fireEvent.update(select, 'portal')
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(select).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(save).toHaveBeenCalledOnce()
    reject({ code: 'busy' })
    await screen.findByText('Finish the current capture before changing the method.')
    expect(select).toHaveValue('portal')
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await screen.findByText('Capture method saved.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('keeps an unavailable saved choice visible and permits recovery to automatic', async () => {
    const bridge = { snapshot: vi.fn().mockResolvedValue({ ...initial, selected: 'grim', resolved: null }), save: vi.fn().mockResolvedValue(initial) }
    render(CaptureSourceSettings, { props: { locale: 'en', bridge } })
    const select = await screen.findByRole('combobox', { name: 'Capture method' })
    expect(select).toHaveValue('grim')
    await screen.findByText(/selected method is unavailable/u)
    await fireEvent.update(select, 'auto')
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(bridge.save).toHaveBeenCalledWith('auto')
    await screen.findByText('Capture method saved.')
  })
})
