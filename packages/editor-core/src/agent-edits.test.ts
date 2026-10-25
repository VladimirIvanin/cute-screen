import {
  describe,
  expect,
  it,
} from 'vitest'
import { createEditorDocumentFromImage } from './document/factory'
import { CommandManager } from './commands/manager'
import {
  createAgentEditCommand,
  type AgentEdit,
} from './agent-edits'

function document() {
  return createEditorDocumentFromImage({
    id: '019c1f62-058e-7000-8000-000000000000',
    baseLayerId: '019c1f62-058e-7000-8000-000000000001',
    timestamp: '2026-10-25T00:00:00.000Z',
    source: { blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', width: 3840, height: 2160,
      orientationApplied: true, provenance: 'fileOpen', color: { colorSpace: 'srgb', hasIccProfile: false } },
  })
}
const id = () => '019c1f62-058e-7000-8000-000000000002'

describe('agent edit transactions', () => {
  it('uses production factories and one Undo for a complete batch', () => {
    const initial = document()
    const manager = new CommandManager(initial)
    const command = createAgentEditCommand(initial, [
      { type: 'create', tool: 'text', input: { text: 'Review', origin: { x: 100, y: 200 } } },
      { type: 'crop', bounds: { x: 10, y: 20, width: 2000, height: 1000 } },
    ], id)
    manager.execute(command)
    expect(manager.snapshot.document.layers).toHaveLength(2)
    expect(manager.snapshot.document.crop?.width).toBe(2000)
    manager.undo()
    expect(manager.snapshot.document).toEqual(initial)
    manager.redo()
    expect(manager.snapshot.document.layers[1]?.kind).toBe('text')
  })

  it('rejects a later invalid operation before committing any earlier operation', () => {
    const initial = document()
    const manager = new CommandManager(initial)
    expect(() => createAgentEditCommand(initial, [
      { type: 'create', tool: 'text', input: { text: 'Never committed', origin: { x: 0, y: 0 } } },
      { type: 'remove', layerId: initial.layers[0]!.id },
    ], id)).toThrow(/base/)
    expect(manager.snapshot.document).toEqual(initial)
    expect(manager.snapshot.canUndo).toBe(false)
  })

  it('cannot unlock or replace the immutable base image', () => {
    const initial = document()
    expect(() => createAgentEditCommand(initial, [
      { type: 'update', layerId: initial.layers[0]!.id, changes: { locked: false } },
    ], id)).toThrow(/base/)
  })

  it('rejects unknown operations and invalid updates through the production codec', () => {
    const initial = document()
    expect(() => createAgentEditCommand(initial, [{ type: 'eval', script: 'bad' }] as never, id)).toThrow()
    const created = new CommandManager(initial)
    created.execute(createAgentEditCommand(initial, [
      { type: 'create', tool: 'text', input: { text: 'T', origin: { x: 0, y: 0 } } },
    ], id))
    expect(() => createAgentEditCommand(created.snapshot.document, [
      { type: 'update', layerId: id(), changes: { opacity: 12 } },
    ], id)).toThrow()
  })
})

const origin = { x: 100, y: 100 }
const bounds = { x: 100, y: 100, width: 200, height: 100 }
const creations: AgentEdit[] = [
  ...(['arrow', 'line', 'shape', 'pencil', 'marker', 'gradient'] as const).map((tool) => ({
    type: 'create' as const, tool: 'drawing' as const, input: { tool, start: origin, end: { x: 300, y: 200 } },
  })),
  { type: 'create', tool: 'text', input: { text: 'Text', origin } },
  { type: 'create', tool: 'callout', input: { text: 'Callout', target: origin, label: { x: 300, y: 200 } } },
  { type: 'create', tool: 'numberedMarker', input: { sequence: 1, origin } },
  { type: 'create', tool: 'image', input: { blobHash: 'b'.repeat(64), format: 'png', intrinsicWidth: 200, intrinsicHeight: 100, origin } },
  { type: 'create', tool: 'emoji', input: { grapheme: '✅', origin, asset: { collection: 'notoEmoji', version: 'noto-2d-v1', assetId: '2705' } } },
  { type: 'create', tool: 'censor', input: { region: { kind: 'rectangle', bounds } } },
  { type: 'create', tool: 'spotlight', input: { bounds } },
  { type: 'create', tool: 'ruler', input: { start: origin, end: { x: 300, y: 200 }, canvas: { width: 3840, height: 2160 } } },
  { type: 'create', tool: 'loupe', input: { sourceRegion: { x: 100, y: 100, width: 100, height: 100 }, destination: { x: 400, y: 400 }, canvas: { width: 3840, height: 2160 } } },
]
it.each(creations)('accepts and roundtrips the $tool factory through the command boundary', (edit) => {
  const manager = new CommandManager(document())
  manager.execute(createAgentEditCommand(manager.snapshot.document, [edit], id))
  expect(manager.snapshot.document.layers).toHaveLength(2)
  const created = manager.snapshot.document
  manager.undo()
  expect(manager.snapshot.document.layers).toHaveLength(1)
  manager.redo()
  expect(manager.snapshot.document).toEqual(created)
})

it('uses the same crop/ruler preparation for later edits in an atomic batch', () => {
  const manager = new CommandManager(document())
  manager.execute(createAgentEditCommand(manager.snapshot.document, [
    { type: 'create', tool: 'ruler', input: { start: { x: 3000, y: 1900 }, end: { x: 3800, y: 2100 }, canvas: { width: 3840, height: 2160 } } },
  ], id))
  const batch = createAgentEditCommand(manager.snapshot.document, [
    { type: 'crop', bounds: { x: 0, y: 0, width: 200, height: 100 } },
    { type: 'update', layerId: id(), changes: { visible: false } },
  ], id)
  expect(() => manager.execute(batch)).not.toThrow()
  expect(manager.snapshot.document.layers[1]?.visible).toBe(false)
})
