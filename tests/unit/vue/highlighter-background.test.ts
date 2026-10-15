import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { HighlighterBackgroundController } from '../../../packages/editor-vue/src/shell/workspace/highlighter-background'

afterEach(() => vi.useRealTimers())

describe('background highlighter analysis lifecycle', () => {
  function setup(supported = true) {
    vi.useFakeTimers()
    const update = vi.fn()
    const source = new Blob(['immutable binary image'])
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null } as unknown as Worker
    const ports = { supported: () => supported, source: vi.fn(() => source), worker: () => worker }
    const controller = new HighlighterBackgroundController(update, ports)
    const image = { naturalWidth: 7680, naturalHeight: 4320 } as HTMLImageElement
    return { update, source, worker, ports, controller, image }
  }
  it('yields before starting and sends one immutable source for worker-side resizing', async () => {
    const s = setup()
    s.controller.start(s.image)
    s.controller.start(s.image)
    expect(s.ports.source).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(s.ports.source).toHaveBeenCalledExactlyOnceWith(s.image)
    expect(s.worker.postMessage).toHaveBeenCalledWith({ source: s.source, width: 256, height: 144 })
    s.worker.onmessage!({ data: { effect: 'illuminate' } } as MessageEvent)
    expect(s.update).toHaveBeenLastCalledWith({ status: 'ready', effect: 'illuminate' })
    expect(s.worker.terminate).toHaveBeenCalledOnce()
    s.controller.start(s.image)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.ports.source).toHaveBeenCalledTimes(1)
    s.controller.dispose()
  })
  it('cancels pending work before it starts without reporting an error', async () => {
    const s = setup()
    s.controller.start(s.image)
    s.controller.reset()
    await vi.advanceTimersByTimeAsync(1)
    expect(s.ports.source).not.toHaveBeenCalled()
    expect(s.worker.postMessage).not.toHaveBeenCalled()
    expect(s.update).toHaveBeenLastCalledWith({ status: 'loading', effect: 'highlight' })
    s.controller.dispose()
  })
  it('ignores replies from the preceding document', async () => {
    const s = setup()
    s.controller.start(s.image)
    await vi.advanceTimersByTimeAsync(1)
    const reply = s.worker.onmessage!
    s.controller.reset()
    reply.call(s.worker, { data: { effect: 'illuminate' } } as MessageEvent)
    expect(s.update).toHaveBeenLastCalledWith({ status: 'loading', effect: 'highlight' })
    s.controller.dispose()
  })
  it.each(['unavailable', 'error', 'timeout'])('keeps manual effects usable on %s', async (reason) => {
    const s = setup(reason !== 'unavailable')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    s.controller.start(s.image)
    await vi.advanceTimersByTimeAsync(1)
    if (reason === 'error') s.worker.onerror!({ message: 'decode failed' } as ErrorEvent)
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(10_000)
    expect(s.update).toHaveBeenLastCalledWith({ status: 'unavailable', effect: 'highlight' })
    s.controller.dispose()
    warning.mockRestore()
  })
})
