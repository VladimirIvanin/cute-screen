import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'
import { h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = new URL('../apps/landing/assets/icons/', import.meta.url)
const names = [
  'select', 'hand', 'crop', 'arrow', 'shape', 'pencil', 'marker', 'text',
  'numberedMarker', 'callout', 'image', 'eyedropper', 'privacy', 'spotlight',
  'ruler', 'loupe', 'check',
]
const server = await createServer({
  configFile: false,
  root,
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
})

try {
  const { UiIcon } = await server.ssrLoadModule('/packages/editor-vue/src/shell/icon.ts')
  await mkdir(output, { recursive: true })
  for (const name of names) {
    const svg = await renderToString(h(UiIcon, { name }))
    await writeFile(new URL(`${name}.svg`, output), `${svg.replace('<svg ', '<svg style="color:#dedee6" ')}\n`)
  }
  console.log(`Exported ${names.length} existing UiIcon SVGs for the landing page.`)
} finally {
  await server.close()
}
