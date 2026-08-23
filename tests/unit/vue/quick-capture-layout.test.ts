import { describe, expect, it, vi } from 'vitest'

import {
  computeQuickCaptureLayout,
  waitForStableQuickCaptureLayout,
} from '../../../apps/desktop/src/quick-capture-layout'

const base = {
  viewport: { width: 1440, height: 900 },
  scene: { left: 0, top: 0, width: 1440, height: 900 },
  source: { width: 1440, height: 900 },
  actionSize: { width: 124, height: 220 },
  toolSize: { width: 620, height: 96 },
}

describe('quick capture overlay layout', () => {
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
    expect(layout.tools.left + base.toolSize.width).toBeLessThanOrEqual(
      base.viewport.width - 8,
    )
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
