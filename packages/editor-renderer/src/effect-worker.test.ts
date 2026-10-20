import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { EffectWorker } from './effects/worker'
import type { PixelJob } from './effects/runtime'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: MessageEvent<Uint8ClampedArray>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  transfer: Transferable[] = []
  constructor() {
    TestWorker.instances.push(this)
  }
  postMessage(
    _job: PixelJob,
    transfer: Transferable[],
  ) {
    this.transfer = transfer
  }
  terminate() {
    this.terminated = true
  }
}

const job = (): PixelJob => ({ image: { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) },
  radius: 1, mode: 'blur' })

afterEach(() => {
  vi.unstubAllGlobals()
  TestWorker.instances = []
})

describe('effect worker ownership', () => {
  it('transfers pixels and reuses one worker after a completed job', async () => {
    vi.stubGlobal('Worker', TestWorker)
    const owner = new EffectWorker()
    try {
      const first = job()
      const pending = owner.run(first)
      const worker = TestWorker.instances[0]!
      expect(worker.transfer).toEqual([first.image.data.buffer])
      worker.onmessage!({ data: new Uint8ClampedArray([4, 5, 6, 255]) } as MessageEvent<Uint8ClampedArray>)
      await pending
      expect(first.image.data[0]).toBe(4)
      const next = owner.run(job())
      worker.onmessage!({ data: new Uint8ClampedArray(4) } as MessageEvent<Uint8ClampedArray>)
      await next
      expect(TestWorker.instances).toHaveLength(1)
    } finally {
      owner.dispose()
    }
  })

  it('terminates cancelled work and does not queue stale jobs', async () => {
    vi.stubGlobal('Worker', TestWorker)
    const owner = new EffectWorker()
    const controller = new AbortController()
    const pending = owner.run(job(), controller.signal)
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await cancelled
    expect(TestWorker.instances[0]!.terminated).toBe(true)
    const next = owner.run(job())
    expect(TestWorker.instances).toHaveLength(2)
    const failed = expect(next).rejects.toMatchObject({ name: 'AbortError' })
    owner.dispose()
    await failed
    expect(TestWorker.instances[1]!.terminated).toBe(true)
  })

  it('reports a worker error rather than treating it as cancellation', async () => {
    vi.stubGlobal('Worker', TestWorker)
    const owner = new EffectWorker()
    const pending = owner.run(job())
    const failed = expect(pending).rejects.toThrow('Broken worker')
    TestWorker.instances[0]!.onerror!({ message: 'Broken worker' } as ErrorEvent)
    await failed
    owner.dispose()
  })
})
