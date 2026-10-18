import {
  describe,
  expect,
  it,
} from 'vitest'
import { createExpressiveBrushMigrationCommand } from './commands/brush-migration'
import { CommandManager } from './commands/manager'
import {
  applyEditorCommand,
  revertEditorCommand,
} from './commands/operations'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import { parseDrawingToolPreferences } from './drawing-preferences'
import { withLayers } from './precision-tools.test-kit'
import { rebaseFreehandLayer } from './tools/freehand'
import { normalizeEditorDocument } from './document/codec'
import type { PencilLayer } from './document/types'

function stroke(version?: 2 | 3): PencilLayer {
  const result = createDrawingLayer({
    id: '019c1f62-058e-7000-8000-000000000019', tool: 'pencil',
    start: { x: 30, y: 40 }, end: { x: 80, y: 70 },
    points: [{ x: 30, y: 40, pressure: .2 }, { x: 50, y: 60, pressure: .9 }, { x: 80, y: 70, pressure: .4 }],
    defaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: {
      ...DEFAULT_DRAWING_DEFAULTS.pencil, brush: 'brush', smoothing: .35, width: 9,
    } },
  }) as PencilLayer
  const { strokeVersion: _version, ...payload } = result.payload
  void _version
  return { ...result, locked: true, visible: false, opacity: .4,
    transform: { ...result.transform, rotation: 30, scaleX: -1 },
    payload: { ...payload, ...(version ? { strokeVersion: version } : {}),
      ...(version === 3 ? { straightSegments: [{ start: 1, end: 2 }] } : {}),
    },
  }
}

describe('expressive brush retirement', () => {
  it.each([undefined, 2, 3] as const)('migrates version %s atomically, including locked/hidden layers', (version) => {
    const before = normalizeEditorDocument(withLayers([stroke(version)]))
    const original = structuredClone(before)
    const command = createExpressiveBrushMigrationCommand(before)!
    expect(command.type).toBe('migrateExpressiveBrushes')
    const manager = new CommandManager(before)
    manager.markSaved()
    const after = manager.execute(command).document
    expect(after.layers[0]).toEqual(rebaseFreehandLayer({
      ...before.layers[0] as PencilLayer,
      payload: { ...before.layers[0]!.payload, brush: 'stabilized', smoothing: .35,
        strokeVersion: version === 3 ? 3 : 2, pressureMode: 'simulated' },
    } as PencilLayer))
    expect(before).toEqual(original)
    expect(createExpressiveBrushMigrationCommand(after)).toBeNull()
    expect(revertEditorCommand(after, command)).toEqual(before)
    expect(manager.undo()).toMatchObject({ document: before, canUndo: false, dirty: false })
    expect(manager.redo()).toMatchObject({ document: after, dirty: true })
    expect(() => applyEditorCommand(after, command)).toThrow()
  })

  it('migrates several strokes once and leaves other layers unchanged', () => {
    const first = stroke(2)
    const second = { ...stroke(3), id: '019c1f62-058e-7000-8000-000000000020' }
    const pen = { ...first, id: '019c1f62-058e-7000-8000-000000000021', payload: { ...first.payload, brush: 'pen' as const } }
    const before = withLayers([first, second, pen])
    const manager = new CommandManager(before)
    const after = manager.execute(createExpressiveBrushMigrationCommand(before)!).document
    expect(after.layers.filter((layer) => layer.kind === 'pencil').map((layer) => layer.payload.brush))
      .toEqual(['stabilized', 'stabilized', 'pen'])
    expect(after.layers[2]).toEqual(pen)
    expect(manager.undo()).toMatchObject({ document: before, canUndo: false })
    expect(createExpressiveBrushMigrationCommand(withLayers([pen]))).toBeNull()
  })

  it.each([undefined, -1, 2, NaN])('falls back to 65%% for invalid correction %s', (smoothing) => {
    const input = stroke(2)
    const before = withLayers([{ ...input, payload: { ...input.payload, smoothing } } as unknown as PencilLayer])
    const command = createExpressiveBrushMigrationCommand(before)!
    expect(command.changes[0]!.after.payload.smoothing).toBe(.65)
  })

  it('rejects unrelated edits through the migration command and preserves pen pressure', () => {
    const input = stroke(2)
    const before = withLayers([{ ...input, payload: { ...input.payload, pressureMode: 'pen' } }])
    const command = createExpressiveBrushMigrationCommand(before)!
    expect(command.changes[0]!.after.payload.pressureMode).toBe('pen')
    const change = command.changes[0]!
    expect(() => applyEditorCommand(before, { ...command, changes: [{ ...change,
      after: { ...change.after, locked: false },
    }] })).toThrow('invalid brush migration')
    expect(() => applyEditorCommand(before, { ...command, changes: [change, change] })).toThrow('invalid brush migration')
  })

  it.each([undefined, .8])('migrates brush preferences using stabilized memory %s', (remembered) => {
    const preferences = parseDrawingToolPreferences({ schemaVersion: 2, defaults: { pencil: {
      brush: 'brush', width: 12, smoothing: .2, layerOpacity: .4,
      brushSmoothing: { brush: .2, ...(remembered ? { stabilized: remembered } : {}) },
    } } })
    expect(preferences.defaults.pencil).toMatchObject({ brush: 'stabilized', smoothing: remembered ?? .65,
      width: 12, layerOpacity: .4 })
  })
})
