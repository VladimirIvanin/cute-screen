import { execFileSync } from 'node:child_process'
import {
  lstat,
  readdir,
  realpath,
  rm,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parents = [
  ['artifacts/browser-e2e', /^(?:wdio-chrome-[\d-]+|chrome-profile-[\w-]+)$/u],
  ['artifacts/landing-e2e', /^(?:wdio-chrome-[\d-]+|chrome-profile-[\w-]+)$/u],
  ['artifacts/tauri-e2e/runtime', /^(?:cute-screen-e2e-binary|frontend-config)-[\w-]+$/u],
]

export async function directoryBytes(directory) {
  let metadata
  let entries
  try {
    metadata = await lstat(directory)
    if (metadata.isSymbolicLink()) return 0
    if (!metadata.isDirectory()) return metadata.size
    entries = await readdir(directory)
  } catch (error) {
    // A concurrently finishing build/cleanup can remove an enumerated file.
    if (error.code === 'ENOENT') return 0
    throw error
  }
  let bytes = 0
  for (const entry of entries) {
    bytes += await directoryBytes(path.join(directory, entry))
  }
  return bytes
}

async function disposableDirectories() {
  const directories = []
  for (const [relative, pattern] of parents) {
    const parent = path.join(root, relative)
    let entries
    try {
      if (await realpath(parent) !== parent) throw new Error(`Linked parent: ${parent}`)
      entries = await readdir(parent, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !pattern.test(entry.name)) continue
      const directory = path.join(parent, entry.name)
      if (await realpath(directory) !== directory) throw new Error(`Linked directory: ${directory}`)
      directories.push(directory)
    }
  }
  return directories
}

function assertInactive(directories) {
  const commands = process.platform === 'win32'
    ? execFileSync('powershell.exe', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'chrome|msedge|cute-screen|driver|node.exe' } | Select-Object -ExpandProperty CommandLine"], { encoding: 'utf8' })
    : execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' })
  const normalized = commands.replaceAll('\\', '/').toLowerCase()
  for (const directory of directories) {
    if (normalized.includes(directory.replaceAll('\\', '/').toLowerCase())) {
      throw new Error(`Directory is in use: ${directory}`)
    }
  }
}

async function main() {
  const [mode = 'report', ...flags] = process.argv.slice(2)
  if (!['report', 'clean'].includes(mode) || flags.some((flag) => flag !== '--apply')) {
    throw new Error('Usage: node scripts/workspace-storage.mjs report|clean [--apply]')
  }
  if (mode === 'report') {
    for (const name of ['target', 'artifacts', 'node_modules', '.git']) {
      const directory = path.join(root, name)
      try {
        let total = 0
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const bytes = await directoryBytes(path.join(directory, entry.name))
          total += bytes
          if (entry.isDirectory()) console.info(`${(bytes / 2 ** 30).toFixed(3)} GiB\t${name}/${entry.name}`)
        }
        console.info(`${(total / 2 ** 30).toFixed(3)} GiB\t${name} TOTAL`)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    return
  }
  const directories = await disposableDirectories()
  const tracked = execFileSync('git', ['ls-files', '-z', '--', 'artifacts'], { cwd: root, encoding: 'utf8' })
  if (tracked) throw new Error('Refusing cleanup: artifacts contains tracked files')
  assertInactive(directories)
  let total = 0
  for (const directory of directories) {
    const bytes = await directoryBytes(directory)
    total += bytes
    console.info(`${(bytes / 2 ** 30).toFixed(3)} GiB\t${path.relative(root, directory)}`)
    if (flags.includes('--apply')) {
      await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
    }
  }
  console.info(`${flags.includes('--apply') ? 'Removed' : 'Dry run'}: ${directories.length} directories, ${(total / 2 ** 30).toFixed(3)} GiB`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
