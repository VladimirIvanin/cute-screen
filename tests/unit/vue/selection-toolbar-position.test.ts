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
  it.each(['cs-context-toolbar', 'cs-filmstrip', 'cs-zoom-controls'])('clears lower system chrome: %s', async (chrome) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.dataset.systemChrome ? new DOMRect(100, 620, 700, 42) : new DOMRect(0, 0, 1024, 768)
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(250)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(42)
    const document = {
      ...fixture,
      canvas: { width: 1024, height: 768 },
      layers: [{
        ...fixture.layers[0]!,
        localBounds: { x: 400, y: 690, width: 200, height: 30 },
        transform: { translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      }],
    }
    const view = render({
      render: () => h('div', { class: 'cs-workbench' }, [
        h('div', { class: 'cs-viewport' }, [h('div', { class: 'cs-canvas-surface' })]),
        h('div', { class: chrome, 'data-system-chrome': 'true' }),
        h(SelectionFormattingToolbar, {
          document,
          schema: { icon: 'arrow', title: 'Arrow', hint: '', controls: [] },
          selectedIds: ['shape'],
          layersOpen: false,
          zoom: 100,
          locale: 'en',
          recentColors: [],
        }),
      ]),
    })
    const toolbar = view.container.querySelector<HTMLElement>('.cs-selection-floating-toolbar')!
    await waitFor(() => expect(Number.parseFloat(toolbar.style.top) + 42).toBeLessThanOrEqual(612))
  })
  it.each([false, true])('clears the sibling topbar, including small selections (%s)', async (small) => {
    let headerBottom = 54
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('cs-topbar')) return new DOMRect(14, 12, 996, headerBottom - 12)
      if (this.classList.contains('cs-canvas-surface')) return new DOMRect(0, 0, 1024, 768)
      return new DOMRect(0, 0, 1024, 768)
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(250)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(42)
    const document = {
      ...fixture,
      canvas: { width: 1024, height: 768 },
      layers: [{
        ...fixture.layers[0]!,
        localBounds: { x: 400, y: 78, width: small ? 10 : 200, height: small ? 10 : 300 },
        transform: { translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      }],
    }
    const view = render({
      render: () => h('div', { class: 'cs-editor-shell' }, [
        h('header', { class: 'cs-topbar' }),
        h('div', { class: 'cs-workbench' }, [
          h('div', { class: 'cs-viewport' }, [h('div', { class: 'cs-canvas-surface' })]),
          h(SelectionFormattingToolbar, {
            document,
            schema: { icon: 'arrow', title: 'Arrow', hint: '', controls: [] },
            moveEnabled: true,
            selectedIds: ['shape'],
            layersOpen: false,
            zoom: 100,
            locale: 'en',
            recentColors: [],
          }),
        ]),
      ]),
    })
    const toolbar = view.container.querySelector<HTMLElement>('.cs-selection-floating-toolbar')!
    await waitFor(() => expect(Number.parseFloat(toolbar.style.top)).toBeGreaterThanOrEqual(headerBottom + 8))
    headerBottom = 100
    window.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(Number.parseFloat(toolbar.style.top)).toBeGreaterThanOrEqual(headerBottom + 8))
  })
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
