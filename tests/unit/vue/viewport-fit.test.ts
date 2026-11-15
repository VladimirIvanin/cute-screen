import {
  describe,
  expect,
  it,
} from 'vitest'
import { ref } from 'vue'
import { ViewportController } from '../../../packages/editor-vue/src/shell/canvas/viewport-controller'
import type {
  CanvasViewportEmit,
  CanvasViewportProps,
} from '../../../packages/editor-vue/src/shell/canvas/contracts'

function host(
  width: number,
  height: number,
): {
  readonly element: HTMLDivElement
  set(width: number, height: number): void
} {
  let currentWidth = width
  let currentHeight = height
  const element = document.createElement('div')
  Object.defineProperty(element, 'clientWidth', { get: () => currentWidth })
  Object.defineProperty(element, 'clientHeight', { get: () => currentHeight })
  return {
    element,
    set(
      nextWidth,
      nextHeight,
    ) {
      currentWidth = nextWidth
      currentHeight = nextHeight
    },
  }
}

function controller(
  props: CanvasViewportProps,
  scroll: HTMLDivElement,
  emitted: number[],
): ViewportController {
  return new ViewportController({
    props,
    emit: ((event: string, value?: number) => {
      if (event === 'fitZoom' && value !== undefined) emitted.push(value)
    }) as CanvasViewportEmit,
    scene: ref(),
    scrollContainer: ref(scroll),
    canvasPoint: () => undefined,
  })
}

function props(
  width: number,
  height: number,
): CanvasViewportProps {
  return {
    canvas: { width, height },
    fitMode: true,
    zoom: 100,
    documentState: { kind: 'empty' },
    t: (key: string) => key,
  } as CanvasViewportProps
}

describe('viewport fit hysteresis', () => {
  it('does not raise zoom for the same container and does refit after a real resize', () => {
    const surface = props(1000, 1000)
    const emitted: number[] = []
    const box = host(490, 490)
    const fitted = controller(surface, box.element, emitted)
    fitted.fit()
    expect(emitted).toEqual([49])
    surface.zoom = 49
    surface.canvas = { width: 980, height: 980 }
    fitted.fit()
    expect(emitted).toEqual([49])
    box.set(800, 800)
    fitted.fit()
    expect(emitted.at(-1)).toBeGreaterThan(49)
    expect(emitted).toHaveLength(2)
  })

  it('does not zoom back in when a scrollbar returns a few pixels', () => {
    const surface = props(1000, 1000)
    const emitted: number[] = []
    const box = host(499, 500)
    const fitted = controller(surface, box.element, emitted)
    fitted.fit()
    expect(emitted).toEqual([49])
    surface.zoom = 49
    box.set(500, 500)
    fitted.fit()
    expect(emitted).toEqual([49])
  })
})
