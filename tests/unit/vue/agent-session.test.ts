import {
  describe,
  expect,
  it,
} from 'vitest'
import { AgentSession } from '../../../apps/desktop/src/agent/session'
import { DocumentSessionController } from '@cute-screen/editor-vue'
import { createEditorDocumentFromImage } from '@cute-screen/editor-core'

function session(failSave = false) {
  return new DocumentSessionController({
    document: createEditorDocumentFromImage({ id: crypto.randomUUID(), baseLayerId: crypto.randomUUID(), timestamp: '2026-10-25T00:00:00.000Z',
      source: { blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', width: 3840, height: 2160, orientationApplied: true, provenance: 'fileOpen', color: { colorSpace: 'srgb', hasIccProfile: false } } }),
    revision: 1, bridge: { saveDocument: async (record) => {
      if (failSave) throw new Error('disk failure')
      return record.revision + 1
    }, exportRecoveryBundle: async () => ({ kind: 'cancelled' }) }, correlationId: () => 'agent-test',
  })
}
describe('MCP live session contract', () => {
  it('invalidates old tokens through manual edits, Undo, Redo and document replacement', () => {
    const agent = new AgentSession()
    const live = session()
    const first = agent.snapshot(live).stateToken
    live.execute({ type: 'setCrop', before: null, after: { x: 0, y: 0, width: 100, height: 100 } })
    const second = agent.snapshot(live).stateToken
    live.undo()
    const third = agent.snapshot(live).stateToken
    live.redo()
    expect(new Set([first, second, third, agent.snapshot(live).stateToken]).size).toBe(4)
    expect(agent.snapshot(session()).stateToken).not.toBe(first)
    agent.dispose()
    live.dispose()
  })
  it('deduplicates a batch before checking its now stale token and rejects request ID reuse', async () => {
    const agent = new AgentSession()
    const live = session()
    const snapshot = agent.snapshot(live)
    const args = { documentId: snapshot.document.id, expectedStateToken: snapshot.stateToken, requestId: 'one', operations: [{ type: 'crop' as const, bounds: { x: 0, y: 0, width: 100, height: 100 } }] }
    const result = await agent.edit(live, args, false)
    expect(await agent.edit(live, args, false)).toEqual(result)
    await expect(agent.edit(live, { ...args, operations: [] }, false)).rejects.toThrow(/requestId/)
    await expect(agent.edit(live, { ...args, requestId: 'two' }, false)).rejects.toThrow(/conflict/)
    agent.dispose()
    live.dispose()
  })
  it('refuses transient edits', async () => {
    const live = session()
    const agent = new AgentSession()
    const snapshot = agent.snapshot(live)
    const args = { documentId: snapshot.document.id, expectedStateToken: snapshot.stateToken, requestId: 'one', operations: [{ type: 'crop' as const, bounds: { x: 0, y: 0, width: 100, height: 100 } }] }
    await expect(agent.edit(live, args, true)).rejects.toThrow(/busy/)
    expect(live.snapshot.core.canUndo).toBe(false)
    agent.dispose()
    live.dispose()
  })
})

it('reports an applied batch separately from a failed save and deduplicates it', async () => {
  const live = session(true)
  const agent = new AgentSession()
  const before = agent.snapshot(live)
  const request = { documentId: before.document.id, expectedStateToken: before.stateToken, requestId: 'save-error',
    operations: [{ type: 'crop' as const, bounds: { x: 0, y: 0, width: 100, height: 100 } }] }
  const result = await agent.edit(live, request, false)
  expect(result.applied).toBe(true)
  expect(result.saveState).toBe('error')
  expect(result.saveError).toBe('disk failure')
  expect(result.stateToken).not.toBe(before.stateToken)
  expect(await agent.edit(live, request, false)).toEqual(result)
  live.undo()
  expect(live.snapshot.core.canUndo).toBe(false)
  agent.dispose()
  live.dispose()
})

describe('agent coordinate space', () => {
  it('does not inherit the user’s active card space', async () => {
    const live = session()
    live.setLayerSpace('card')
    const agent = new AgentSession()
    const before = agent.snapshot(live)
    const result = await agent.edit(live, { documentId: before.document.id, expectedStateToken: before.stateToken, requestId: 'content', operations: [
      { type: 'create', tool: 'text', input: { text: 'Content coordinates', origin: { x: 10, y: 20 } } },
    ] }, false)
    expect(result.document.layers[1]?.space).not.toBe('card')
    agent.dispose()
    live.dispose()
  })
})
