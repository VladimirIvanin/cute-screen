import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  computeQuickCaptureLayout,
  placeQuickCaptureNote,
  presentThenWaitForStableQuickCaptureLayout,
  waitForStableQuickCaptureLayout,
} from '../../../apps/desktop/src/quick-capture-layout'
import { QuickCaptureLayoutController } from '../../../apps/desktop/src/quick-capture-layout-controller'
import {
  ref,
  shallowRef,
} from 'vue'

it('keeps the portal note off the compact History action and the crop', () => {
  const position = placeQuickCaptureNote(
    { width: 1920, height: 1080 },
    { width: 240, height: 54 },
    { left: 1692, top: 538, width: 46, height: 215 },
    { left: 760, top: 154, width: 685, height: 46 },
    { left: 523, top: 211, width: 1153, height: 865 },
  )
  expect(position).toEqual({ left: 8, top: 8 })
})

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
      const actions = root.querySelector<HTMLElement>('.cs-quick-actions')!
      controller.update({ x: .1, y: .1, width: .1, height: .1 })
      expect(actions.dataset.tooltipSide).toBe('right')
      controller.update({ x: .7, y: .1, width: .1, height: .1 })
      expect(actions.dataset.tooltipSide).toBe('left')
    } finally {
      root.remove()
    }
  })
  it('positions the tool bar for the width after the settings button is hidden', () => {
    const root = document.createElement('div')
    root.className = 'cs-quick-capture'
    root.innerHTML = '<div class="cs-quick-actions"></div><div class="cs-quick-toolrail-group"><button class="cs-quick-settings-button"></button></div><div class="cs-tool-defaults-toolbar"></div>'
    document.body.append(root)
    const width = window.innerWidth
    const height = window.innerHeight
    const scene = document.createElement('canvas')
    scene.getBoundingClientRect = () => new DOMRect(0, 0, width, height)
    const actions = root.querySelector<HTMLElement>('.cs-quick-actions')!
    const row = root.querySelector<HTMLElement>('.cs-quick-toolrail-group')!
    const button = root.querySelector<HTMLElement>('.cs-quick-settings-button')!
    const settings = root.querySelector<HTMLElement>('.cs-tool-defaults-toolbar')!
    Object.defineProperties(actions, { offsetWidth: { value: 46 }, offsetHeight: { value: 120 } })
    Object.defineProperty(row, 'offsetWidth', { get: () => button.style.display === 'none' ? 220 : 280 })
    Object.defineProperty(row, 'offsetHeight', { value: 40 })
    Object.defineProperties(settings, { offsetWidth: { value: 280 }, offsetHeight: { value: 36 } })
    try {
      const controller = new QuickCaptureLayoutController({
        hosts: shallowRef({ scene } as NonNullable<ConstructorParameters<typeof QuickCaptureLayoutController>[0]['hosts']['value']>),
        session: shallowRef({
          snapshot: { core: { document: { canvas: { width, height } } } },
        } as NonNullable<ConstructorParameters<typeof QuickCaptureLayoutController>[0]['session']['value']>),
        currentCrop: ref({ x: 80, y: 80, width: 360, height: 160 }),
      })
      controller.update()
      const placed = row.style.left
      controller.update()
      expect(button.style.display).toBe('none')
      expect(row.style.left).toBe(placed)
      const wide = computeQuickCaptureLayout({
        viewport: { width, height },
        scene: { left: 0, top: 0, width, height },
        source: { width, height },
        crop: { x: 80, y: 80, width: 360, height: 160 },
        actionSize: { width: 46, height: 120 },
        toolSize: { width: 280, height: 40 },
        settingsSize: { width: 280, height: 36 },
      })
      expect(placed).not.toBe(`${Math.round(wide.tools.left)}px`)
    } finally {
      root.remove()
    }
  })
  it('keeps the tool bar still when the settings panel changes height', () => {
    const root = document.createElement('div')
    root.className = 'cs-quick-capture'
    root.innerHTML = '<div class="cs-quick-actions"></div><div class="cs-quick-toolrail-group"></div><div class="cs-tool-defaults-toolbar"></div>'
    document.body.append(root)
    const width = window.innerWidth
    const height = window.innerHeight
    const scene = document.createElement('canvas')
    scene.getBoundingClientRect = () => new DOMRect(0, 0, width, height)
    const actions = root.querySelector<HTMLElement>('.cs-quick-actions')!
    const row = root.querySelector<HTMLElement>('.cs-quick-toolrail-group')!
    const settings = root.querySelector<HTMLElement>('.cs-tool-defaults-toolbar')!
    Object.defineProperties(actions, { offsetWidth: { value: 46 }, offsetHeight: { value: 120 } })
    Object.defineProperties(row, { offsetWidth: { value: 240 }, offsetHeight: { value: 40 } })
    let settingsHeight = 36
    Object.defineProperty(settings, 'offsetWidth', { value: 280 })
    Object.defineProperty(settings, 'offsetHeight', { get: () => settingsHeight })
    try {
      const controller = new QuickCaptureLayoutController({
        hosts: shallowRef({ scene } as NonNullable<ConstructorParameters<typeof QuickCaptureLayoutController>[0]['hosts']['value']>),
        session: shallowRef({
          snapshot: { core: { document: { canvas: { width, height } } } },
        } as NonNullable<ConstructorParameters<typeof QuickCaptureLayoutController>[0]['session']['value']>),
        currentCrop: ref({ x: 80, y: 80, width: 360, height: 160 }),
      })
      controller.update()
      const barTop = row.style.top
      const firstSettingsTop = Number.parseFloat(settings.style.top)
      expect(Number.parseFloat(barTop)).toBeGreaterThan(firstSettingsTop)
      settingsHeight = 120
      controller.update()
      expect(row.style.top).toBe(barTop)
      expect(Number.parseFloat(settings.style.top)).toBeLessThan(firstSettingsTop)
      expect(settings.dataset.placement).toBe('above')
    } finally {
      root.remove()
    }
  })
  it('keeps the tool bar fixed when settings open or change height', () => {
    const crop = { x: 200, y: 180, width: 700, height: 300 }
    const plain = computeQuickCaptureLayout({ ...base, crop })
    const shortSettings = { width: 680, height: 46 }
    const short = computeQuickCaptureLayout({ ...base, crop, settingsSize: shortSettings })
    const tall = computeQuickCaptureLayout({
      ...base, crop, settingsSize: { width: 680, height: 120 },
    })
    expect(short.tools).toEqual(plain.tools)
    expect(tall.tools).toEqual(plain.tools)
    expect(plain.settings).toBeUndefined()
    expect(short.settingsCollapsed).toBe(false)
    expect(tall.settingsCollapsed).toBe(false)
    expect(short.tools.side).toBe('below')
    expect(short.settings).toEqual({
      left: 210,
      top: plain.tools.top - shortSettings.height - 6,
      side: 'above',
    })
    expect(tall.settings?.top).toBe(plain.tools.top - 120 - 6)
    expect(short.settings!.top).toBeGreaterThan(short.crop.top)
    expect(short.settings!.top).toBeLessThan(short.crop.bottom)
  })

  it('opens settings below a bar that sits above the frame', () => {
    const settingsSize = { width: 400, height: 46 }
    const layout = computeQuickCaptureLayout({
      ...base,
      crop: { x: 900, y: 680, width: 500, height: 190 },
      settingsSize,
    })
    expect(layout.tools.side).toBe('above')
    expect(layout.settingsCollapsed).toBe(false)
    expect(layout.settings).toMatchObject({
      top: layout.tools.top + base.toolSize.height + 6,
      side: 'below',
    })
    expect(layout.settings!.top + settingsSize.height).toBeGreaterThan(layout.crop.top)
    expect(layout.settings!.top).toBeLessThan(layout.crop.bottom)
    expect(layout.settings!.left).toBeGreaterThanOrEqual(8)
    expect(layout.settings!.left + settingsSize.width).toBeLessThanOrEqual(base.viewport.width - 8)
  })

  it('shifts settings sideways instead of covering the action buttons', () => {
    const settingsSize = { width: 400, height: 40 }
    const toolSize = { width: 200, height: 46 }
    const layout = computeQuickCaptureLayout({
      ...base,
      crop: { x: 1000, y: 200, width: 300, height: 200 },
      toolSize,
      settingsSize,
    })
    expect(layout.settingsCollapsed).toBe(false)
    const settings = layout.settings!
    const actions = {
      left: layout.actions.left,
      top: layout.actions.top,
      right: layout.actions.left + base.actionSize.width,
      bottom: layout.actions.top + base.actionSize.height,
    }
    const overlaps = settings.left < actions.right &&
      settings.left + settingsSize.width > actions.left &&
      settings.top < actions.bottom &&
      settings.top + settingsSize.height > actions.top
    expect(overlaps).toBe(false)
    expect(settings.left).toBeGreaterThanOrEqual(8)
    expect(settings.left + settingsSize.width).toBeLessThanOrEqual(base.viewport.width - 8)
    expect(settings.top + settingsSize.height + 6).toBe(layout.tools.top)
  })

  it('collapses settings that cannot avoid the action buttons inside the viewport', () => {
    const layout = computeQuickCaptureLayout({
      ...base,
      crop: { x: 200, y: 400, width: 400, height: 200 },
      toolSize: { width: 200, height: 46 },
      settingsSize: { width: 900, height: 80 },
    })
    expect(layout.settingsCollapsed).toBe(true)
    expect(layout.settings).toBeUndefined()
    expect(layout.tools.side).toBe('below')
  })

  it.each([
    { x: 0, y: 0, width: 1440, height: 900 },
    { x: 10, y: 15, width: 1400, height: 870 },
  ])('keeps the bar inside the viewport when settings overlay a large frame %o', (crop) => {
    const plain = computeQuickCaptureLayout({ ...base, crop })
    const layout = computeQuickCaptureLayout({
      ...base, crop, settingsSize: { width: 680, height: 46 },
    })
    expect(layout.tools).toEqual(plain.tools)
    expect(layout.settingsCollapsed).toBe(false)
    expect(layout.tools.top).toBeGreaterThanOrEqual(8)
    expect(layout.settings!.top).toBeGreaterThanOrEqual(8)
    expect(layout.settings!.top + 46).toBeLessThanOrEqual(base.viewport.height - 8)
  })

  it('collapses settings that are taller than the space beside the bar', () => {
    const plain = computeQuickCaptureLayout({
      ...base, crop: { x: 0, y: 0, width: 1440, height: 900 },
    })
    const layout = computeQuickCaptureLayout({
      ...base,
      crop: { x: 0, y: 0, width: 1440, height: 900 },
      settingsSize: { width: 680, height: 800 },
    })
    expect(layout.settingsCollapsed).toBe(true)
    expect(layout.settings).toBeUndefined()
    expect(layout.tools).toEqual(plain.tools)
  })

  it('collapses settings wider than the viewport', () => {
    const layout = computeQuickCaptureLayout({
      ...base, crop: { x: 100, y: 200, width: 800, height: 300 },
      settingsSize: { width: 1600, height: 46 },
    })
    expect(layout.settingsCollapsed).toBe(true)
    expect(layout.settings).toBeUndefined()
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
