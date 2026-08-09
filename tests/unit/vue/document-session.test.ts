import { describe, expect, it, vi } from 'vitest'

import { DocumentSessionController } from '@cute-screen/editor-vue'
import {
  parseEditorDocument,
  serializeEditorDocument,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'

const document: EditorDocumentV1 = {
  schemaVersion: 1,
  id: '019c1f62-058e-7000-8000-000000000000',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 100,
    height: 100,
    orientationApplied: true,
    color: { colorSpace: 'srgb', hasIccProfile: false },
  },
  canvas: { width: 100, height: 100 },
  crop: null,
  layers: [],
  presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
}

describe('M03 document persistence session', () => {
  it('coalesces committed commands and retains dirty state until the matching save succeeds', async () => {
    vi.useFakeTimers()
    const saves: Array<{ readonly documentJson: string }> = []
    const saveDocument = async (record: { readonly documentJson: string }) => {
      saves.push(record)
      return 2
    }
    const session = new DocumentSessionController({
      document,
      revision: 1,
      bridge: { saveDocument },
      correlationId: () => 'test',
    })
    session.execute({
      type: 'addLayer',
      layer: {
        id: '019c1f62-058e-7000-8000-000000000001',
        kind: 'shape',
        transform: {
          translateX: 0,
          translateY: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        opacity: 1,
        visible: true,
        locked: false,
        payload: { shape: 'rectangle' },
      },
    })
    expect(session.snapshot.saveState).toBe('dirty')
    await vi.advanceTimersByTimeAsync(500)
    expect(saves).toHaveLength(1)
    expect(session.snapshot.saveState).toBe('saved')
    const saved = saves[0]
    if (!saved) throw new Error('save call missing')
    expect(parseEditorDocument(saved.documentJson)).toMatchObject({
      kind: 'editable',
    })
    expect(serializeEditorDocument(session.snapshot.core.document)).toBe(
      saved.documentJson,
    )
    vi.useRealTimers()
  })

  it('keeps the document in memory after a save error and retries explicitly', async () => {
    let attempts = 0
    const session = new DocumentSessionController({
      document,
      revision: 1,
      bridge: {
        saveDocument: async () => {
          attempts += 1
          if (attempts === 1) throw new Error('disk full')
          return 2
        },
      },
      correlationId: () => 'test',
    })
    session.execute({
      type: 'setCrop',
      before: null,
      after: { x: 0, y: 0, width: 80, height: 80 },
    })

    await session.flush()
    expect(session.snapshot.saveState).toBe('error')
    expect(session.snapshot.core.document.crop).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 80,
    })

    await session.retry()
    expect(attempts).toBe(2)
    expect(session.snapshot.saveState).toBe('saved')
  })
})
