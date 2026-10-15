import {
  render,
  waitFor,
} from '@testing-library/vue'
import {
  h,
  shallowRef,
} from 'vue'
import type { ContextToolbarSchema } from '../../../packages/editor-vue/src/shell/types'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import SelectionFormattingToolbar from '../../../packages/editor-vue/src/shell/components/SelectionFormattingToolbar.vue'
import { document as fixture } from './canvas-viewport-test-kit'

afterEach(() => vi.restoreAllMocks())

describe('selection toolbar coordinate space', () => {
  it.each([
    { quickMode: true, left: '415px', top: '298px' },
    { quickMode: false, left: '455px', top: '538px' },
  ])('anchors to the rendered canvas with a non-origin crop (Quick $quickMode)', async ({ quickMode, left, top }) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.classList.contains('cs-canvas-surface')
        ? { left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 }
        : { left: 0, top: 0, right: 1200, bottom: 900, width: 1200, height: 900 }) as DOMRect
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(250)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(42)
    const document = {
      ...fixture,
      canvas: { width: 400, height: 300 },
      crop: { x: 100, y: 60, width: 200, height: 100 },
      layers: [{
        ...fixture.layers[0]!,
        localBounds: { x: 200, y: 150, width: 40, height: 20 },
        transform: { translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      }],
    }
    const schema = shallowRef<ContextToolbarSchema | undefined>({ icon: 'arrow', title: 'Arrow', hint: '', controls: [] })
    const view = render({
      render: () => h('div', { class: 'cs-workbench' }, [
        h('div', { class: 'cs-viewport' }, [h('div', { class: 'cs-canvas-surface' })]),
        h(SelectionFormattingToolbar, {
          document,
          schema: schema.value,
          quickMode,
          selectedIds: ['shape'],
          layersOpen: false,
          // The visible canvas is authoritative even before the stored fit zoom settles.
          zoom: 10,
          locale: 'en',
          recentColors: [],
        }),
      ]),
    })
    await waitFor(() => {
      const toolbar = view.container.querySelector<HTMLElement>('.cs-selection-floating-toolbar')!
      expect(toolbar.style.left).toBe(left)
      expect(toolbar.style.top).toBe(top)
      expect(toolbar.dataset.placement).toBe('above')
    })
    const bounds = view.container.querySelector<HTMLElement>('[data-preview-bounds]')!.dataset.previewBounds
    schema.value = undefined
    await waitFor(() => {
      const toolbar = view.container.querySelector<HTMLElement>('[data-preview-bounds]')!
      expect(toolbar.dataset.previewBounds).toBe(bounds)
      expect(toolbar.style.visibility).toBe('hidden')
      expect(toolbar.querySelector('.cs-context-toolbar')).toBeNull()
    })
  })
})
