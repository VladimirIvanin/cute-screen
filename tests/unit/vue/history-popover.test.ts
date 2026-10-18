import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/vue'
import {
  defineComponent,
} from 'vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import HistoryPopover from '../../../apps/desktop/src/history/HistoryPopover.vue'
import { createHistoryHarnessBridge } from '../../../apps/desktop/src/history/browser-harness'
import type { HistoryRequest } from '../../../apps/desktop/src/generated/desktop-ipc'

function mountHistory(failCommit = false) {
  const bridge = createHistoryHarnessBridge()
  const original = bridge.request
  bridge.request = vi.fn(async (request: HistoryRequest) => {
    if (failCommit && request.kind === 'commit') throw new Error('Preview expired; review deletion again')
    return original(request)
  })
  const openCapture = vi.fn(async () => true)
  const view = render(HistoryPopover, {
    props: { bridge, activeId: 'capture-0', locale: 'en', prepare: async () => undefined, openCapture },
    global: {
      stubs: {
        HistoryThumbnail: true,
        EditorPopover: defineComponent({
          props: ['show'],
          template: '<div><slot name="trigger" /><slot v-if="show" /></div>',
        }),
      },
    },
  })
  return { bridge, view, openCapture }
}

describe('history cleanup confirmation', () => {
  it('reviews every page, preserves active/protected, and cancels without mutation', async () => {
    const { bridge, view, openCapture } = mountHistory()
    await fireEvent.click(screen.getByRole('button', { name: 'History' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear history' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Clear history' }))
    const confirmation = await screen.findByRole('alertdialog')
    expect(confirmation).toHaveTextContent('Captures and annotations to delete: 998.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(bridge.request).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'preview',
      captureIds: expect.arrayContaining(['capture-999']),
    }))
    const calls = vi.mocked(bridge.request).mock.calls.map(([request]) => request)
    const preview = calls.find((request) => request.kind === 'preview')
    if (preview?.kind !== 'preview') throw new Error('missing preview')
    expect(preview.captureIds).not.toContain('capture-0')
    expect(preview.captureIds).not.toContain('capture-1')
    await fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Clear history' })).toHaveFocus()
    expect(calls.some((request) => request.kind === 'commit')).toBe(false)
    expect(openCapture).not.toHaveBeenCalled()
    view.unmount()
  })

  it('closes on Escape while protection is pending without restoring focus to a hidden capture', async () => {
    const { bridge, view } = mountHistory()
    const original = bridge.request
    let complete!: () => void
    const pending = new Promise<void>((resolve) => {
      complete = resolve
    })
    bridge.request = async (request) => {
      if (request.kind === 'protect') await pending
      return original(request)
    }
    const trigger = screen.getByRole('button', { name: 'History' })
    await fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear history' })).toBeEnabled())
    await fireEvent.click(screen.getAllByRole('button', { name: 'Protect from cleanup' })[0]!)
    await fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    complete()
    await pending
    await waitFor(() => expect(trigger).toHaveFocus())
    view.unmount()
  })

  it('commits reviewed deletion and disables an empty cleanup plan', async () => {
    const { view } = mountHistory()
    await fireEvent.click(screen.getByRole('button', { name: 'History' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear history' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Clear history' }))
    await screen.findByRole('alertdialog')
    await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear history' }))
    await screen.findByText('Captures deleted: 998')
    await waitFor(() => expect(view.container.querySelectorAll('.cs-history-card')).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear history' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Clear history' }))
    await screen.findByRole('alertdialog')
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear history' })).toBeDisabled()
    view.unmount()
  })

  it('requires a new review after commit failure and keeps captures visible', async () => {
    const { bridge, view } = mountHistory(true)
    await fireEvent.click(screen.getByRole('button', { name: 'History' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear history' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Clear history' }))
    await screen.findByRole('alertdialog')
    await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear history' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Preview expired'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(view.container.querySelectorAll('.cs-history-card')).toHaveLength(10)
    await fireEvent.click(screen.getByRole('button', { name: 'Clear history' }))
    await screen.findByRole('alertdialog')
    expect(vi.mocked(bridge.request).mock.calls.filter(([request]) => request.kind === 'preview')).toHaveLength(2)
    view.unmount()
  })
})
