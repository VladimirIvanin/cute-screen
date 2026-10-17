import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import ExportFilenameSettings from '../../../apps/desktop/src/settings/ExportFilenameSettings.vue'
import type { ExportFilenameBridge } from '../../../apps/desktop/src/settings/export-filename-contracts'

function fixture() {
  const defaultPattern = '{date}_{time}_Скриншот'
  let pattern = defaultPattern
  const preview = vi.fn(async (value: string) => {
    if (value.includes(' ')) throw { code: 'invalidFilenamePattern', message: 'filenameWhitespace' }
    return `${value.replace('{date}', '2026-10-17').replace('{time}', '23-12-50')}.png`
  })
  const bridge: ExportFilenameBridge = {
    load: async () => ({ pattern, defaultPattern, preview: await preview(pattern) }),
    preview,
    save: vi.fn(async (value) => {
      const result = await preview(value)
      pattern = value
      return { pattern, defaultPattern, preview: result }
    }),
  }
  return { bridge, defaultPattern, preview }
}

describe('export filename preferences', () => {
  it('previews, saves and reloads a custom pattern without changing the persisted value during typing', async () => {
    const { bridge, defaultPattern } = fixture()
    const view = render(ExportFilenameSettings, { props: { locale: 'en', bridge } })
    const input = await screen.findByRole('textbox', { name: 'Filename pattern' })
    await waitFor(() => expect(input).toHaveValue(defaultPattern))
    await fireEvent.update(input, 'Work_{date}_{time}')
    await screen.findByText('Work_2026-10-17_23-12-50.png')
    expect((await bridge.load()).pattern).toBe(defaultPattern)
    await fireEvent.click(screen.getByRole('button', { name: 'Save filename format' }))
    await screen.findByText('Filename format saved')
    view.unmount()
    render(ExportFilenameSettings, { props: { locale: 'en', bridge } })
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Work_{date}_{time}'))
  })

  it('explains invalid names in Russian and cancels the draft with Escape', async () => {
    const { bridge, defaultPattern } = fixture()
    render(ExportFilenameSettings, { props: { locale: 'ru', bridge } })
    const input = screen.getByRole('textbox', { name: 'Шаблон имени' })
    await waitFor(() => expect(input).toBeEnabled())
    await fireEvent.update(input, '{date} {time}')
    await screen.findByText('Замените пробелы на дефисы или подчёркивания.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Сохранить формат имени' })).toBeDisabled()
    await fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue(defaultPattern)
    expect(bridge.save).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps a failed save editable and permits retry', async () => {
    const { bridge } = fixture()
    const save = bridge.save
    bridge.save = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockImplementation(save)
    render(ExportFilenameSettings, { props: { locale: 'en', bridge } })
    const input = screen.getByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())
    await fireEvent.update(input, 'Work_{date}_{time}')
    const button = screen.getByRole('button', { name: 'Save filename format' })
    await waitFor(() => expect(button).toBeEnabled())
    await fireEvent.click(button)
    await screen.findByText('Disk full')
    await fireEvent.click(button)
    await screen.findByText('Filename format saved')
  })

  it('offers a retry after a loading failure', async () => {
    const { bridge } = fixture()
    const load = bridge.load
    bridge.load = vi.fn().mockRejectedValueOnce(new Error('Disconnected')).mockImplementation(load)
    render(ExportFilenameSettings, { props: { locale: 'en', bridge } })
    await screen.findByText('Disconnected')
    expect(screen.getByRole('textbox')).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled())
  })

  it('ignores an older preview response after the draft changes', async () => {
    const { bridge } = fixture()
    let resolveOlder: (value: string) => void = () => undefined
    bridge.preview = vi.fn().mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveOlder = resolve
    })).mockResolvedValue('New_2026-10-17_23-12-50.png')
    render(ExportFilenameSettings, { props: { locale: 'en', bridge } })
    const input = screen.getByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())
    await fireEvent.update(input, 'Old_{date}_{time}')
    await waitFor(() => expect(bridge.preview).toHaveBeenCalledOnce())
    await fireEvent.update(input, 'New_{date}_{time}')
    await screen.findByText('New_2026-10-17_23-12-50.png')
    resolveOlder('Old_2026-10-17_23-12-50.png')
    await Promise.resolve()
    expect(screen.queryByText('Old_2026-10-17_23-12-50.png')).toBeNull()
  })
})
