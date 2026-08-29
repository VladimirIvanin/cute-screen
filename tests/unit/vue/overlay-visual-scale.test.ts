import { describe, expect, it } from 'vitest'

import { overlayVisualScale } from '../../../packages/editor-vue/src/shell/overlay-visual-scale'

describe('quick-frame overlay visual scale', () => {
  it('uses the rendered Retina canvas scale instead of stale fit zoom', () => {
    const scale = overlayVisualScale(
      {
        backingWidth: 2880,
        backingHeight: 1800,
        clientWidth: 1440,
        clientHeight: 900,
      },
      0.25,
    )

    expect(8 / scale).toBe(16)
    expect((8 / scale) * scale).toBe(8)
    expect((28 / scale) * scale).toBe(28)
  })

  it('falls back safely before the canvas has layout geometry', () => {
    expect(
      overlayVisualScale(
        {
          backingWidth: 2880,
          backingHeight: 1800,
          clientWidth: 0,
          clientHeight: 0,
        },
        0.5,
      ),
    ).toBe(0.5)
  })
})
