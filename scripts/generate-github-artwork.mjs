import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'

const root = new URL('../', import.meta.url)
const destination = new URL('docs/assets/github/', root)
const logo = await loadImage(await readFile(new URL('logo.svg', root)))
const toolbar = await loadImage(await readFile(new URL('toolrail.png', destination)))

if (toolbar.width !== 598 || toolbar.height !== 41) {
  throw new Error('GitHub artwork expects the original supplied 598×41 toolbar; preserve its proportions.')
}

// Editable layouts. The brand SVG and toolbar are drawn from their original
// files; this generator neither redraws their geometry nor modifies them.
const layouts = [
  {
    filename: 'readme-header.png',
    height: 480,
    logoSize: 144,
    logoTop: 44,
    titleTop: 207,
    titleSize: 64,
    taglineTop: 294,
    toolbarTop: 370,
  },
  {
    filename: 'social-preview.png',
    height: 640,
    logoSize: 160,
    logoTop: 100,
    titleTop: 282,
    titleSize: 68,
    taglineTop: 376,
    toolbarTop: 474,
  },
]

await mkdir(destination, { recursive: true })

for (const layout of layouts) {
  const canvas = createCanvas(1280, layout.height)
  const context = canvas.getContext('2d')
  context.fillStyle = '#191a1e'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(logo, (canvas.width - layout.logoSize) / 2, layout.logoTop, layout.logoSize, layout.logoSize)

  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.fillStyle = '#ffffff'
  context.font = `700 ${layout.titleSize}px "Segoe UI", sans-serif`
  context.fillText('Cute Screen', canvas.width / 2, layout.titleTop)
  context.fillStyle = '#b5b6c0'
  context.font = '400 28px "Segoe UI", sans-serif'
  context.fillText('Capture. Annotate. Keep it local.', canvas.width / 2, layout.taglineTop)

  const toolbarWidth = toolbar.width * 1.6
  const toolbarHeight = toolbar.height * 1.6
  const toolbarLeft = (canvas.width - toolbarWidth) / 2
  context.save()
  context.beginPath()
  context.roundRect(toolbarLeft, layout.toolbarTop, toolbarWidth, toolbarHeight, 14 * 1.6)
  context.clip()
  context.drawImage(toolbar, toolbarLeft, layout.toolbarTop, toolbarWidth, toolbarHeight)
  context.restore()

  const png = canvas.toBuffer('image/png')
  const output = new URL(layout.filename, destination)
  await writeFile(output, png)

  // Decode the saved artifact rather than checking only that a file exists.
  const decoded = await loadImage(await readFile(output))
  if (
    decoded.width !== 1280 ||
    decoded.height !== layout.height ||
    png.length >= 1_000_000
  ) {
    throw new Error(`Invalid dimensions or file size for ${layout.filename}.`)
  }
  console.log(`${fileURLToPath(output)}: ${decoded.width}×${decoded.height}, ${png.length} bytes, decoded successfully`)
}
