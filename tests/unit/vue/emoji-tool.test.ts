import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  render,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/vue'
import { markRaw } from 'vue'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  arrowDocument,
  arrowSession,
} from './app-test-kit'
import {
  canvasContext,
  prepareScene,
} from './m08-precision-test-kit'
import { parseEmojiPreferences } from '../../../packages/editor-vue/src/shell/workspace/emoji-controller'
import * as emojiResources from '../../../packages/editor-vue/src/emoji/resources'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, writable: true, value: vi.fn().mockResolvedValue(undefined) })
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(128)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(128)
})
afterEach(() => vi.restoreAllMocks())
function mount(
  quickMode = false,
  readOnlyDocument = false,
) {
  const session = arrowSession({ ...arrowDocument(), layers: [] })
  const pinia = createEditorShellPinia()
  const view = render(EditorShell, {
    props: { documentSession: markRaw(session), quickMode, readOnlyDocument }, global: { plugins: [pinia] },
  })
  const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
  prepareScene(scene)
  return { ...view, session, scene, store: useEditorShellStore(pinia) }
}
describe('mounted emoji tool', () => {
  it('shows loading and cancels a stale decoded resource without a command', async () => {
    let resolve: (image: HTMLImageElement) => void = () => undefined
    const pending = new Promise<HTMLImageElement>((done) => {
      resolve = done
    })
    vi.spyOn(emojiResources, 'loadEmoji').mockReturnValue(pending)
    const app = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Emoji' }))
    expect(screen.getByRole('button', { name: 'Fire' })).toBeDisabled()
    await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 1, clientX: 50, clientY: 40 })
    await fireEvent.keyDown(window, { key: 'Escape' })
    resolve(new Image())
    await waitFor(() => expect(app.store.activeToolId).toBe('select'))
    expect(app.session.snapshot.core.document.layers).toHaveLength(0)
    app.unmount()
    app.session.dispose()
  })
  it('reports decode failure and retries before allowing insertion', async () => {
    const loader = vi.spyOn(emojiResources, 'loadEmoji').mockRejectedValue(new Error('decode failed'))
    const app = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Emoji' }))
    await screen.findByText('Could not load the emoji. Please retry.')
    expect(app.session.snapshot.core.document.layers).toHaveLength(0)
    loader.mockResolvedValue(new Image())
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fire' })).toBeEnabled())
    app.unmount()
    app.session.dispose()
  })
  it('places a bundled layer, replaces it without changing defaults, and undoes both edits', async () => {
    const app = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Emoji' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fire' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fire' })).toBeEnabled())
    await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 1, clientX: 50, clientY: 40 })
    await waitFor(() => expect(app.session.snapshot.core.document.layers).toHaveLength(1))
    expect(app.store.activeToolId).toBe('select')
    expect(app.session.snapshot.core.document.layers[0]?.payload).toMatchObject({ grapheme: '🔥' })
    await waitFor(() => expect(app.container.querySelector('.cs-selection-preview-host button[data-emoji-id="26a1"]')).not.toBeNull())
    await fireEvent.click(app.container.querySelector('.cs-selection-preview-host button[data-emoji-id="26a1"]')!)
    await waitFor(() => expect(app.session.snapshot.core.document.layers[0]?.payload).toMatchObject({ grapheme: '⚡' }))
    expect(JSON.parse(localStorage.getItem('cute-screen.emoji.v1')!).assetId).toBe('1f525')
    app.session.undo()
    expect(app.session.snapshot.core.document.layers[0]?.payload).toMatchObject({ grapheme: '🔥' })
    app.session.undo()
    expect(app.session.snapshot.core.document.layers).toHaveLength(0)
    app.session.redo()
    expect(app.session.snapshot.core.document.layers[0]?.kind).toBe('emoji')
    app.unmount()
    app.session.dispose()
  })
  it('searches the palette and restores focus on Escape without creating an object', async () => {
    const app = mount()
    await fireEvent.keyDown(window, { key: 'у', code: 'KeyE' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'All emoji' })).toBeEnabled())
    const trigger = screen.getByRole('button', { name: 'All emoji' })
    await fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'All emoji' })
    await fireEvent.update(within(dialog).getByRole('searchbox'), 'молния')
    expect(within(dialog).getByRole('gridcell', { name: 'High voltage' })).toBeInTheDocument()
    await fireEvent.update(within(dialog).getByRole('searchbox'), 'zzzz')
    expect(within(dialog).getByText('No emoji found')).toBeInTheDocument()
    await fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(app.store.activeToolId).toBe('emoji')
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(app.store.activeToolId).toBe('select')
    expect(app.session.snapshot.core.document.layers).toHaveLength(0)
    app.unmount()
    app.session.dispose()
  })
  it('disables creation in read-only and validates persisted defaults', async () => {
    const app = mount(false, true)
    expect(screen.getByRole('button', { name: 'Emoji' })).toBeDisabled()
    expect(parseEmojiPreferences({ assetId: 'missing', size: 999, recentIds: ['missing', '1f525', '1f525'] })).toEqual({ assetId: '1f446', size: 256, recentIds: ['1f525'] })
    app.unmount()
    app.session.dispose()
  })
})
