import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  computeQuickCaptureLayout,
  presentThenWaitForStableQuickCaptureLayout,
  waitForStableQuickCaptureLayout,
} from '../../../apps/desktop/src/quick-capture-layout'
import { QuickCaptureLayoutController } from '../../../apps/desktop/src/quick-capture-layout-controller'
import {
  ref,
  shallowRef,
} from 'vue'

const base = {
  viewport: { width: 1440, height: 900 },
  scene: { left: 0, top: 0, width: 1440, height: 900 },
  source: { width: 1440, height: 900 },
  actionSize: { width: 124, height: 220 },
  toolSize: { width: 620, height: 96 },
}

describe('quick capture overlay layout', () => {
  it('rejects the previous fitted scene after the fullscreen viewport has resized', () => {
    const scene = document.createElement('canvas')
    const width = window.innerWidth
    const height = window.innerHeight
    scene.getBoundingClientRect = () => new DOMRect(8, 4, width * 0.99, height * 0.99)
    type Ports = ConstructorParameters<typeof QuickCaptureLayoutController>[0]
    const controller = new QuickCaptureLayoutController({
      hosts: shallowRef({ scene } as NonNullable<Ports['hosts']['value']>),
      session: shallowRef({ snapshot: { core: { document: { canvas: { width, height } } } } } as NonNullable<Ports['session']['value']>),
      currentCrop: ref({ x: 0, y: 0, width, height }),
    })
    expect(controller.selectionLayout()).toBeUndefined()
    scene.getBoundingClientRect = () => new DOMRect(0, 0, width, height)
    expect(controller.selectionLayout()).toBeDefined()
  })
  it('measures the selection scene without requiring the hidden action chrome', () => {
    const scene = document.createElement('canvas')
    scene.width = 1920
    scene.height = 1080
    scene.getBoundingClientRect = () => new DOMRect(0, 0, 1920, 1080)
    const controller = new QuickCaptureLayoutController({
      hosts: shallowRef({ scene } as NonNullable<ConstructorParameters<typeof QuickCaptureLayoutController>[0]['hosts']['value']>),
      session: shallowRef(undefined),
      currentCrop: ref({ x: 0, y: 0, width: 1920, height: 1080 }),
    })
    const first = controller.selectionLayout()
    expect(first).toBeDefined()
    scene.getBoundingClientRect = () => new DOMRect(8, 4, 1900, 1069)
    expect(controller.selectionLayout()).not.toBe(first)
    scene.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
    expect(controller.selectionLayout()).toBeUndefined()
  })
  it('keeps configure and selection panels outside the bottom chrome measurements', () => {
    const root = document.createElement('div')
    root.className = 'cs-quick-capture'
    root.innerHTML = '<div class="cs-quick-actions"></div><div class="cs-quick-toolrail-group"></div><div class="cs-tool-configure-popover-host"><div class="cs-context-toolbar"></div></div>'
    document.body.append(root)
    const scene = document.createElement('canvas')
    scene.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 700)
    for (const element of root.querySelectorAll<HTMLElement>('div')) {
      Object.defineProperties(element, {
        offsetWidth: { value: 200 },
        offsetHeight: { value: 40 },
      })
    }
    const popup = root.querySelector<HTMLElement>('.cs-context-toolbar')!
    try {
      const controller = new QuickCaptureLayoutController({
        hosts: shallowRef({ scene } as NonNullable<ConstructorParameters<typeof QuickCaptureLayoutController>[0]['hosts']['value']>),
        session: shallowRef(undefined),
        currentCrop: ref({ x: 0, y: 0, width: 1, height: 1 }),
      })
      controller.update()
      expect(popup.style.top).toBe('')
      expect(popup.style.transform).toBe('')
    } finally {
      root.remove()
    }
  })
  it.each([
    { x: 200, y: 180, width: 700, height: 300 },
    { x: 100, y: 650, width: 800, height: 240 },
    { x: 0, y: 0, width: 500, height: 200 },
    { x: 900, y: 0, width: 500, height: 200 },
  ])('places the entire settings group outside crop %o', (crop) => {
    const settingsSize = { width: 680, height: 46 }
    const toolSize = { width: 700, height: 46 }
    const layout = computeQuickCaptureLayout({ ...base, crop, toolSize, settingsSize })
    expect(layout.settingsCollapsed).toBe(false)
    const height = settingsSize.height + 6 + toolSize.height
    expect(layout.tools.top >= layout.crop.bottom + 12 ||
      layout.tools.top + height <= layout.crop.top - 12).toBe(true)
    expect(layout.tools.left).toBeGreaterThanOrEqual(8)
    expect(layout.tools.left + toolSize.width).toBeLessThanOrEqual(base.viewport.width - 8)
    const overlapsActions = layout.tools.left < layout.actions.left + base.actionSize.width &&
      layout.tools.left + toolSize.width > layout.actions.left &&
      layout.tools.top < layout.actions.top + base.actionSize.height &&
      layout.tools.top + height > layout.actions.top
    expect(overlapsActions).toBe(false)
  })

  it.each([
    { x: 0, y: 0, width: 1440, height: 900 },
    { x: 10, y: 15, width: 1400, height: 870 },
    { x: 100, y: 70, width: 800, height: 760 },
  ])('collapses settings when the entire group cannot fit outside %o', (crop) => {
    const layout = computeQuickCaptureLayout({
      ...base, crop, settingsSize: { width: 680, height: 46 },
    })
    expect(layout.settingsCollapsed).toBe(true)
    expect(layout.tools.top).toBeGreaterThanOrEqual(8)
  })

  it('collapses settings wider than the viewport instead of covering the crop', () => {
    const layout = computeQuickCaptureLayout({
      ...base, crop: { x: 100, y: 200, width: 800, height: 300 },
      settingsSize: { width: 1600, height: 46 },
    })
    expect(layout.settingsCollapsed).toBe(true)
  })

  it('maps the hidden native window before measuring WebKitGTK layout', async () => {
    const order: string[] = []
    let mapped = false

    const result = await presentThenWaitForStableQuickCaptureLayout({
      present: async () => {
        order.push('present')
        mapped = true
        return true
      },
      measure: () => {
        order.push('measure')
        return mapped ? 'visible-layout' : undefined
      },
      nextFrame: async () => {
        order.push('frame')
      },
      reveal: async () => {
        order.push('reveal')
      },
    })

    expect(result).toEqual({ presented: true, layout: 'visible-layout' })
    expect(order[0]).toBe('present')
    expect(order.at(-1)).toBe('reveal')
    expect(order.indexOf('reveal')).toBeGreaterThan(order.lastIndexOf('frame'))
  })

  it('never reveals a mapped surface without stable complete geometry', async () => {
    const reveal = vi.fn()
    const result = await presentThenWaitForStableQuickCaptureLayout({
      present: async () => true,
      measure: () => undefined,
      nextFrame: async () => undefined,
      reveal,
      maximumFrames: 2,
    })

    expect(result).toEqual({ presented: true })
    expect(reveal).not.toHaveBeenCalled()
  })

  it('waits for two matching layout frames before native presentation', async () => {
    const measurements = ['initial', 'fitted', 'fitted']
    const nextFrame = vi.fn().mockResolvedValue(undefined)

    const stable = await waitForStableQuickCaptureLayout({
      measure: () => measurements.shift(),
      nextFrame,
      maximumFrames: 4,
    })

    expect(stable).toBe('fitted')
    expect(nextFrame).toHaveBeenCalledTimes(2)
  })

  it('does not approve missing chrome measurements for presentation', async () => {
    const stable = await waitForStableQuickCaptureLayout({
      measure: () => undefined,
      nextFrame: async () => undefined,
      maximumFrames: 3,
    })

    expect(stable).toBeUndefined()
  })

  it('moves both chrome groups with the live crop geometry', () => {
    const first = computeQuickCaptureLayout({
      ...base,
      crop: { x: 100, y: 100, width: 800, height: 500 },
    })
    const moved = computeQuickCaptureLayout({
      ...base,
      crop: { x: 260, y: 180, width: 700, height: 360 },
    })

    expect(moved.actions.left).not.toBe(first.actions.left)
    expect(moved.actions.top).not.toBe(first.actions.top)
    expect(moved.tools.left).not.toBe(first.tools.left)
    expect(moved.tools.top).not.toBe(first.tools.top)
  })

  it('keeps tools adjacent and flips each group at viewport collisions', () => {
    const layout = computeQuickCaptureLayout({
      ...base,
      crop: { x: 900, y: 680, width: 500, height: 190 },
    })

    expect(layout.actions.side).toBe('left')
    expect(layout.tools.side).toBe('above')
    expect(layout.actions.left).toBeGreaterThanOrEqual(8)
    expect(layout.tools.left).toBeGreaterThanOrEqual(8)
    expect(layout.tools.left + base.toolSize.width).toBeLessThanOrEqual(base.viewport.width - 8)
  })

  it('maps a source crop through a full-viewport frozen frame', () => {
    const layout = computeQuickCaptureLayout({
      ...base,
      scene: { left: 0, top: 0, width: 1280, height: 800 },
      source: { width: 2560, height: 1600 },
      crop: { x: 200, y: 100, width: 1000, height: 600 },
    })

    expect(layout.crop).toEqual({
      left: 100,
      top: 50,
      right: 600,
      bottom: 350,
      width: 500,
      height: 300,
    })
  })
})
