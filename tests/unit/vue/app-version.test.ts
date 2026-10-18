import {
  fireEvent,
  render,
  screen,
} from '@testing-library/vue'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import AppVersion from '../../../apps/desktop/src/settings/AppVersion.vue'
import { strings } from '../../../apps/desktop/src/settings/labels'

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('application version', () => {
  it('shows loading until the running native app returns its version', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    let resolveVersion!: (value: string) => void
    vi.mocked(getVersion).mockReturnValue(new Promise((resolve) => {
      resolveVersion = resolve
    }))
    const view = render(AppVersion, { props: { labels: strings.en } })
    expect(screen.getByRole('status')).toHaveTextContent('Version …')
    resolveVersion('1.4.0-beta.2+local')
    await screen.findByText('Version 1.4.0-beta.2+local')
    await view.rerender({ labels: strings.ru })
    expect(screen.getByRole('status')).toHaveTextContent('Версия 1.4.0-beta.2+local')
  })

  it('recovers from a metadata failure through Retry', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(getVersion).mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValueOnce('2.0.1')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(AppVersion, { props: { labels: strings.en } })
    await screen.findByText('Version unavailable')
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Version 2.0.1')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('uses build metadata in browser preview without native IPC', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    vi.mocked(getVersion).mockClear()
    vi.stubEnv('VITE_APP_VERSION', '0.8.2')
    render(AppVersion, { props: { labels: strings.ru } })
    await screen.findByText('Версия 0.8.2')
    expect(getVersion).not.toHaveBeenCalled()
  })
})
