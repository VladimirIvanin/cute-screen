import { render } from '@testing-library/vue'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import BrandMark from '../../../packages/editor-vue/src/shell/assets/BrandMark.vue'
import TopBar from '../../../packages/editor-vue/src/shell/components/TopBar.vue'
import { attachBrandEyes } from '../../../packages/editor-vue/src/shell/brand/brand-eyes'

let now: number
let nextFrame: number
let frames: Map<number, FrameRequestCallback>
let host: HTMLElement
let eyes: SVGGElement
let dispose: () => void
let motion: EventTarget & { matches: boolean }
let hidden: boolean

function step(milliseconds: number): void {
  now += milliseconds
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) callback(now)
}

function settle(): void {
  for (let index = 0; index < 300 && frames.size; index += 1) step(16)
  expect(frames.size).toBe(0)
}

function pointer(
  type: string,
  x = 30,
  y = 15,
  pointerType = 'mouse',
): void {
  const event = new Event(type)
  Object.assign(event, { pointerType, clientX: x, clientY: y })
  host.dispatchEvent(event)
}

function offset(): number[] {
  return eyes.getAttribute('transform')?.match(/-?\d+(?:\.\d+)?/gu)?.map(Number) ?? [0, 0]
}

beforeEach(() => {
  now = 0
  nextFrame = 0
  frames = new Map()
  hidden = false
  motion = Object.assign(new EventTarget(), { matches: false })
  vi.spyOn(window, 'matchMedia').mockReturnValue(motion as unknown as MediaQueryList)
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.spyOn(window.performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
  const view = render(BrandMark)
  host = view.container as HTMLElement
  const mark = host.querySelector<SVGSVGElement>('svg')!
  eyes = mark.querySelector<SVGGElement>('[data-brand-eyes]')!
  vi.spyOn(mark, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 30, height: 30,
  } as DOMRect)
  dispose = attachBrandEyes(host)
})

afterEach(() => {
  dispose()
  vi.restoreAllMocks()
})

describe('brand gaze using the generated production mark', () => {
  it('greets left/right for 1500 ms, then tracks slowly and sleeps until the next movement', () => {
    pointer('pointerenter', 200, 200)
    step(420)
    expect(offset()).toEqual([-1.3, 0])
    step(600)
    expect(offset()).toEqual([1.3, 0])
    step(480)
    settle()
    expect(offset()[0]).toBeCloseTo(1.5, 2)
    expect(offset()[1]).toBeCloseTo(0.8, 2)
    step(10_000)
    expect(frames.size).toBe(0)
    pointer('pointermove', -200, -200)
    expect(frames.size).toBe(1)
    step(64)
    expect(offset()[0]).toBeGreaterThan(0.8)
    settle()
    expect(offset()[0]).toBeCloseTo(-1.5, 2)
    expect(offset()[1]).toBeCloseTo(-0.8, 2)
  })

  it('uses the latest pointer position during the greeting without restarting it', () => {
    pointer('pointerenter')
    step(420)
    pointer('pointermove', -200, 15)
    step(600)
    expect(offset()).toEqual([1.3, 0])
    step(480)
    settle()
    expect(offset()[0]).toBeCloseTo(-1.5, 2)
    expect(offset()[1]).toBe(0)
  })

  it('returns in 500 ms even if the pointer leaves mid-greeting, and greets again on re-entry', () => {
    pointer('pointerenter')
    step(420)
    pointer('pointerleave')
    step(200)
    expect(offset()[0]).toBeGreaterThan(-1.3)
    expect(offset()[0]).toBeLessThan(0)
    step(300)
    expect(eyes).not.toHaveAttribute('transform')
    expect(frames.size).toBe(0)
    pointer('pointerenter')
    step(420)
    expect(offset()).toEqual([-1.3, 0])
    pointer('pointerleave')
    step(50)
    pointer('pointerenter')
    step(420)
    expect(offset()).toEqual([-1.3, 0])
    expect(frames.size).toBe(1)
  })

  it('keeps touch and reduced motion static, including a live preference change', () => {
    pointer('pointerenter', 20, 20, 'touch')
    pointer('pointermove', 25, 25, 'touch')
    expect(frames.size).toBe(0)
    motion.matches = true
    pointer('pointerenter')
    expect(frames.size).toBe(0)
    motion.matches = false
    pointer('pointerenter')
    step(420)
    motion.matches = true
    motion.dispatchEvent(new Event('change'))
    expect(frames.size).toBe(0)
    expect(eyes).not.toHaveAttribute('transform')
    pointer('pointermove')
    expect(frames.size).toBe(0)
  })

  it.each(['blur', 'pagehide', 'pointercancel', 'visibilitychange'])('resets on %s without resuming by itself', (type) => {
    pointer('pointerenter')
    step(420)
    if (type === 'visibilitychange') {
      hidden = true
      document.dispatchEvent(new Event(type))
    } else if (type === 'pointercancel') host.dispatchEvent(new Event(type))
    else window.dispatchEvent(new Event(type))
    expect(eyes).not.toHaveAttribute('transform')
    expect(frames.size).toBe(0)
    pointer('pointermove')
    expect(frames.size).toBe(0)
  })

  it('disposes frames and listeners, and tolerates repeated disposal', () => {
    pointer('pointerenter')
    step(420)
    dispose()
    dispose()
    pointer('pointerenter')
    expect(frames.size).toBe(0)
    expect(eyes).not.toHaveAttribute('transform')
  })

  it('allows a static or missing mark without installing a loop', () => {
    expect(() => attachBrandEyes(document.createElement('div'))()).not.toThrow()
    expect(frames.size).toBe(0)
  })

  it('attaches through the actual TopBar mount and cancels through unmount', () => {
    dispose()
    const view = render(TopBar, {
      props: { locale: 'en', theme: 'light', canCopyOrExport: false, t: (key) => key },
    })
    host = view.container.querySelector<HTMLElement>('.cs-brand')!
    eyes = host.querySelector<SVGGElement>('[data-brand-eyes]')!
    pointer('pointerenter')
    step(420)
    expect(offset()).toEqual([-1.3, 0])
    view.unmount()
    expect(frames.size).toBe(0)
    expect(eyes).not.toHaveAttribute('transform')
    pointer('pointerenter')
    expect(frames.size).toBe(0)
  })
})
