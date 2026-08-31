import {
  DocumentSessionController,
  type EditorDocumentV1,
} from '@cute-screen/editor-vue'
import type { ShallowRef } from 'vue'
import type { AppHarnessConfig } from './app-harness-config'

export interface M05HarnessPorts {
  readonly documentSession: ShallowRef<DocumentSessionController | undefined>
  readonly sourceImage: ShallowRef<HTMLImageElement | undefined>
  readonly correlationId: () => string
  readonly installClipboardBridge: () => void
  readonly installHarnessFacade: () => void
}

export async function mountM05HarnessDocument(
  config: AppHarnessConfig,
  ports: M05HarnessPorts,
): Promise<void> {
  const dimensions = config.m05Viewport
    ? { width: 2560, height: 1440 }
    : config.m08
      ? { width: 400, height: 300 }
      : { width: 160, height: 120 }
  const session = new DocumentSessionController({
    document: createM05Document(dimensions, config.m08),
    revision: 0,
    debounceMs: 0,
    bridge: {
      saveDocument: async (record) => record.revision + 1,
      exportRecoveryBundle: async () => ({ kind: 'saved' }),
    },
    correlationId: ports.correlationId,
  })
  ports.documentSession.value = session
  window.__cuteScreenE2eM05 = {
    snapshot: () => ports.documentSession.value?.snapshot.core.document,
    versionToken: () => ports.documentSession.value?.snapshot.core.versionToken,
  }
  ports.sourceImage.value = config.m08SourceNotReady
    ? undefined
    : await loadM05HarnessImage(dimensions, config.m08SourceAlpha)
  ports.installClipboardBridge()
  ports.installHarnessFacade()
}

function loadM05HarnessImage(
  dimensions: Readonly<{ width: number; height: number }>,
  alpha: number,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener(
      'error',
      () => reject(new Error('M05 fixture failed')),
      { once: true },
    )
    image.src = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}"><rect width="100%" height="100%" fill="#273d5a" fill-opacity="${alpha / 255}"/></svg>`,
    )}`
  })
}

function createM05Document(
  dimensions: Readonly<{ width: number; height: number }>,
  m08: boolean,
): EditorDocumentV1 {
  const hash = 'f'.repeat(64)
  return {
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-000000000005',
    source: {
      blobHash: hash,
      format: 'svg',
      mimeType: 'image/svg+xml',
      width: dimensions.width,
      height: dimensions.height,
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: dimensions,
    crop: m08 ? null : { x: 20, y: 15, width: 100, height: 80 },
    layers: [baseImageLayer(hash, dimensions), ...fixtureShapes()],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  }
}

function baseImageLayer(
  hash: string,
  dimensions: Readonly<{ width: number; height: number }>,
): EditorDocumentV1['layers'][number] {
  return {
    id: '019c1f62-058e-7000-8000-000000000101',
    kind: 'image',
    localBounds: { x: 0, y: 0, ...dimensions },
    transform: {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    opacity: 1,
    blendMode: 'normal',
    shadows: [],
    visible: true,
    locked: true,
    payload: {
      blobHash: hash,
      intrinsicWidth: dimensions.width,
      intrinsicHeight: dimensions.height,
      format: 'svg',
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
      role: 'base',
      border: null,
      radius: 0,
      crop: null,
      mask: null,
    },
  }
}

function fixtureShapes(): EditorDocumentV1['layers'] {
  return [
    '019c1f62-058e-7000-8000-000000000102',
    '019c1f62-058e-7000-8000-000000000103',
    '019c1f62-058e-7000-8000-000000000104',
  ].map((id, index) => ({
    id,
    kind: 'shape' as const,
    localBounds: { x: 0, y: 0, width: 60, height: 40 },
    transform: {
      translateX: 40,
      translateY: 30,
      rotation: index * 5,
      scaleX: 1,
      scaleY: 1,
    },
    opacity: 1,
    blendMode: 'normal' as const,
    shadows: [],
    visible: true,
    locked: false,
    payload: {
      shape: 'rectangle' as const,
      fill: {
        kind: 'solid' as const,
        color: { red: 0.898, green: 0.282, blue: 0.302, alpha: 1 },
        opacity: 1,
      },
      stroke: {
        color: { red: 0.898, green: 0.282, blue: 0.302, alpha: 1 },
        width: 3,
        style: 'solid' as const,
        cap: 'round' as const,
        join: 'round' as const,
      },
      cornerRadius: 0,
      starPoints: 5,
      starInnerRatio: 0.45,
    },
  }))
}
