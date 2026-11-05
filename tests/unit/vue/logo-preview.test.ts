import {
  render,
  screen,
} from '@testing-library/vue'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { shallowRef } from 'vue'
import { loadImageWithBinaryFallback } from '../../../packages/editor-vue/src/image-transport'
import { compositionImagesKey } from '../../../packages/editor-vue/src/shell/composition/image-preview'
import CardLogoPreview from '../../../packages/editor-vue/src/shell/composition/CardLogoPreview.vue'

vi.mock('../../../packages/editor-vue/src/image-transport', () => ({ loadImageWithBinaryFallback: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

type Grant = { kind: 'imported'; blobHash: string; resourceToken: string } | { kind: 'cancelled' }
function setup(resolveGrant?: () => Promise<Grant>) {
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, clearRect: vi.fn() } as unknown as CanvasRenderingContext2D)
  const releaseImage = vi.fn(async () => undefined)
  const grant = async (): Promise<Grant> => ({ kind: 'imported', blobHash: 'a'.repeat(64), resourceToken: 'opaque' })
  const resolveTexture = vi.fn(resolveGrant ?? grant)
  const bridge = { resolveTexture, releaseImage }
  const view = render(CardLogoPreview, {
    props: { blobHash: 'a'.repeat(64), locale: 'en', label: 'Logo example' },
    global: { provide: { [compositionImagesKey as symbol]: {
      images: shallowRef(new Map()), error: shallowRef(), bridge: () => bridge,
    } } },
  })
  return { ...view, drawImage, resolveTexture, releaseImage }
}
describe('logo thumbnail lifecycle', () => {
  it('loads an unapplied blob, draws a bounded thumbnail and releases the opaque token', async () => {
    vi.mocked(loadImageWithBinaryFallback).mockImplementation(async (options) => {
      const image = { naturalWidth: 960, naturalHeight: 480 } as HTMLImageElement
      return { resource: await options.createResource(image, {} as never) } as never
    })
    const view = setup()
    await vi.waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('data-preview-state', 'ready'))
    expect(view.resolveTexture).toHaveBeenCalledWith('a'.repeat(64), expect.any(String))
    expect(view.drawImage).toHaveBeenCalledWith(expect.anything(), 4, 26, 88, 44)
    expect(view.releaseImage).toHaveBeenCalledWith('opaque')
  })
  it('shows loading, then a visible error and releases the token after decode failure', async () => {
    let fail!: (error: Error) => void
    vi.mocked(loadImageWithBinaryFallback).mockImplementation(() => new Promise((_resolve, reject) => {
      fail = reject
    }))
    const view = setup()
    await vi.waitFor(() => expect(fail).toBeDefined())
    expect(screen.getByRole('img')).toHaveAttribute('aria-busy', 'true')
    fail(new Error('Corrupt image'))
    await vi.waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('data-preview-state', 'error'))
    expect(screen.getByRole('img')).toHaveAttribute('title', 'Could not load logo')
    expect(view.releaseImage).toHaveBeenCalledWith('opaque')
  })
  it('releases a late grant after unmount without drawing into the old component', async () => {
    let complete!: (outcome: { kind: 'imported'; blobHash: string; resourceToken: string }) => void
    const view = setup(() => new Promise((resolve) => {
      complete = resolve
    }))
    await vi.waitFor(() => expect(complete).toBeDefined())
    view.unmount()
    view.drawImage.mockClear()
    complete({ kind: 'imported', blobHash: 'a'.repeat(64), resourceToken: 'late' })
    await vi.waitFor(() => expect(view.releaseImage).toHaveBeenCalledWith('late'))
    expect(view.drawImage).not.toHaveBeenCalled()
  })
  it('distinguishes an expected cancellation from a decode error', async () => {
    const warning = vi.spyOn(console, 'warn')
    const view = setup(async () => ({ kind: 'cancelled' }))
    await vi.waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('data-preview-state', 'cancelled'))
    expect(screen.getByRole('img')).toHaveAttribute('title', 'Loading cancelled')
    expect(warning).not.toHaveBeenCalled()
    expect(view.releaseImage).not.toHaveBeenCalled()
  })
})
