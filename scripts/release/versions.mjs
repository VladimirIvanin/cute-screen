import {
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  stableVersion,
  validateVersions,
} from './contracts.mjs'
import {
  json,
  root,
  run,
} from './io.mjs'

export async function versionFiles(directory) {
  const files = ['package.json', 'src-tauri/tauri.conf.json']
  for (const group of ['apps', 'packages']) {
    for (const entry of await readdir(path.join(directory, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const candidate = `${group}/${entry.name}/package.json`
      try {
        await readFile(path.join(directory, candidate))
        files.push(candidate)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
  }
  return files
}

export async function readVersions(directory = root) {
  const entries = {}
  for (const file of await versionFiles(directory)) entries[file] = (await json(path.join(directory, file))).version
  const cargo = await readFile(path.join(directory, 'Cargo.toml'), 'utf8')
  entries['Cargo.toml'] = cargo.match(/^version = "([^"]+)"/mu)?.[1]
  const desktop = await readFile(path.join(directory, 'src-tauri/Cargo.toml'), 'utf8')
  entries['Cargo path dependency'] = desktop.match(/cute-screen-storage = \{ version = "=([^"]+)"/u)?.[1]
  const lock = await readFile(path.join(directory, 'Cargo.lock'), 'utf8')
  for (const name of ['cute-screen-desktop', 'cute-screen-storage']) {
    entries[`Cargo.lock:${name}`] = lock.match(new RegExp(`name = "${name}"\\r?\\nversion = "([^"]+)"`, 'u'))?.[1]
  }
  for (const file of ['src-tauri/Cargo.toml', 'crates/cute-screen-storage/Cargo.toml']) {
    if (!(await readFile(path.join(directory, file), 'utf8')).includes('version.workspace = true')) {
      throw new Error(`${file} must inherit workspace version`)
    }
  }
  return entries
}

export async function checkVersions(
  tag = '',
  directory = root,
) {
  return validateVersions(await readVersions(directory), tag)
}

export async function setVersion(
  version,
  directory = root,
) {
  stableVersion(version)
  // Inspect all sources before writing; malformed metadata must not cause partial bumps.
  await checkVersions('', directory)
  const updates = new Map()
  for (const file of await versionFiles(directory)) {
    const text = await readFile(path.join(directory, file), 'utf8')
    updates.set(file, text.replace(/"version": "[^"]+"/u, `"version": "${version}"`))
  }
  for (const file of ['Cargo.toml', 'src-tauri/Cargo.toml', 'Cargo.lock']) {
    let text = await readFile(path.join(directory, file), 'utf8')
    if (file === 'Cargo.toml') text = text.replace(/^version = "[^"]+"/mu, `version = "${version}"`)
    if (file === 'src-tauri/Cargo.toml') {
      text = text.replace(/(cute-screen-storage = \{ version = ")=[^"]+/u, `$1=${version}`)
    }
    if (file === 'Cargo.lock') {
      text = text.replace(/(name = "cute-screen-(?:desktop|storage)"\r?\nversion = ")[^"]+/gu, `$1${version}`)
    }
    updates.set(file, text)
  }
  for (const [file, text] of updates) await writeFile(path.join(directory, file), text)
  await checkVersions('', directory)
  // pnpm workspace:* uses link: entries; package version changes do not rewrite its lock.
}

export async function preflight() {
  const event = process.env.GITHUB_EVENT_NAME
  const tag = event === 'push' ? process.env.GITHUB_REF_NAME : ''
  if (event === 'push' && process.env.GITHUB_REF_TYPE !== 'tag') throw new Error('Push builds require a release tag')
  const version = await checkVersions(tag)
  const commit = run('git', ['rev-parse', 'HEAD'])
  if (process.env.GITHUB_SHA && commit !== process.env.GITHUB_SHA) throw new Error('Checkout SHA differs from event SHA')
  if (tag) {
    run('git', ['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'])
    run('git', ['merge-base', '--is-ancestor', commit, 'refs/remotes/origin/main'])
  }
  if (process.env.GITHUB_OUTPUT) {
    await writeFile(process.env.GITHUB_OUTPUT, `version=${version}\ncommit=${commit}\n`, { flag: 'a' })
  }
  console.log(`Release inputs verified: ${version} @ ${commit}`)
}
