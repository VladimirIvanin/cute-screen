import { createEditorDocumentFromImage } from '@cute-screen/editor-renderer'

export function compositionFixture() {
  return createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000', baseLayerId: '019c1f62-058e-7000-8000-000000000001',
    timestamp: '2026-10-20T00:00:00Z', source: { blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', provenance: 'fileOpen',
      width: 3840, height: 2160, orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
}
