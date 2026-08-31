import type { EditorDocumentV1 } from '../types'

export const documentFixture: EditorDocumentV1 = {
  schemaVersion: 7,
  id: '019c1f62-058e-7000-8000-000000000000',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 640,
    height: 480,
    orientationApplied: true,
    provenance: 'capture',
    color: { colorSpace: 'srgb', hasIccProfile: false },
  },
  canvas: { width: 800, height: 600 },
  crop: null,
  layers: [
    {
      id: '019c1f62-058e-7000-8000-000000000001',
      kind: 'image',
      localBounds: { x: 0, y: 0, width: 640, height: 480 },
      transform: {
        translateX: 12,
        translateY: 16,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      opacity: 1,
      visible: true,
      locked: true,
      blendMode: 'normal',
      shadows: [],
      payload: {
        blobHash: 'a'.repeat(64),
        intrinsicWidth: 640,
        intrinsicHeight: 480,
        format: 'png',
        orientationApplied: true,
        color: { colorSpace: 'srgb', hasIccProfile: false },
        role: 'base',
      },
    },
  ],
  presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}
