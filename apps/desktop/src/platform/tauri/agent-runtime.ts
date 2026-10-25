import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  CanvasViewportHosts,
  DocumentSessionController,
} from '@cute-screen/editor-vue'
import type {
  AgentEdit,
  Rect,
} from '@cute-screen/editor-vue'
import {
  resolveCompositionLayout,
  searchEmoji,
  emojiReference,
} from '@cute-screen/editor-vue'
import { AgentSession } from '../../agent/session'

interface Request { id: string; method: string; arguments: Record<string, unknown>; clientId: string }
interface Ports {
  session(): DocumentSessionController | undefined
  busy(): boolean
  open(captureId: string): Promise<boolean>
  hosts(): CanvasViewportHosts | undefined
  capabilities(): unknown
}

async function preview(
  bytes: Uint8Array,
  region?: Rect,
) {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
  try {
    const area = region ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
    if (
      ![area.x, area.y, area.width, area.height].every(Number.isFinite) ||
      area.x < 0 ||
      area.y < 0 ||
      area.width <= 0 ||
      area.height <= 0 ||
      area.x + area.width > bitmap.width ||
      area.y + area.height > bitmap.height
    )
      throw new Error('invalid preview region')
    const scale = Math.min(1, 1536 / Math.max(area.width, area.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(area.width * scale))
    canvas.height = Math.max(1, Math.round(area.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('preview renderer unavailable')
    context.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error('PNG encoding failed'))
    }, 'image/png'))
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height,
      outputWidth: bitmap.width, outputHeight: bitmap.height, region: area,
      scaleX: canvas.width / area.width, scaleY: canvas.height / area.height }
  } finally {
    bitmap.close()
  }
}

function validRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export async function installAgentRuntime(ports: Ports): Promise<() => void> {
  const agent = new AgentSession()
  let disposed = false
  let queue = Promise.resolve()
  const unlisten = await listen<Request>('cute-screen:mcp-request', (event) => {
    queue = queue.then(() => handle(event.payload)).catch((error) => console.warn('MCP reply failed', error))
  })

  async function execute(request: Request): Promise<{ metadata: unknown; bytes?: Uint8Array }> {
    const { method, arguments: args } = request
    if (disposed) throw new Error('editor unavailable')
    if (method === 'get_status') {
      const live = ports.session()
      const active = live ? agent.snapshot(live) : undefined
      return { metadata: { ready: true, busy: ports.busy(), capabilities: ports.capabilities(),
        documentId: active?.document.id ?? null, stateToken: active?.stateToken ?? null } }
    }
    if (method === 'list_assets') return { metadata: { emoji: searchEmoji(String(args.query ?? ''))
      .map((entry) => ({
        id: entry.id, grapheme: entry.grapheme, ru: entry.ru, en: entry.en, asset: emojiReference(entry.id),
      })) } }
    if (ports.busy()) throw new Error('busy: finish the current user interaction')
    if (method === 'check_ready') return { metadata: { ready: true } }
    if (method === 'open_document') {
      if (typeof args.captureId !== 'string' || !(await ports.open(args.captureId))) throw new Error('could not open history document')
    }
    const live = ports.session()
    if (!live) throw new Error('noDocument: import, capture or open a history entry')
    if (method === 'get_document' || method === 'open_document') return { metadata: agent.snapshot(live) }
    const expected = { documentId: String(args.documentId), expectedStateToken: String(args.expectedStateToken) }
    if (method === 'apply_edits') {
      if (!validRequestId(args.requestId)) throw new Error('invalid requestId')
      const result = await agent.edit(live, { ...expected, requestId: `${request.clientId}:${args.requestId}`,
        operations: args.operations as readonly AgentEdit[] }, ports.busy())
      return { metadata: result }
    }
    return renderOrHistory(live, expected, method, args)
  }

  async function renderOrHistory(
    live: DocumentSessionController,
    expected: { documentId: string; expectedStateToken: string },
    method: string,
    args: Record<string, unknown>,
  ): Promise<{ metadata: unknown; bytes?: Uint8Array }> {
    agent.assert(live, expected, ports.busy())
    if (method === 'undo' || method === 'redo') {
      if (method === 'undo') live.undo()
      else live.redo()
      const after = agent.snapshot(live)
      await live.flush()
      return { metadata: { ...after, saveState: live.snapshot.saveState } }
    }
    if (method !== 'get_preview' && method !== 'export_image') throw new Error('unknown tool')
    const hosts = ports.hosts()
    if (!hosts?.exportPng) throw new Error('renderer not ready')
    await hosts.waitForRender?.()
    agent.assert(live, expected, ports.busy())
    const rendered = await hosts.exportPng()
    agent.assert(live, expected, ports.busy())
    if (ports.session() !== live) throw new Error('conflict: document changed during render')
    if (method === 'export_image') return {
      metadata: { stateToken: expected.expectedStateToken, documentId: expected.documentId }, bytes: rendered,
    }
    const result = await preview(rendered, args.region as Rect | undefined)
    const { bytes, ...mapping } = result
    return { metadata: { ...mapping, stateToken: expected.expectedStateToken, documentId: expected.documentId,
      layout: resolveCompositionLayout(live.snapshot.core.document),
      canvas: live.snapshot.core.document.canvas, crop: live.snapshot.core.document.crop }, bytes }
  }

  async function handle(request: Request): Promise<void> {
    try {
      await invoke('mcp_claim', { id: request.id })
      const result = await execute(request)
      await invoke('mcp_reply', { id: request.id, metadata: result.metadata, binary: Boolean(result.bytes) })
      if (result.bytes) await invoke('mcp_reply_bytes', result.bytes, { headers: { 'x-mcp-reply': request.id } })
    } catch (error) {
      await invoke('mcp_reply', { id: request.id, metadata: { error: error instanceof Error ? error.message : 'MCP operation failed' }, binary: false })
    }
  }
  await invoke('mcp_editor_ready', { ready: true })
  return () => {
    disposed = true
    unlisten()
    agent.dispose()
    void invoke('mcp_editor_ready', { ready: false }).catch((error) => console.warn('MCP runtime shutdown failed', error))
  }
}
