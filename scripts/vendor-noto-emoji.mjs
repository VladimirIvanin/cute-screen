import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const source = await readFile(new URL('packages/editor-core/src/emoji-catalog.ts', root), 'utf8')
const commit = source.match(/NOTO_EMOJI_COMMIT = '([a-f0-9]+)'/)[1]
const rows = source.match(/const entries = `([\s\S]*?)`/)[1].trim().split('\n')
const destination = new URL('packages/editor-vue/src/emoji/assets/', root)
await mkdir(destination, { recursive: true })
const files = rows.map((row) => {
  const grapheme = row.split('|')[0]
  const id = [...grapheme].filter((character) => character !== '\ufe0f').map((character) => character.codePointAt(0).toString(16)).join('_')
  return `emoji_u${id}.svg`
})
const upstream = `https://raw.githubusercontent.com/googlefonts/noto-emoji/${commit}/2D/svg/`
const checksums = {}
async function download(
  name,
  url,
) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  let bytes = new Uint8Array(await response.arrayBuffer())
  if (name.endsWith('.svg')) {
    let svg = new TextDecoder().decode(bytes)
    const entities = [...svg.matchAll(/<!ENTITY\s+([\w.-]+)\s+"([^"]*)"\s*>/g)]
    svg = svg.replace(/<!DOCTYPE[\s\S]*?\]>/g, '').replace(/<\?xml[^?]*\?>/g, '')
    for (const [, key, value] of entities) svg = svg.replaceAll(`&${key};`, value)
    bytes = new TextEncoder().encode(svg.trim() + '\n')
  }
  await writeFile(new URL(name, destination), bytes)
  checksums[name] = createHash('sha256').update(bytes).digest('hex')
}
const queue = [...files, 'LICENSE']
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const name = queue.shift()
    await download(name, upstream + name)
  }
}))
await download('Apache-2.0.txt', 'https://www.apache.org/licenses/LICENSE-2.0.txt')
await writeFile(new URL('NOTICE', destination), `Noto Emoji artwork, Copyright 2013 Google, Inc. All Rights Reserved.\nApache License 2.0. Selected SVG files from googlefonts/noto-emoji.\nSource commit: ${commit}\nhttps://github.com/googlefonts/noto-emoji/tree/${commit}/2D/svg\nChanges: XML/DOCTYPE declarations removed, internal namespace entities expanded. Artwork unchanged.\nCuration and translations are part of Cute Screen.\n`)
await writeFile(new URL('manifest.json', destination), JSON.stringify({ repository: 'https://github.com/googlefonts/noto-emoji', commit, license: 'Apache-2.0', files: Object.fromEntries(Object.entries(checksums).sort()) }, null, 2) + '\n')
console.log(`Vendored ${files.length} Noto SVGs from ${commit}`)
