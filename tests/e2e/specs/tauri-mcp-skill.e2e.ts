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
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createComposition } from '../../../packages/editor-core/src/composition/defaults'
import { McpClient } from '../mcp-client'
import { parseMcpConfiguration } from '../mcp-settings'

type Snapshot = Record<string, unknown> & {
  document: {
    id: string
    layers: { id: string; kind: string; payload: Record<string, unknown> }[]
    presentation: Record<string, unknown>
  }
  stateToken: string
}

function state(snapshot: Snapshot) {
  return { documentId: snapshot.document.id, expectedStateToken: snapshot.stateToken }
}

function fixture(): Buffer {
  const canvas = createCanvas(1600, 900)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#20262f'
  ctx.fillRect(0, 0, 1600, 900)
  ctx.fillStyle = '#2d3541'
  ctx.fillRect(0, 0, 260, 900)
  ctx.fillStyle = '#f7f9fc'
  ctx.font = 'bold 38px sans-serif'
  ctx.fillText('Workspace', 44, 76)
  ctx.font = '25px sans-serif'
  for (const [index, label] of ['Overview', 'Projects', 'Reports', 'Settings'].entries()) {
    ctx.fillStyle = index === 3 ? '#b6d2ff' : '#bdc8d7'
    ctx.fillText(label, 48, 173 + index * 78)
  }
  ctx.fillStyle = '#c4cfdd'
  ctx.font = 'bold 38px sans-serif'
  ctx.fillText('Team dashboard', 310, 88)
  ctx.fillStyle = '#35404e'
  for (let row = 0; row < 5; row++) ctx.fillRect(310, 160 + row * 120, 1180, 88)
  ctx.fillStyle = '#f5f7fa'
  ctx.fillRect(420, 245, 760, 400)
  ctx.fillStyle = '#222e3b'
  ctx.font = 'bold 36px sans-serif'
  ctx.fillText('Share report', 470, 318)
  ctx.font = '25px sans-serif'
  ctx.fillText('Only team members can open this link.', 470, 374)
  ctx.strokeStyle = '#aeb8c4'
  ctx.lineWidth = 2
  ctx.strokeRect(470, 414, 640, 64)
  ctx.fillStyle = '#5a6675'
  ctx.fillText('team.example/report/24', 492, 456)
  ctx.fillStyle = '#2166c1'
  ctx.fillRect(780, 526, 330, 74)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 27px sans-serif'
  ctx.fillText('Copy link', 875, 573)
  return canvas.toBuffer('image/png')
}

async function changedPixelsAtShareSize(
  source: Buffer,
  result: Buffer,
): Promise<number> {
  // The evaluated arrow is on the right side of the same 1600x900 screenshot.
  const original = createCanvas(800, 450)
  const exported = createCanvas(800, 450)
  const [before, after] = await Promise.all([loadImage(source), loadImage(result)])
  original.getContext('2d').drawImage(before, 0, 0, 800, 450)
  exported.getContext('2d').drawImage(after, 0, 0, 800, 450)
  const a = original.getContext('2d').getImageData(470, 245, 260, 125).data
  const b = exported.getContext('2d').getImageData(470, 245, 260, 125).data
  let count = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 70) count++
  }
  return count
}

describe('Cute Screen annotation skill through the real MCP WebView', () => {
  it('compares thin and readable arrows at sharing size, then exports a styled hand-drawn card', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'cute-screen-mcp-skill-'))
    const evidence = await mkdtemp(path.join(process.env.CUTE_SCREEN_WDIO_ARTIFACTS!, 'mcp-skill-'))
    const source = path.join(temporary, 'source.png')
    const original = fixture()
    const originalHash = createHash('sha256').update(original).digest('hex')
    await writeFile(source, original)
    let client: McpClient | undefined
    try {
      await expect($('.cs-editor-shell')).toBeDisplayed()
      await browser.setWindowSize(1280, 800)
      await $('.cs-agent-connect').click()
      await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
      await browser.tauri.switchWindow('settings')
      await expect($('.cs-agent-settings')).toHaveAttribute('aria-busy', 'false')
      await $('.cs-agent-enable input').click()
      await $('.cs-agent-buttons button').click()
      client = new McpClient(parseMcpConfiguration(await $('#mcp-config').getValue()))
      await client.initialize()
      const status = await client.data('get_status')
      expect(status.ready).toBe(true)

      const exports: Record<string, Buffer> = {}
      for (const variant of ['thin', 'clean', 'contrast', 'handDrawn'] as const) {
        await client.data('import_image', { path: source })
        let snapshot = await client.data('get_document') as Snapshot
        const highContrast = variant === 'contrast' || variant === 'handDrawn'
        await client.data('apply_edits', {
          ...state(snapshot),
          requestId: `skill-${variant}-create`,
          operations: [{
            type: 'create',
            tool: 'drawing',
            input: {
              tool: 'arrow',
              start: { x: highContrast ? 620 : 1380, y: highContrast ? 560 : 670 },
              end: { x: highContrast ? 850 : 1060, y: 560 },
            },
          }],
        })
        snapshot = await client.data('get_document') as Snapshot
        const arrow = snapshot.document.layers.find((layer) => layer.kind === 'arrow')!
        if (variant !== 'clean') {
          const stroke = arrow.payload.stroke as Record<string, unknown>
          const payload = {
            ...arrow.payload,
            appearance: variant === 'handDrawn' ? 'handDrawn' : 'clean',
            stroke: {
              ...stroke,
              width: variant === 'thin' ? 2 : 8,
              color: highContrast ? { red: 0, green: 0, blue: 0, alpha: 1 } : stroke.color,
            },
          }
          await client.data('apply_edits', {
            ...state(snapshot),
            requestId: `skill-${variant}-style`,
            operations: [{ type: 'update', layerId: arrow.id, changes: { payload } }],
          })
          snapshot = await client.data('get_document') as Snapshot
        }
        if (variant === 'handDrawn') {
          const composition = createComposition('padding')
          await client.data('apply_edits', {
            ...state(snapshot),
            requestId: 'skill-handDrawn-card',
            operations: [{
              type: 'presentation',
              value: {
                ...snapshot.document.presentation,
                composition: {
                  ...composition,
                  layout: {
                    ...composition.layout,
                    insets: { top: 50, right: 50, bottom: 50, left: 50, unit: 'px', linked: true },
                  },
                  background: {
                    ...composition.background,
                    kind: 'solid',
                    color: { red: 0.86, green: 0.9, blue: 0.96, alpha: 1 },
                  },
                  radius: 24,
                },
              },
            }],
          })
          snapshot = await client.data('get_document') as Snapshot
        }
        const preview = await client.call('get_preview', state(snapshot))
        expect(preview.isError).not.toBe(true)
        const previewBytes = Buffer.from(preview.content.find((item) => item.type === 'image')!.data!, 'base64')
        expect((await loadImage(previewBytes)).width).toBeGreaterThan(0)
        await writeFile(path.join(evidence, `${variant}-preview.png`), previewBytes)
        const destination = path.join(evidence, `${variant}.png`)
        await client.data('export_image', { ...state(snapshot), path: destination })
        exports[variant] = await readFile(destination)
        expect((await loadImage(exports[variant]!)).width).toBeGreaterThan(0)
      }
      const thinPixels = await changedPixelsAtShareSize(original, exports.thin!)
      const cleanPixels = await changedPixelsAtShareSize(original, exports.clean!)
      expect(cleanPixels).toBeGreaterThan(thinPixels * 2)
      expect(createHash('sha256').update(await readFile(source)).digest('hex')).toBe(originalHash)
      await writeFile(path.join(evidence, 'metrics.json'), JSON.stringify({ thinPixels, cleanPixels, platform: process.platform }, null, 2))
    } finally {
      await client?.close()
      await rm(temporary, { recursive: true, force: true })
    }
  })
})
