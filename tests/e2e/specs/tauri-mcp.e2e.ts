import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { createHash } from 'node:crypto'
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  McpClient,
} from '../mcp-client'
import {
  parseMcpConfiguration,
  selectMcpClient,
  connectAgent,
  waitForCapture,
} from '../mcp-settings'
import { setEditorPreferences } from '../editor-settings'
import { agentClientProfiles } from '../../../apps/desktop/src/agent/client-profiles'

function expectedState(snapshot: Record<string, unknown>) {
  const document = snapshot.document as { id: string }
  return { documentId: document.id, expectedStateToken: snapshot.stateToken }
}

describe('local MCP through the real editor WebView', () => {
  it('connects from Settings, imports 4K, edits atomically, previews, undoes and exports decoded PNG', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cute-screen-mcp-test-'))
    let client: McpClient | undefined
    try {
      const source = path.join(directory, 'source.png')
      const canvas = createCanvas(3840, 2160)
      const paint = canvas.getContext('2d')
      const gradient = paint.createLinearGradient(0, 0, 3840, 2160)
      gradient.addColorStop(0, '#193247')
      gradient.addColorStop(1, '#c7e1c4')
      paint.fillStyle = gradient
      paint.fillRect(0, 0, 3840, 2160)
      paint.fillStyle = '#ffffff'
      paint.font = '64px sans-serif'
      for (let row = 0; row < 20; row++) paint.fillText(`Production dashboard row ${row}`, 120, 150 + row * 95)
      const original = canvas.toBuffer('image/png')
      await writeFile(source, original)
      const originalHash = createHash('sha256').update(original).digest('hex')
      await expect($('.cs-editor-shell')).toBeDisplayed()
      await browser.setWindowSize(1280, 800)
      await setEditorPreferences('en', 'dark')
      await $('.cs-agent-connect').click()
      await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
      await browser.tauri.switchWindow('settings')
      await expect($('.cs-agent-settings')).toBeDisplayed()
      await expect($('.cs-agent-settings')).toHaveAttribute('aria-busy', 'false')
      await $('.cs-agent-enable input').click()
      await expect($('.cs-agent-buttons button')).toBeEnabled()
      await $('.cs-agent-buttons button').click()
      await expect($('#mcp-config')).toBeDisplayed()
      const config = await $('#mcp-config').getValue()
      client = new McpClient(parseMcpConfiguration(config))
      await client.initialize()
      const catalog = await client.request('tools/list', {}) as { tools: { name: string }[] }
      expect(catalog.tools.some((tool) => tool.name === 'apply_edits')).toBe(true)
      const imported = await client.data('import_image', { path: source })
      const captureId = imported.captureId
      const before = await client.data('get_document')
      expect((before.document as { canvas: { width: number } }).canvas.width).toBe(3840)
      const applied = await client.data('apply_edits', { ...expectedState(before), requestId: 'first-batch', operations: [
        { type: 'create', tool: 'text', input: { text: 'MCP reviewed', origin: { x: 300, y: 300 }, fontSize: 64 } },
        { type: 'create', tool: 'drawing', input: { tool: 'arrow', start: { x: 100, y: 100 }, end: { x: 280, y: 280 } } },
        { type: 'crop', bounds: { x: 0, y: 0, width: 3200, height: 1800 } },
      ] })
      const duplicate = await client.data('apply_edits', { ...expectedState(before), requestId: 'first-batch', operations: [
        { type: 'create', tool: 'text', input: { text: 'MCP reviewed', origin: { x: 300, y: 300 }, fontSize: 64 } },
        { type: 'create', tool: 'drawing', input: { tool: 'arrow', start: { x: 100, y: 100 }, end: { x: 280, y: 280 } } },
        { type: 'crop', bounds: { x: 0, y: 0, width: 3200, height: 1800 } },
      ] })
      expect(duplicate.stateToken).toBe(applied.stateToken)
      const stale = await client.call('apply_edits', { ...expectedState(before), requestId: 'stale', operations: [{ type: 'crop', bounds: null }] })
      expect(stale.isError).toBe(true)
      const preview = await client.call('get_preview', expectedState(applied))
      expect(preview.isError).not.toBe(true)
      const pixels = preview.content.find((item) => item.type === 'image')?.data
      expect(pixels).toBeDefined()
      const decodedPreview = await loadImage(Buffer.from(pixels!, 'base64'))
      expect(decodedPreview.width).toBe(1536)
      await writeFile(path.join(process.env.CUTE_SCREEN_WDIO_ARTIFACTS!, 'mcp-preview.png'), Buffer.from(pixels!, 'base64'))
      const undone = await client.data('undo', expectedState(applied))
      expect((undone.document as { layers: unknown[] }).layers).toHaveLength(1)
      const redone = await client.data('redo', expectedState(undone))
      const output = path.join(directory, 'result.png')
      await client.data('export_image', { ...expectedState(redone), path: output })
      const exported = await loadImage(await readFile(output))
      expect([exported.width, exported.height]).toEqual([3200, 1800])
      expect((await client.call('export_image', { ...expectedState(redone), path: output })).isError).toBe(true)
      expect(createHash('sha256').update(await readFile(source)).digest('hex')).toBe(originalHash)
      const history = await client.data('list_history')
      expect(JSON.stringify(history)).toContain(captureId)
      await browser.tauri.switchWindow('main')
      await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/mcp-editor.png`)
      await browser.tauri.switchWindow('settings')
      await $('.cs-agent-connections button').click()
      await expect($('#mcp-config')).not.toBeExisting()
      await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/mcp-settings.png`)
      expect((await client.call('get_document')).isError).toBe(true)
    } finally {
      await client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('runs native capture jobs, cancellation, and reopens the edited history document', async () => {
    const client = await connectAgent()
    try {
      const before = await client.data('get_document')
      const originalId = (before.document as { id: string }).id
      const history = await client.data('list_history') as { page: { items: { documentId: string; captureId: string }[] } }
      const captureId = history.page.items.find((item) => item.documentId === originalId)!.captureId
      const delayed = await client.data('capture', { mode: 'screen', delayMs: 5000 })
      await client.data('cancel_job', { jobId: delayed.jobId })
      expect((await waitForCapture(client, delayed.jobId)).outcome).toBe('cancelled')
      const requested = await client.data('capture', { mode: 'screen' })
      const captured = await waitForCapture(client, requested.jobId)
      expect(captured.outcome).toBe('captured')
      expect(captured.document).toBeDefined()
      await browser.waitUntil(async () => {
        const current = await client.data('get_document')
        return (current.document as { id: string }).id !== originalId
      })
      const reopened = await client.data('open_document', { captureId })
      expect((reopened.document as { id: string }).id).toBe(originalId)
      expect(JSON.stringify(reopened.document)).toContain('MCP reviewed')
      expect(reopened.canUndo).toBe(false)
      const region = await client.call('get_preview', { ...expectedState(reopened), region: { x: 100, y: 100, width: 400, height: 300 } })
      expect(region.isError).not.toBe(true)
      const image = await loadImage(Buffer.from(region.content.find((item) => item.type === 'image')!.data!, 'base64'))
      expect([image.width, image.height]).toEqual([400, 300])
      // Leave the connection grant in the isolated profile for the restart scenario;
      // the ephemeral raw key remains only in this client and is never saved to evidence.
    } finally {
      await client.close()
    }
  })

  it('opens the agent section in the existing Settings window from the narrow editor overflow', async () => {
    await browser.tauri.switchWindow('settings')
    await $('.cs-settings-sidebar nav button:first-child').click()
    await expect($('.cs-settings-section-title')).toHaveText('General')
    await browser.tauri.switchWindow('main')
    await browser.waitUntil(async () => {
      await browser.setWindowSize(1024, 700)
      return await browser.execute(() => window.innerWidth) <= 1024
    }, { timeout: 10000, interval: 250 })
    await expect($('.cs-agent-connect')).not.toBeDisplayed()
    await $('.cs-topbar [aria-label="Settings"]').click()
    await expect($('.cs-agent-overflow')).toBeDisplayed()
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/mcp-narrow.png`)
    await $('.cs-agent-overflow').click()
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-agent-settings')).toBeDisplayed()
    expect((await browser.tauri.listWindows()).filter((label) => label === 'settings')).toHaveLength(1)
    await expect($('#mcp-config')).not.toBeExisting()
  })

  it('generates every client profile in native Settings and connects its real stdio command', async () => {
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-agent-settings')).toBeDisplayed()
    for (const [id, profile] of Object.entries(agentClientProfiles)) {
      await selectMcpClient(id)
      await expect($('#mcp-config')).not.toBeExisting()
      await expect($('.cs-agent-settings')).toHaveText(expect.stringContaining(profile.destination))
      await $('.cs-agent-buttons button').click()
      await expect($('#mcp-config')).toBeDisplayed()
      const config = await $('#mcp-config').getValue()
      const client = new McpClient(parseMcpConfiguration(config))
      try {
        await client.initialize()
        const status = await client.data('get_status')
        expect(status.ready).toBe(true)
      } finally {
        await client.close()
      }
      await $(`button[aria-label="Revoke ${id}"]`).click()
      await expect($('#mcp-config')).not.toBeExisting()
      if (id === 'continue') await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/mcp-continue-profile.png`)
      if (id === 'vscode') await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/mcp-vscode-profile.png`)
    }
  })

})
