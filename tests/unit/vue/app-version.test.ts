import {
  fireEvent,
  render,
  screen,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import AppVersion from '../../../apps/desktop/src/settings/AppVersion.vue'
import { strings } from '../../../apps/desktop/src/settings/labels'

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn().mockResolvedValue('1.2.3') }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }))

describe('update link', () => {
  it('blocks repeated activation while opening and allows retry after failure', async () => {
    let reject!: (reason: Error) => void
    vi.mocked(invoke).mockReturnValueOnce(new Promise((_, fail) => {
      reject = fail
    }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(AppVersion, { props: { labels: strings.en } })
    await screen.findByText('Version 1.2.3')
    const button = screen.getByRole('button', { name: 'Check for updates' })
    await fireEvent.click(button)
    expect(button).toBeDisabled()
    reject(new Error('unavailable'))
    await screen.findByRole('alert')
    expect(button).toBeEnabled()
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    await fireEvent.click(button)
    expect(invoke).toHaveBeenCalledWith('open_update_page')
  })
})
