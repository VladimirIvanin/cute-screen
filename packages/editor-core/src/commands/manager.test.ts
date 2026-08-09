import { describe, expect, it } from 'vitest'

import { CommandManager, type EditorDocumentV1, type LayerNode } from '../index'

const DOCUMENT_ID = '019c1f62-058e-7000-8000-000000000000'
const BASE_ID = '019c1f62-058e-7000-8000-000000000001'
const FIRST_ID = '019c1f62-058e-7000-8000-000000000002'
const SECOND_ID = '019c1f62-058e-7000-8000-000000000003'
const BRANCH_ID = '019c1f62-058e-7000-8000-000000000004'

const baseLayer: LayerNode = {
  id: BASE_ID,
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
}

const document: EditorDocumentV1 = {
  schemaVersion: 1,
  id: DOCUMENT_ID,
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
  layers: [baseLayer],
  presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
}

describe('CommandManager history identity', () => {
  it('does not reuse a version token after undo and a new branch', () => {
    const manager = new CommandManager(document)
    const first = manager.execute({
      type: 'addLayer',
      layer: { ...baseLayer, id: FIRST_ID },
    }).versionToken

    manager.undo()
    const branch = manager.execute({
      type: 'addLayer',
      layer: { ...baseLayer, id: BRANCH_ID },
    }).versionToken

    expect(branch).not.toBe(first)
    manager.markSaved(first)
    expect(manager.snapshot.dirty).toBe(true)
  })

  it('trims old history entries and clears redo after a new branch', () => {
    const manager = new CommandManager(document, { maxEntries: 1 })
    manager.execute({ type: 'addLayer', layer: { ...baseLayer, id: FIRST_ID } })
    manager.execute({
      type: 'addLayer',
      layer: { ...baseLayer, id: SECOND_ID },
    })

    expect(manager.undo().document.layers.map(({ id }) => id)).toEqual([
      BASE_ID,
      FIRST_ID,
    ])
    expect(manager.snapshot.canUndo).toBe(false)
    expect(manager.redo().document.layers.map(({ id }) => id)).toEqual([
      BASE_ID,
      FIRST_ID,
      SECOND_ID,
    ])
    manager.undo()
    manager.execute({
      type: 'addLayer',
      layer: { ...baseLayer, id: BRANCH_ID },
    })
    expect(manager.snapshot.canRedo).toBe(false)
  })

  it('rejects invalid history limits and unknown saved tokens', () => {
    expect(() => new CommandManager(document, { maxEntries: 0 })).toThrow(
      /maxEntries/u,
    )
    const manager = new CommandManager(document)
    expect(() => manager.markSaved(1)).toThrow(/versionToken/u)
  })

  it('does not create history or dirty state for a no-op crop command', () => {
    const manager = new CommandManager(document)

    const snapshot = manager.execute({
      type: 'setCrop',
      before: null,
      after: null,
    })

    expect(snapshot).toMatchObject({
      canUndo: false,
      canRedo: false,
      dirty: false,
      versionToken: 0,
    })
  })
})
