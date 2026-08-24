import { describe, expect, it, vi } from 'vitest'

import {
  describeError,
  DocumentSessionController,
  DocumentSessionCoordinator,
} from '@cute-screen/editor-vue'
import {
  createDrawingLayer,
  defaultDrawingToolPreferences,
  parseEditorDocument,
  parseDrawingToolPreferences,
  serializeEditorDocument,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'

const document: EditorDocumentV1 = {
  schemaVersion: 7,
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
  it('describes an unsupported native document schema without object stringification', () => {
    const message = describeError(
      { olderSchema: { schema_version: 4 } },
      'Unable to open the document.',
    )

    expect(message).toBe(
      'This document uses unsupported schema version 4. Capture or open an image to continue.',
    )
  })

  it('opens legacy non-image scale normalized without dirty state or history', () => {
    const layer = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-000000000088',
      tool: 'shape',
      start: { x: 10, y: 10 },
      end: { x: 60, y: 40 },
    })!
    const session = new DocumentSessionController({
      document: {
        ...document,
        layers: [
          {
            ...layer,
            transform: { ...layer.transform, scaleX: -2, scaleY: 0.5 },
          },
        ],
      },
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'legacy-normalization',
    })

    expect(session.snapshot.core.document.layers[0]!.transform).toMatchObject({
      scaleX: 1,
      scaleY: 1,
    })
    expect(session.snapshot.core.dirty).toBe(false)
    expect(session.snapshot.core.canUndo).toBe(false)
    expect(session.snapshot.saveState).toBe('saved')
  })

  it('does not autosave a command that leaves the committed document unchanged', async () => {
    vi.useFakeTimers()
    const saveDocument = vi.fn(async () => 2)
    const session = new DocumentSessionController({
      document,
      revision: 1,
      bridge: {
        saveDocument,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'no-op',
    })

    session.execute({ type: 'setCrop', before: null, after: null })
    await vi.advanceTimersByTimeAsync(500)

    expect(saveDocument).not.toHaveBeenCalled()
    expect(session.snapshot.saveState).toBe('saved')
    vi.useRealTimers()
  })

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
      bridge: {
        saveDocument,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
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
        localBounds: { x: 0, y: 0, width: 20, height: 20 },
        opacity: 1,
        blendMode: 'normal',
        shadows: [],
        visible: true,
        locked: false,
        payload: {
          shape: 'rectangle',
          fill: { kind: 'none' },
          stroke: {
            color: { red: 0, green: 0, blue: 0, alpha: 1 },
            width: 1,
            style: 'solid',
            cap: 'round',
            join: 'round',
          },
          cornerRadius: 0,
          starPoints: 5,
          starInnerRatio: 0.45,
        },
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

  it('autosaves a serializable Arrow created from recovered corrupt preferences', async () => {
    vi.useFakeTimers()
    const fallback = defaultDrawingToolPreferences().defaults.arrow
    const fallbackStroke = fallback.stroke as Record<string, unknown>
    const preferences = parseDrawingToolPreferences({
      schemaVersion: 2,
      defaults: {
        arrow: {
          ...fallback,
          path: 'elbow',
          elbow: { axis: 'z', offset: Number.NaN },
          stroke: {
            ...fallbackStroke,
            width: 0,
            style: 'zigzag',
            color: { red: 2, green: 0, blue: 0, alpha: 1 },
          },
        },
      },
      recentColors: [],
    })
    const arrow = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-0000000000f2',
      tool: 'arrow',
      start: { x: 10, y: 10 },
      end: { x: 80, y: 40 },
      defaults: preferences.defaults,
    })
    if (!arrow) throw new Error('expected recovered Arrow')
    const saveDocument = vi.fn(
      async (record: { readonly documentJson: string }) => {
        expect(parseEditorDocument(record.documentJson)).toMatchObject({
          kind: 'editable',
        })
        return 2
      },
    )
    const session = new DocumentSessionController({
      document,
      revision: 1,
      bridge: {
        saveDocument,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'recovered-arrow-autosave',
    })

    session.execute({ type: 'addLayer', layer: arrow })
    await vi.advanceTimersByTimeAsync(500)

    expect(saveDocument).toHaveBeenCalledTimes(1)
    expect(session.snapshot.saveState).toBe('saved')
    session.dispose()
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
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
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

  it('uses a native structured error message instead of stringifying the object', async () => {
    const session = new DocumentSessionController({
      document,
      revision: 1,
      bridge: {
        saveDocument: async () => {
          throw { message: 'The document revision is stale.' }
        },
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'structured-native-error',
    })
    session.execute({
      type: 'setCrop',
      before: null,
      after: { x: 0, y: 0, width: 80, height: 80 },
    })

    await expect(session.flush()).resolves.toEqual({
      kind: 'failed',
      error: 'The document revision is stale.',
    })
    expect(session.snapshot.error).toBe('The document revision is stale.')
  })

  it('does not treat a save from an abandoned undo branch as current', async () => {
    let resolveFirst: ((revision: number) => void) | undefined
    let calls = 0
    const session = new DocumentSessionController({
      document,
      revision: 1,
      debounceMs: 60_000,
      bridge: {
        saveDocument: async () =>
          ++calls === 1
            ? new Promise<number>((resolve) => {
                resolveFirst = resolve
              })
            : 3,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'test',
    })
    session.execute({
      type: 'addLayer',
      layer: {
        id: '019c1f62-058e-7000-8000-000000000010',
        kind: 'shape',
        transform: {
          translateX: 0,
          translateY: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        localBounds: { x: 0, y: 0, width: 20, height: 20 },
        opacity: 1,
        blendMode: 'normal',
        shadows: [],
        visible: true,
        locked: false,
        payload: {
          shape: 'rectangle',
          fill: { kind: 'none' },
          stroke: {
            color: { red: 0, green: 0, blue: 0, alpha: 1 },
            width: 1,
            style: 'solid',
            cap: 'round',
            join: 'round',
          },
          cornerRadius: 0,
          starPoints: 5,
          starInnerRatio: 0.45,
        },
      },
    })
    const firstSave = session.flush()
    await Promise.resolve()
    if (!resolveFirst) throw new Error('save did not start')

    session.undo()
    session.execute({
      type: 'setCrop',
      before: null,
      after: { x: 0, y: 0, width: 80, height: 80 },
    })
    resolveFirst(2)
    await firstSave

    expect(session.snapshot.core.dirty).toBe(false)
    expect(session.snapshot.saveState).toBe('saved')
    expect(calls).toBe(2)
    session.dispose()
  })

  it('retains the old session when a handoff flush fails and switches on retry', async () => {
    let shouldFail = true
    let active: DocumentSessionController | undefined
    const coordinator = new DocumentSessionCoordinator({
      bridge: {
        saveDocument: async () => {
          if (shouldFail) throw new Error('disk full')
          return 2
        },
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'handoff',
      onActiveSession: (session) => {
        active = session
      },
    })
    coordinator.openInitial({ documentId: document.id, document, revision: 1 })
    const old = active
    if (!old) throw new Error('initial session missing')
    old.execute({
      type: 'setCrop',
      before: null,
      after: { x: 0, y: 0, width: 80, height: 80 },
    })
    const incoming = {
      ...document,
      id: '019c1f62-058e-7000-8000-000000000099',
    }

    await expect(
      coordinator.handoff({
        documentId: incoming.id,
        document: incoming,
        revision: 1,
      }),
    ).resolves.toMatchObject({ kind: 'failed' })
    expect(active).toBe(old)
    expect(coordinator.pending?.documentId).toBe(incoming.id)

    shouldFail = false
    await expect(coordinator.retryPendingHandoff()).resolves.toEqual({
      kind: 'switched',
    })
    expect(active?.snapshot.core.document.id).toBe(incoming.id)
  })

  it('returns a typed recovery export outcome without discarding the document', async () => {
    const session = new DocumentSessionController({
      document,
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'cancelled' }),
      },
      correlationId: () => 'recovery',
    })
    session.execute({
      type: 'setCrop',
      before: null,
      after: { x: 0, y: 0, width: 80, height: 80 },
    })

    await expect(session.exportRecoveryBundle()).resolves.toEqual({
      kind: 'cancelled',
    })
    expect(session.snapshot.core.document.crop).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 80,
    })
  })
})
