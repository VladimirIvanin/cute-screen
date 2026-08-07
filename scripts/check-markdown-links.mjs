import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import fg from 'fast-glob'

const root = process.cwd()
const markdownFiles = await fg(['**/*.md'], {
  cwd: root,
  ignore: ['**/node_modules/**', '**/target/**'],
  absolute: true,
})
const failures = []
const anchorCache = new Map()

function slugifyHeading(heading) {
  return heading
    .trim()
    .toLocaleLowerCase()
    .replace(/<[^>]+>/gu, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/gu, '-')
}

async function anchorsFor(file) {
  if (anchorCache.has(file)) return anchorCache.get(file)

  const source = await readFile(file, 'utf8')
  const counts = new Map()
  const anchors = new Set()

  for (const line of source.split(/\r?\n/u)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/u)?.[1]
    if (!heading) continue

    const base = slugifyHeading(heading)
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    anchors.add(seen === 0 ? base : `${base}-${seen}`)
  }

  anchorCache.set(file, anchors)
  return anchors
}

for (const file of markdownFiles) {
  const source = await readFile(file, 'utf8')
  const links = source.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)

  for (const match of links) {
    let href = match[1].trim().replace(/^<|>$/gu, '')
    if (/^(?:https?:|mailto:)/u.test(href)) continue

    const [rawTarget = '', rawAnchor] = href.split('#', 2)
    const decodedTarget = decodeURIComponent(rawTarget)
    const target = decodedTarget
      ? path.resolve(path.dirname(file), decodedTarget)
      : file

    try {
      const metadata = await stat(target)
      if (!metadata.isFile()) {
        failures.push(
          `${path.relative(root, file)}: target is not a file: ${href}`,
        )
        continue
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        failures.push(`${path.relative(root, file)}: missing target: ${href}`)
        continue
      }
      throw error
    }

    if (rawAnchor && target.endsWith('.md')) {
      const anchors = await anchorsFor(target)
      if (!anchors.has(decodeURIComponent(rawAnchor).toLocaleLowerCase())) {
        failures.push(`${path.relative(root, file)}: missing anchor: ${href}`)
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Markdown link check failed:\n${failures.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(
    `Checked relative links and anchors in ${markdownFiles.length} Markdown files.`,
  )
}
