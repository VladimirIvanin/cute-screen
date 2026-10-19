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

afterEach(cleanup)

describe('Wayland capture display settings', () => {
  it('does not offer selection for unsupported backends', async () => {
    const bridge = { available: vi.fn().mockResolvedValue(false), select: vi.fn() }
    render(CaptureSourceSettings, { props: { locale: 'ru', bridge } })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Выбрать экран' })).not.toBeInTheDocument()
  })

  it('blocks duplicate requests and distinguishes cancellation from error', async () => {
    let complete: (selected: boolean) => void = () => undefined
    const bridge = { available: vi.fn().mockResolvedValue(true), select: vi.fn(() => new Promise<boolean>((resolve) => {
      complete = resolve
    })) }
    render(CaptureSourceSettings, { props: { locale: 'ru', bridge } })
    const button = await screen.findByRole('button', { name: 'Выбрать экран' })
    await fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(bridge.select).toHaveBeenCalledOnce()
    complete(false)
    await screen.findByText('Выбор отменён. Экран не изменён.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(button).toBeEnabled()
  })

  it('keeps a retryable button and explains an active capture', async () => {
    const bridge = { available: vi.fn().mockResolvedValue(true), select: vi.fn().mockRejectedValueOnce({ code: 'busy' }).mockResolvedValue(true) }
    render(CaptureSourceSettings, { props: { locale: 'en', bridge } })
    const button = await screen.findByRole('button', { name: 'Choose display' })
    await fireEvent.click(button)
    await screen.findByText('Finish the current capture before choosing a display.')
    await fireEvent.click(button)
    await screen.findByText('Capture display selected.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
