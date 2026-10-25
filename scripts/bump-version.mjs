import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { validateReleaseVersion } from './release-assets.mjs'

function replaceVersion(
  source,
  pattern,
  current,
  next,
  file,
) {
  const matches = [...source.matchAll(pattern)]
  if (matches.length !== 1 || matches[0][2] !== current) {
    throw new Error(`Expected exactly one version ${current} in ${file}.`)
  }
  return source.replace(pattern, (_, before, _version, after) => `${before}${next}${after}`)
}

/** Update validated application metadata without resolving external dependencies. */
export async function bumpVersion(
  root,
  next,
) {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(next ?? '')
    ||
    next !== next.trim()
  ) {
    throw new Error('Usage: pnpm version:bump <MAJOR.MINOR.PATCH> (for example: pnpm version:bump 0.1.2).')
  }

  const files = ['package.json', 'src-tauri/tauri.conf.json', 'Cargo.toml', 'src-tauri/Cargo.toml', 'Cargo.lock']
  const contents = await Promise.all(files.map((file) => readFile(path.join(root, file), 'utf8')))
  const current = JSON.parse(contents[0]).version
  await validateReleaseVersion(root, `v${current}`)

  const updated = contents.map((source, index) => {
    const file = files[index]
    if (file.endsWith('.json')) {
      return replaceVersion(source, /(^\s*"version":\s*")([^"]+)(")/gmu, current, next, file)
    }
    if (file === 'Cargo.toml') {
      return replaceVersion(source, /(\[workspace\.package\][^[]*?\nversion\s*=\s*")([^"]+)(")/gu, current, next, file)
    }
    if (file === 'src-tauri/Cargo.toml') {
      let manifest = source
      for (const name of ['cute-screen-storage', 'cute-screen-mcp']) {
        if (name === 'cute-screen-mcp' && !source.includes('cute-screen-mcp =')) continue
        const pattern = new RegExp(`(^${name}\\s*=\\s*\\{\\s*version\\s*=\\s*"=)([^"]+)(")`, 'gmu')
        manifest = replaceVersion(manifest, pattern, current, next, file)
      }
      return manifest
    }
    let lockfile = source
    for (const name of ['cute-screen-desktop', 'cute-screen-storage', 'cute-screen-mcp']) {
      if (name === 'cute-screen-mcp' && !source.includes('name = "cute-screen-mcp"')) continue
      const pattern = new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${name}"\\r?\\nversion = ")([^"]+)(")`, 'gu')
      lockfile = replaceVersion(lockfile, pattern, current, next, file)
    }
    return lockfile
  })

  // Finish every metadata check before writing any file.
  for (const [index, file] of files.entries()) {
    if (contents[index] !== updated[index]) await writeFile(path.join(root, file), updated[index])
  }
  return { current, next }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: pnpm version:bump <MAJOR.MINOR.PATCH>')
    const { current, next } = await bumpVersion(process.cwd(), process.argv[2])
    console.log(`Cute Screen version: ${current} → ${next}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
