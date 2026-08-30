import { ref, type Ref } from 'vue'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'

export const EYEDROPPER_GRID_SIZE = 9
const GRID_RADIUS = Math.floor(EYEDROPPER_GRID_SIZE / 2)
const CARD_FALLBACK_WIDTH = 286
const CARD_FALLBACK_HEIGHT = 88
const CARD_GAP = 18
const VIEWPORT_MARGIN = 8

type PreviewState = 'opaque' | 'unavailable' | 'loading' | 'error'
interface PreviewRequest {
  readonly point: CanvasPoint
  readonly clientX: number
  readonly clientY: number
}

export interface EyedropperPorts {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly viewportRoot: Ref<HTMLElement | undefined>
  readonly scrollContainer: Ref<HTMLDivElement | undefined>
  readonly outputBounds: Ref<ViewportOutputBounds | undefined>
  readonly canvasPoint: (event: {
    readonly clientX: number
    readonly clientY: number
  }) => CanvasPoint | undefined
}

function pixelHex(data: Uint8ClampedArray, offset = 0): string {
  return `#${[data[offset], data[offset + 1], data[offset + 2]]
    .map((channel) => (channel ?? 0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

function samplingError(english: string, russian: string): string {
  return document.documentElement.lang === 'ru' ? russian : english
}

export class EyedropperController {
  readonly loupe = ref<HTMLElement>()
  readonly preview = ref<HTMLCanvasElement>()
  readonly swatch = ref<HTMLElement>()
  readonly hex = ref<HTMLElement>()
  readonly hint = ref<HTMLElement>()
  readonly cursor = ref<CanvasPoint>()
  readonly #ports: EyedropperPorts
  #pending: PreviewRequest | undefined
  #frame: number | undefined
  #lastPreviewKey: string | undefined
  #warned = false

  constructor(ports: EyedropperPorts) {
    this.#ports = ports
  }

  #scenePixel(
    point: CanvasPoint,
  ): Readonly<{ x: number; y: number }> | undefined {
    const canvas = this.#ports.scene.value
    const bounds = this.#ports.outputBounds.value
    if (!canvas || !bounds || canvas.width <= 0 || canvas.height <= 0) {
      return undefined
    }
    return {
      x: Math.max(
        0,
        Math.min(canvas.width - 1, Math.round(point.x - bounds.x)),
      ),
      y: Math.max(
        0,
        Math.min(canvas.height - 1, Math.round(point.y - bounds.y)),
      ),
    }
  }

  #samplingClientPoint(
    point: CanvasPoint,
  ): Readonly<{ clientX: number; clientY: number }> | undefined {
    const canvas = this.#ports.scene.value
    const bounds = this.#ports.outputBounds.value
    if (!canvas || !bounds || canvas.width <= 0 || canvas.height <= 0) {
      return undefined
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return undefined
    return {
      clientX:
        rect.left + ((point.x - bounds.x + 0.5) * rect.width) / canvas.width,
      clientY:
        rect.top + ((point.y - bounds.y + 0.5) * rect.height) / canvas.height,
    }
  }

  #position(request: PreviewRequest): void {
    const root = this.#ports.viewportRoot.value
    const loupe = this.loupe.value
    if (!root || !loupe) return
    const rootRect = root.getBoundingClientRect()
    const width = loupe.offsetWidth || CARD_FALLBACK_WIDTH
    const height = loupe.offsetHeight || CARD_FALLBACK_HEIGHT
    const localX = request.clientX - rootRect.left
    const localY = request.clientY - rootRect.top
    const right = localX + CARD_GAP
    const left = localX - CARD_GAP - width
    const below = localY + CARD_GAP
    const above = localY - CARD_GAP - height
    const horizontal =
      right + width <= rootRect.width - VIEWPORT_MARGIN ? 'right' : 'left'
    const vertical =
      below + height <= rootRect.height - VIEWPORT_MARGIN ? 'below' : 'above'
    const maxLeft = Math.max(
      VIEWPORT_MARGIN,
      rootRect.width - width - VIEWPORT_MARGIN,
    )
    const maxTop = Math.max(
      VIEWPORT_MARGIN,
      rootRect.height - height - VIEWPORT_MARGIN,
    )
    const x = Math.max(
      VIEWPORT_MARGIN,
      Math.min(maxLeft, horizontal === 'right' ? right : left),
    )
    const y = Math.max(
      VIEWPORT_MARGIN,
      Math.min(maxTop, vertical === 'below' ? below : above),
    )
    loupe.dataset.horizontalPlacement = horizontal
    loupe.dataset.verticalPlacement = vertical
    loupe.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  }

  #setState(state: PreviewState, hex?: string): void {
    if (this.loupe.value) this.loupe.value.dataset.state = state
    if (this.hex.value) this.hex.value.textContent = hex ?? '—'
    if (this.swatch.value) {
      this.swatch.value.hidden = !hex
      this.swatch.value.style.backgroundColor = hex ?? 'transparent'
    }
    if (!this.hint.value) return
    this.hint.value.textContent =
      state === 'opaque'
        ? this.#ports.props.t('eyedropperClickToSample')
        : state === 'unavailable'
          ? this.#ports.props.t('eyedropperNoOpaqueColour')
          : state === 'loading'
            ? this.#ports.props.t('eyedropperPreviewLoading')
            : this.#ports.props.t('eyedropperPreviewUnavailable')
  }

  #copyPreviewPixels(
    canvas: HTMLCanvasElement,
    previewContext: CanvasRenderingContext2D,
    pixel: Readonly<{ x: number; y: number }>,
  ): void {
    const sourceX = Math.max(0, pixel.x - GRID_RADIUS)
    const sourceY = Math.max(0, pixel.y - GRID_RADIUS)
    const sourceRight = Math.min(canvas.width, pixel.x + GRID_RADIUS + 1)
    const sourceBottom = Math.min(canvas.height, pixel.y + GRID_RADIUS + 1)
    const sourceWidth = sourceRight - sourceX
    const sourceHeight = sourceBottom - sourceY
    const sourceContext = canvas.getContext('2d')
    if (!sourceContext) return this.#setState('error')
    const pixels = sourceContext.getImageData(
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    )
    previewContext.putImageData(
      pixels,
      sourceX - (pixel.x - GRID_RADIUS),
      sourceY - (pixel.y - GRID_RADIUS),
    )
    const centerOffset =
      ((pixel.y - sourceY) * sourceWidth + (pixel.x - sourceX)) * 4
    this.#setState(
      pixels.data[centerOffset + 3] === 255 ? 'opaque' : 'unavailable',
      pixels.data[centerOffset + 3] === 255
        ? pixelHex(pixels.data, centerOffset)
        : undefined,
    )
  }

  #render(request: PreviewRequest): void {
    const canvas = this.#ports.scene.value
    const preview = this.preview.value
    const loupe = this.loupe.value
    const pixel = this.#scenePixel(request.point)
    if (!canvas || !preview || !loupe || !pixel) return
    loupe.style.visibility = 'visible'
    this.#position(request)
    const key = `${pixel.x}:${pixel.y}:${this.#ports.props.samplingBlocked ? 'blocked' : 'ready'}`
    if (key === this.#lastPreviewKey) return
    this.#lastPreviewKey = key
    const context = preview.getContext('2d')
    if (!context?.clearRect || !context.putImageData)
      return this.#setState('error')
    context.clearRect(0, 0, EYEDROPPER_GRID_SIZE, EYEDROPPER_GRID_SIZE)
    if (this.#ports.props.samplingBlocked) return this.#setState('loading')
    try {
      this.#copyPreviewPixels(canvas, context, pixel)
    } catch (error) {
      if (!this.#warned) {
        this.#warned = true
        console.warn('cute-screen eyedropper preview read failed', error)
      }
      this.#setState('error')
    }
  }

  schedule(
    point: CanvasPoint,
    client = this.#samplingClientPoint(point),
  ): void {
    if (!this.#ports.props.sampling || !client) return
    this.#pending = { point, clientX: client.clientX, clientY: client.clientY }
    if (this.#frame !== undefined) return
    this.#frame = -1
    const frame = window.requestAnimationFrame(() => {
      this.#frame = undefined
      const request = this.#pending
      this.#pending = undefined
      if (request && this.#ports.props.sampling) this.#render(request)
    })
    if (this.#frame !== undefined) this.#frame = frame
  }

  hide(): void {
    this.#pending = undefined
    this.#lastPreviewKey = undefined
    if (this.#frame !== undefined && this.#frame >= 0) {
      window.cancelAnimationFrame(this.#frame)
    }
    this.#frame = undefined
    if (this.loupe.value) this.loupe.value.style.visibility = 'hidden'
  }

  resetCache(resetWarning = false): void {
    this.#lastPreviewKey = undefined
    if (resetWarning) this.#warned = false
  }

  sample(point: CanvasPoint): void {
    const canvas = this.#ports.scene.value
    if (!canvas) {
      this.#ports.emit(
        'colorSampleError',
        samplingError(
          'Canvas is unavailable for colour sampling',
          'Холст недоступен для выбора цвета',
        ),
      )
      return
    }
    if (this.#ports.props.samplingBlocked) {
      this.#ports.emit(
        'colorSampleError',
        samplingError(
          'Scene textures are still loading; try again when the canvas is ready',
          'Текстуры сцены ещё загружаются; повторите, когда холст будет готов',
        ),
      )
      return
    }
    const pixel = this.#scenePixel(point)
    if (!pixel) return
    try {
      const data = canvas
        .getContext('2d')
        ?.getImageData(pixel.x, pixel.y, 1, 1).data
      if (!data || data[3] !== 255) {
        this.#ports.emit(
          'colorSampleError',
          samplingError(
            'There is no opaque colour at this point',
            'В этой точке нет непрозрачного цвета',
          ),
        )
        return
      }
      this.#ports.emit('colorSample', pixelHex(data))
    } catch (error) {
      console.warn('cute-screen scene colour sampling failed', error)
      this.#ports.emit(
        'colorSampleError',
        samplingError(
          'The canvas colour could not be read',
          'Не удалось прочитать цвет с холста',
        ),
      )
    }
  }

  visibleCanvasCenter(): CanvasPoint | undefined {
    const container = this.#ports.scrollContainer.value
    if (!container) return undefined
    const viewport = container.getBoundingClientRect()
    return this.#ports.canvasPoint({
      clientX: viewport.left + viewport.width / 2,
      clientY: viewport.top + viewport.height / 2,
    })
  }

  initialCursor(): CanvasPoint | undefined {
    const bounds = this.#ports.outputBounds.value
    if (!bounds) return undefined
    return (
      this.visibleCanvasCenter() ?? {
        x: bounds.x + Math.max(0, (bounds.width - 1) / 2),
        y: bounds.y + Math.max(0, (bounds.height - 1) / 2),
      }
    )
  }
}
