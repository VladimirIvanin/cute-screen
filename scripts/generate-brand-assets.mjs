import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'

// Original Cute Screen artwork, MIT. Keep the same bold geometry in every size.
const cat = 'M5 5L12 11H20L27 5V23A4 4 0 0 1 23 27H9A4 4 0 0 1 5 23Z'
const svg = (content, size = 32) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  ${content}
</svg>
`
const app = svg(
  `<rect width="32" height="32" rx="7" fill="#231F26"/>
  <path d="${cat}" fill="#FFFFFF"/>`,
  512,
)
const tray = svg(
  `<path d="${cat}" fill="#FFFFFF" stroke="#231F26" stroke-width="2" stroke-linejoin="round"/>`,
)
const template = svg(`<path d="${cat}" fill="#000000"/>`)
const root = fileURLToPath(new URL('../', import.meta.url))
const save = (path, content) =>
  writeFile(new URL(path, new URL('../', import.meta.url)), content)

await mkdir(
  new URL('../packages/editor-vue/src/shell/assets/', import.meta.url),
  { recursive: true },
)
await mkdir(new URL('../apps/desktop/public/', import.meta.url), {
  recursive: true,
})
await Promise.all([
  save('logo.svg', app),
  save('src-tauri/icons/foundation.svg', app),
  save('src-tauri/icons/tray.svg', tray),
  save('src-tauri/icons/tray-template.svg', template),
  save('packages/editor-vue/src/shell/assets/brand.svg', app),
  save('apps/desktop/public/favicon.svg', app),
])

for (const [name, source] of [
  ['tray', tray],
  ['tray-template', template],
]) {
  const canvas = createCanvas(32, 32)
  canvas
    .getContext('2d')
    .drawImage(await loadImage(Buffer.from(source)), 0, 0, 32, 32)
  await save(`src-tauri/icons/${name}.png`, canvas.toBuffer('image/png'))
}

const result = spawnSync(
  'pnpm',
  ['tauri', 'icon', 'src-tauri/icons/foundation.svg'],
  {
    cwd: root,
    stdio: 'inherit',
  },
)
if (result.error) throw result.error
if (result.status !== 0)
  throw new Error(`Tauri icon generation exited with ${result.status}`)
