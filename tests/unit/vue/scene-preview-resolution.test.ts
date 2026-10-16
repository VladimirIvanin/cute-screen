import { createCanvas } from '@napi-rs/canvas'
import {
  computed,
  markRaw,
  shallowRef,
} from 'vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  PointerGeometryController,
  type PointerGeometryContext,
} from '../../../packages/editor-vue/src/shell/canvas/pointer-geometry-controller'
import {
  EyedropperController,
  type EyedropperPorts,
} from '../../../packages/editor-vue/src/shell/canvas/eyedropper-controller'
import { scenePreviewScale } from '../../../packages/editor-vue/src/shell/canvas/scene-preview-scale'
import { document as fixture } from './canvas-viewport-test-kit'

describe('document coordinates with a dense preview', () => {
  it('keeps the magnifier grid in document pixels at DPR 2', () => {
    const canvas = createCanvas(200, 120)
    const context = canvas.getContext('2d')
    for (let y = 0; y < 9; y += 1) for (let x = 0; x < 9; x += 1) {
      context.fillStyle = `rgb(${x * 30}, ${y * 30}, 100)`
      context.fillRect((46 + x) * 2, (26 + y) * 2, 2, 2)
    }
    const eyedropper = new EyedropperController({
      props: { sampling: true },
      scene: shallowRef(canvas as unknown as HTMLCanvasElement),
      outputBounds: computed(() => ({ x: 40, y: 50, width: 100, height: 60 })),
      viewportRoot: shallowRef(undefined),
    } as unknown as EyedropperPorts)
    const preview = createCanvas(9, 9)
    eyedropper.preview.value = markRaw(preview) as unknown as HTMLCanvasElement
    eyedropper.loupe.value = document.createElement('div')
    let frame: FrameRequestCallback | undefined
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    try {
      eyedropper.schedule({ x: 90, y: 80 }, { clientX: 120, clientY: 90 })
      frame!(0)
      for (let y = 0; y < 9; y += 1) for (let x = 0; x < 9; x += 1) {
        expect([...preview.getContext('2d').getImageData(x, y, 1, 1).data]).toEqual([x * 30, y * 30, 100, 255])
      }
      expect(eyedropper.loupe.value.dataset.state).toBe('opaque')
    } finally {
      request.mockRestore()
    }
  })

  it.each([1, 1.3125, 2, 4])('maps pointer and colour sampling independently of density %s', (scale) => {
    const canvas = createCanvas(Math.round(100 * scale), Math.round(60 * scale))
    const scene = Object.assign(canvas, {
      getBoundingClientRect: () => ({ left: 20, top: 30, width: 200, height: 120 }),
    }) as unknown as HTMLCanvasElement
    const outputBounds = computed(() => ({ x: 40, y: 50, width: 100, height: 60 }))
    const props = { canvas: fixture.canvas, document: fixture, t: (key: string) => key }
    const geometry = new PointerGeometryController({
      props, scene: shallowRef(scene), outputBounds,
    } as unknown as PointerGeometryContext)
    expect(geometry.canvasPoint({ clientX: 120, clientY: 90 })).toMatchObject({ x: 90, y: 80 })
    const context = canvas.getContext('2d')
    context.fillStyle = '#123456'
    context.fillRect(Math.floor(50.5 * canvas.width / 100), Math.floor(30.5 * canvas.height / 60), 1, 1)
    const events: unknown[][] = []
    const eyedropper = new EyedropperController({
      props, scene: shallowRef(scene), outputBounds,
      emit: (...event: unknown[]) => events.push(event),
    } as unknown as EyedropperPorts)
    eyedropper.sample({ x: 90, y: 80 })
    expect(events).toEqual([['colorSample', '#123456']])
  })

  it('keeps fit/native density and bounds large zoom allocations', () => {
    expect(scenePreviewScale({ width: 1920, height: 1080 }, .5, 1)).toBe(1)
    expect(scenePreviewScale({ width: 1920, height: 1080 }, 1.3125, 2)).toBe(2.625)
    const canvas = { width: 7680, height: 4320 }
    const scale = scenePreviewScale(canvas, 8, 2)
    expect(scale).toBeGreaterThan(1)
    expect(canvas.width * canvas.height * scale ** 2).toBeLessThanOrEqual(64 * 1024 * 1024 + 1)
    expect(scenePreviewScale({ width: 32768, height: 32768 }, 16, 2)).toBe(1)
  })
})
