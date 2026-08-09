import { describe, expect, it } from 'vitest'

import {
  CommandManager,
  TransientEditorStateController,
  type EditorDocumentV1,
} from './index'

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

describe('TransientEditorStateController', () => {
  it('cancels a draft without changing committed history', () => {
    const manager = new CommandManager(document)
    const transient = new TransientEditorStateController<{ x: number }>()
    transient.beginDraft({ x: 1 })

    transient.cancelDraft()

    expect({ transient: transient.snapshot, core: manager.snapshot }).toEqual({
      transient: { selectionIds: [], draft: null },
      core: expect.objectContaining({ dirty: false, canUndo: false }),
    })
  })

  it('commits exactly one command and clears the draft only after success', () => {
    const manager = new CommandManager(document)
    const transient = new TransientEditorStateController<{ crop: number }>()
    transient.beginDraft({ crop: 80 })

    transient.commitDraft(manager, {
      type: 'setCrop',
      before: null,
      after: { x: 0, y: 0, width: 80, height: 80 },
    })

    expect({ transient: transient.snapshot, core: manager.snapshot }).toEqual({
      transient: { selectionIds: [], draft: null },
      core: expect.objectContaining({ dirty: true, canUndo: true }),
    })
  })
})
