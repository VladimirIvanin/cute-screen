import {
  render,
  screen,
} from '@testing-library/vue'
import {
  expect,
  it,
  vi,
} from 'vitest'
import {
  nextTick,
  shallowRef,
} from 'vue'
import CardImagePreview from '../../../packages/editor-vue/src/shell/composition/CardImagePreview.vue'
import { compositionImagesKey } from '../../../packages/editor-vue/src/shell/composition/image-preview'

it('clears the old thumbnail during replacement and distinguishes loading from failure', async () => {
  const drawImage = vi.fn()
  const clearRect = vi.fn()
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, clearRect } as unknown as CanvasRenderingContext2D)
  const images = shallowRef<ReadonlyMap<string, HTMLImageElement>>(new Map())
  const error = shallowRef<string>()
  const first = { blobHash: 'a'.repeat(64), width: 3840, height: 2160, format: 'png' as const }
  const view = render(CardImagePreview, { props: { image: first, locale: 'en' },
    global: { provide: { [compositionImagesKey as symbol]: { images, error } } } })
  try {
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByRole('img')).toBeNull()
    const image = new Image()
    Object.defineProperties(image, { naturalWidth: { value: 3840 }, naturalHeight: { value: 2160 } })
    images.value = new Map([[first.blobHash, image]])
    await nextTick()
    expect(screen.getByRole('img', { name: 'Background image preview' })).toBeVisible()
    expect(drawImage).toHaveBeenLastCalledWith(image, 0, 15, 160, 90)
    const clears = clearRect.mock.calls.length
    await view.rerender({ image: { ...first, blobHash: 'b'.repeat(64) } })
    expect(clearRect.mock.calls.length).toBeGreaterThan(clears)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    error.value = 'Texture unavailable'
    await nextTick()
    expect(screen.getByRole('status')).toHaveTextContent('No preview')
    await view.rerender({ locale: 'ru' })
    expect(screen.getByRole('status')).toHaveTextContent('Нет превью')
  } finally {
    view.unmount()
    context.mockRestore()
  }
})
