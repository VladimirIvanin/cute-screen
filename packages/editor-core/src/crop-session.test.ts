import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  CROP_RESIZE_HANDLES,
  CommandManager,
  applyCropSession,
  applyEditorCommand,
  cancelCropSession,
  createCropSession,
  createFlipCanvasCommand,
  moveCrop,
  nudgeCrop,
  resetCrop,
  resizeCrop,
  revertEditorCommand,
  setCropPreset,
  type CropPreset,
  type EditorDocument,
  type ImageLayer,
  type Rect,
} from './index'

const DOCUMENT_ID = '019c1f62-058e-7000-8000-000000000000'
const BASE_ID = '019c1f62-058e-7000-8000-000000000001'

function baseLayer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: BASE_ID,
    kind: 'image',
    transform: {
      translateX: 200,
      translateY: -40,
      rotation: 18,
      scaleX: 0.25,
      scaleY: 0.5,
    },
    localBounds: { x: 0, y: 0, width: 1_920, height: 1_080 },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: {
      blobHash: 'a'.repeat(64),
      intrinsicWidth: 1_920,
      intrinsicHeight: 1_080,
      format: 'png',
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
      role: 'base',
      border: null,
      radius: 0,
      crop: null,
      mask: null,
    },
    ...overrides,
  }
}

function editorDocument({
  canvas = { width: 400, height: 300 },
  crop = null,
  layers = [baseLayer()],
}: {
  readonly canvas?: Readonly<{ width: number; height: number }>
  readonly crop?: Rect | null
  readonly layers?: EditorDocument['layers']
} = {}): EditorDocument {
  return {
    schemaVersion: 7,
    id: DOCUMENT_ID,
    source: {
      blobHash: 'a'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 1_920,
      height: 1_080,
      orientationApplied: true,
      provenance: 'capture',
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas,
    crop,
    layers,
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  }
}

function expectInsideCanvas(
  crop: Rect,
  canvas: Readonly<{ width: number; height: number }>,
): void {
  expect(crop.x).toBeGreaterThanOrEqual(0)
  expect(crop.y).toBeGreaterThanOrEqual(0)
  expect(crop.width).toBeGreaterThan(0)
  expect(crop.height).toBeGreaterThan(0)
  expect(crop.x + crop.width).toBeLessThanOrEqual(canvas.width)
  expect(crop.y + crop.height).toBeLessThanOrEqual(canvas.height)
}

describe('crop session canvas contract', () => {
  it('derives its bounds and original ratio only from document.canvas', () => {
    const movedBase = editorDocument()
    const deletedBase = editorDocument({ layers: [] })
    const resizedBase = editorDocument({
      layers: [
        baseLayer({
          localBounds: { x: 0, y: 0, width: 12, height: 9 },
          transform: {
            translateX: -500,
            translateY: 900,
            rotation: 77,
            scaleX: 9,
            scaleY: 0.1,
          },
        }),
      ],
    })

    for (const document of [movedBase, deletedBase, resizedBase]) {
      const session = createCropSession(document)
      expect(session.canvas).toEqual({ width: 400, height: 300 })
      expect(session.originalAspectRatio).toBe(4 / 3)
      expect(session.crop).toEqual({ x: 0, y: 0, width: 400, height: 300 })
    }
  })

  it('reopens the committed crop without changing the document', () => {
    const crop = { x: 20, y: 30, width: 160, height: 90 }
    const document = editorDocument({ crop })
    const before = structuredClone(document)

    const session = createCropSession(document)

    expect(session.initialCrop).toEqual(crop)
    expect(session.crop).toEqual(crop)
    expect(session.preset).toBe('free')
    expect(document).toEqual(before)
    expect(Object.isFrozen(session)).toBe(true)
    expect(Object.isFrozen(session.crop)).toBe(true)
  })

  it('rejects a session until finite positive production canvas dimensions exist', () => {
    expect(() =>
      createCropSession(editorDocument({ canvas: { width: 0, height: 300 } })),
    ).toThrow(/canvas/u)
    expect(() =>
      createCropSession(
        editorDocument({ canvas: { width: 400, height: Number.NaN } }),
      ),
    ).toThrow(/canvas/u)
  })
})

describe('crop presets', () => {
  it.each([
    ['1:1', { x: 50, y: 0, width: 300, height: 300 }],
    ['4:3', { x: 0, y: 0, width: 400, height: 300 }],
    ['16:9', { x: 0, y: 37.5, width: 400, height: 225 }],
    ['original', { x: 0, y: 0, width: 400, height: 300 }],
  ] as const)('applies the %s preset deterministically', (preset, expected) => {
    expect(
      setCropPreset(createCropSession(editorDocument()), preset).crop,
    ).toEqual(expected)
  })

  it('keeps free geometry and fits original ratio inside a reopened crop', () => {
    const session = createCropSession(
      editorDocument({ crop: { x: 100, y: 50, width: 200, height: 200 } }),
    )

    expect(setCropPreset(session, 'free').crop).toEqual(session.crop)
    expect(setCropPreset(session, 'original').crop).toEqual({
      x: 100,
      y: 75,
      width: 200,
      height: 150,
    })
  })

  it('keeps every fixed preset positive, bounded and at its exact ratio', () => {
    const presets: readonly Exclude<CropPreset, 'free'>[] = [
      '1:1',
      '4:3',
      '16:9',
      'original',
    ]
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8_192 }),
        fc.integer({ min: 1, max: 8_192 }),
        fc.constantFrom(...presets),
        (width, height, preset) => {
          const session = setCropPreset(
            createCropSession(editorDocument({ canvas: { width, height } })),
            preset,
          )
          const expectedRatio =
            preset === '1:1'
              ? 1
              : preset === '4:3'
                ? 4 / 3
                : preset === '16:9'
                  ? 16 / 9
                  : width / height
          expectInsideCanvas(session.crop, session.canvas)
          expect(session.crop.width / session.crop.height).toBeCloseTo(
            expectedRatio,
            10,
          )
        },
      ),
    )
  })
})

describe('crop manipulation', () => {
  it('moves and nudges without changing size or escaping the canvas', () => {
    const session = createCropSession(
      editorDocument({ crop: { x: 20, y: 10, width: 60, height: 40 } }),
    )

    expect(moveCrop(session, { x: 500, y: -500 }).crop).toEqual({
      x: 340,
      y: 0,
      width: 60,
      height: 40,
    })
    expect(nudgeCrop(session, 'right').crop.x).toBe(21)
    expect(nudgeCrop(session, 'down', 10).crop.y).toBe(20)
    expect(nudgeCrop(session, 'left', 30).crop.x).toBe(0)
  })

  it('resizes every free edge/corner with a one-unit minimum', () => {
    const session = createCropSession(
      editorDocument({
        canvas: { width: 100, height: 80 },
        crop: { x: 20, y: 10, width: 60, height: 50 },
      }),
    )

    expect(resizeCrop(session, 'east', { x: 50, y: 0 }).crop).toEqual({
      x: 20,
      y: 10,
      width: 80,
      height: 50,
    })
    expect(resizeCrop(session, 'west', { x: 100, y: 0 }).crop).toEqual({
      x: 79,
      y: 10,
      width: 1,
      height: 50,
    })
    expect(resizeCrop(session, 'southEast', { x: 100, y: 100 }).crop).toEqual({
      x: 20,
      y: 10,
      width: 80,
      height: 70,
    })
    expect(resizeCrop(session, 'northWest', { x: 100, y: 100 }).crop).toEqual({
      x: 79,
      y: 59,
      width: 1,
      height: 1,
    })
  })

  it('preserves a fixed ratio for edge and corner resize', () => {
    const square = setCropPreset(
      createCropSession(editorDocument({ canvas: { width: 120, height: 80 } })),
      '1:1',
    )

    expect(resizeCrop(square, 'east', { x: -30, y: 999 }).crop).toEqual({
      x: 20,
      y: 15,
      width: 50,
      height: 50,
    })
    expect(resizeCrop(square, 'southEast', { x: -20, y: -20 }).crop).toEqual({
      x: 20,
      y: 0,
      width: 60,
      height: 60,
    })
  })

  it('enforces a configured minimum when the canvas can contain it', () => {
    const session = createCropSession(
      editorDocument({
        canvas: { width: 100, height: 80 },
        crop: { x: 20, y: 10, width: 60, height: 50 },
      }),
      { minimumSize: 16 },
    )

    expect(resizeCrop(session, 'northWest', { x: 100, y: 100 }).crop).toEqual({
      x: 64,
      y: 44,
      width: 16,
      height: 16,
    })
    const fixed = resizeCrop(setCropPreset(session, '16:9'), 'southEast', {
      x: -1_000,
      y: -1_000,
    }).crop
    expect(fixed.width).toBeGreaterThanOrEqual(16)
    expect(fixed.height).toBeGreaterThanOrEqual(16)
  })

  it('keeps generated free manipulation inside the canvas', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.constantFrom(
          'north',
          'northEast',
          'east',
          'southEast',
          'south',
          'southWest',
          'west',
          'northWest',
        ),
        (x, y, handle) => {
          const session = createCropSession(
            editorDocument({ crop: { x: 40, y: 30, width: 200, height: 120 } }),
          )
          const resized = resizeCrop(session, handle, { x, y }).crop
          expectInsideCanvas(resized, session.canvas)
          expect(resized.width).toBeGreaterThanOrEqual(1)
          expect(resized.height).toBeGreaterThanOrEqual(1)
          expectInsideCanvas(moveCrop(session, { x, y }).crop, session.canvas)
        },
      ),
    )
  })

  it('keeps generated fixed-ratio resizing bounded and ratio-stable', () => {
    const presets = ['1:1', '4:3', '16:9', 'original'] as const
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.constantFrom(...CROP_RESIZE_HANDLES),
        fc.constantFrom(...presets),
        (x, y, handle, preset) => {
          const session = setCropPreset(
            createCropSession(editorDocument()),
            preset,
          )
          const resized = resizeCrop(session, handle, { x, y }).crop
          const ratio =
            preset === '1:1'
              ? 1
              : preset === '4:3'
                ? 4 / 3
                : preset === '16:9'
                  ? 16 / 9
                  : 4 / 3
          expectInsideCanvas(resized, session.canvas)
          expect(resized.width).toBeGreaterThanOrEqual(1)
          expect(resized.height).toBeGreaterThanOrEqual(1)
          expect(resized.width / resized.height).toBeCloseTo(ratio, 10)
        },
      ),
    )
  })

  it('keeps fixed-ratio resizing stable across generated canvas sizes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8_192 }),
        fc.integer({ min: 1, max: 8_192 }),
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.constantFrom(...CROP_RESIZE_HANDLES),
        fc.constantFrom('1:1', '4:3', '16:9', 'original'),
        (width, height, x, y, handle, preset) => {
          const session = setCropPreset(
            createCropSession(editorDocument({ canvas: { width, height } })),
            preset,
          )
          const resized = resizeCrop(session, handle, { x, y }).crop
          const ratio =
            preset === '1:1'
              ? 1
              : preset === '4:3'
                ? 4 / 3
                : preset === '16:9'
                  ? 16 / 9
                  : width / height
          expectInsideCanvas(resized, session.canvas)
          expect(resized.width / resized.height).toBeCloseTo(ratio, 10)
        },
      ),
    )
  })
})

describe('crop completion and history', () => {
  it('resets to full canvas, canonicalizes apply to null and cancels without a command', () => {
    const document = editorDocument({
      crop: { x: 10, y: 20, width: 100, height: 80 },
    })
    const session = createCropSession(document)
    const reset = resetCrop(session)

    expect(reset.crop).toEqual({ x: 0, y: 0, width: 400, height: 300 })
    expect(reset.preset).toBe('free')
    expect(applyCropSession(reset)).toEqual({
      type: 'setCrop',
      before: document.crop,
      after: null,
    })
    expect(cancelCropSession(session)).toBeNull()
    expect(document.crop).toEqual({ x: 10, y: 20, width: 100, height: 80 })
  })

  it('applies as exactly one existing setCrop command and is no-op/history safe', () => {
    const document = editorDocument()
    const manager = new CommandManager(document)

    manager.execute(applyCropSession(createCropSession(document)))
    expect(manager.snapshot).toMatchObject({
      canUndo: false,
      dirty: false,
      versionToken: 0,
    })

    const square = setCropPreset(createCropSession(document), '1:1')
    const command = applyCropSession(square)
    expect(command.type).toBe('setCrop')
    manager.execute(command)
    expect(manager.snapshot).toMatchObject({
      canUndo: true,
      dirty: true,
      versionToken: 1,
    })
    expect(manager.snapshot.document.crop).toEqual(square.crop)
    expect(manager.undo().document.crop).toBeNull()
    expect(manager.redo().document.crop).toEqual(square.crop)
  })

  it('does not create history when an explicit full-canvas crop is reopened unchanged', () => {
    const document = editorDocument({
      crop: { x: 0, y: 0, width: 400, height: 300 },
    })
    const manager = new CommandManager(document)

    manager.execute(applyCropSession(createCropSession(document)))

    expect(manager.snapshot).toMatchObject({
      canUndo: false,
      dirty: false,
      versionToken: 0,
    })
    expect(manager.snapshot.document.crop).toEqual(document.crop)
  })

  it('never rewrites source, layer coordinates or immutable image references', () => {
    const before = editorDocument()
    const source = structuredClone(before.source)
    const layers = structuredClone(before.layers)
    const session = resizeCrop(
      setCropPreset(createCropSession(before), '16:9'),
      'southEast',
      { x: -50, y: -30 },
    )

    const after = applyEditorCommand(before, applyCropSession(session))

    expect(after.source).toEqual(source)
    expect(after.layers).toEqual(layers)
    expect(JSON.stringify(applyCropSession(session))).not.toMatch(
      /base64|blobHash|intrinsicWidth/u,
    )
  })

  it.each(['horizontal', 'vertical'] as const)(
    'is deterministic when crop and %s canvas flip are ordered and replayed',
    (axis) => {
      const before = editorDocument()
      const crop = { x: 30, y: 40, width: 120, height: 80 }

      const cropThenFlip = new CommandManager(before)
      const cropSession = resizeCrop(
        resizeCrop(createCropSession(before), 'southEast', {
          x: -250,
          y: -180,
        }),
        'northWest',
        { x: 30, y: 40 },
      )
      expect(cropSession.crop).toEqual(crop)
      cropThenFlip.execute(applyCropSession(cropSession))
      cropThenFlip.execute(
        createFlipCanvasCommand(cropThenFlip.snapshot.document, axis),
      )
      const expected = cropThenFlip.snapshot.document
      cropThenFlip.undo()
      cropThenFlip.undo()
      cropThenFlip.redo()
      cropThenFlip.redo()
      expect(cropThenFlip.snapshot.document).toEqual(expected)

      const flipThenCrop = new CommandManager(before)
      flipThenCrop.execute(createFlipCanvasCommand(before, axis))
      const mirroredCrop =
        axis === 'horizontal'
          ? { ...crop, x: before.canvas.width - crop.x - crop.width }
          : { ...crop, y: before.canvas.height - crop.y - crop.height }
      const flippedSession = resizeCrop(
        resizeCrop(
          createCropSession(flipThenCrop.snapshot.document),
          'southEast',
          {
            x: mirroredCrop.x + mirroredCrop.width - before.canvas.width,
            y: mirroredCrop.y + mirroredCrop.height - before.canvas.height,
          },
        ),
        'northWest',
        { x: mirroredCrop.x, y: mirroredCrop.y },
      )
      expect(flippedSession.crop).toEqual(mirroredCrop)
      flipThenCrop.execute(applyCropSession(flippedSession))
      expect(flipThenCrop.snapshot.document).toEqual(expected)
    },
  )

  it('round-trips generated applied crops through command revert', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000, max: 1_000 }),
        fc.integer({ min: -1_000, max: 1_000 }),
        (x, y) => {
          const before = editorDocument({
            crop: { x: 50, y: 40, width: 200, height: 100 },
          })
          const session = moveCrop(createCropSession(before), { x, y })
          const command = applyCropSession(session)
          const after = applyEditorCommand(before, command)
          expect(revertEditorCommand(after, command)).toEqual(before)
        },
      ),
    )
  })
})
