import { execFile } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest'
import { bumpVersion } from '../../scripts/bump-version.mjs'

const exec = promisify(execFile)
const script = fileURLToPath(new URL('../../scripts/bump-version.mjs', import.meta.url))
const roots: string[] = []
const files = {
  'package.json': '{\n  "version": "0.1.1"\n}\n',
  'src-tauri/tauri.conf.json': '{\n  "version": "0.1.1"\n}\n',
  'Cargo.toml': '[workspace.package]\nversion = "0.1.1"\n',
  'src-tauri/Cargo.toml': '[dependencies]\ncute-screen-storage = { version = "=0.1.1", path = "../crates/cute-screen-storage" }\nserde = "=1.0.229"\n',
  'Cargo.lock': 'version = 4\n\n[[package]]\nname = "cute-screen-desktop"\nversion = "0.1.1"\n\n[[package]]\nname = "cute-screen-storage"\nversion = "0.1.1"\n\n[[package]]\nname = "external"\nversion = "0.1.1"\n',
  'packages/editor-core/package.json': '{ "version": "0.0.0" }\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'cute-screen-version-'))
  roots.push(root)
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  return root
}

async function snapshot(root: string) {
  return Promise.all(Object.keys(files).map((file) => readFile(path.join(root, file), 'utf8')))
}

it('updates application metadata and only the two workspace lock entries through the CLI', async () => {
  const root = await fixture()
  const { stdout } = await exec(process.execPath, [script, '0.1.2'], { cwd: root })
  expect(stdout).toContain('0.1.1 → 0.1.2')
  for (const [file, content] of Object.entries(files)) {
    const expected = file === 'Cargo.lock'
      ? content.replaceAll(/(name = "cute-screen-(?:desktop|storage)"\nversion = ")0\.1\.1/gu, '$10.1.2')
      : content.replaceAll('0.1.1', '0.1.2')
    expect(await readFile(path.join(root, file), 'utf8')).toBe(expected)
  }
  await bumpVersion(root, '1.0.0')
  expect(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version).toBe('1.0.0')
})

it('accepts the current version without changing files', async () => {
  const root = await fixture()
  const before = await snapshot(root)
  await bumpVersion(root, '0.1.1')
  expect(await snapshot(root)).toEqual(before)
})

it.each([['0.1.2'], ['0.1.2', 'extra']])('reports CLI completion or argument errors: %j', async (...args: string[]) => {
  const root = await fixture()
  const originalArgv = process.argv
  const originalExitCode = process.exitCode
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(process, 'cwd').mockReturnValue(root)
  process.argv = [process.execPath, script, ...args]
  try {
    vi.resetModules()
    await import('../../scripts/bump-version.mjs')
    if (args.length === 1) {
      expect(log).toHaveBeenCalledWith('Cute Screen version: 0.1.1 → 0.1.2')
    } else {
      expect(error).toHaveBeenCalledWith('Usage: pnpm version:bump <MAJOR.MINOR.PATCH>')
      expect(process.exitCode).toBe(1)
    }
  } finally {
    process.argv = originalArgv
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
  }
})

it.each([[], ['v0.1.2'], ['01.1.2'], ['0.1'], ['0.1.2-rc.1'], ['0.1.2\n'], ['0.1.2', 'extra']])(
  'rejects invalid arguments without modifying files: %j',
  async (...args: string[]) => {
    const root = await fixture()
    const before = await snapshot(root)
    await expect(exec(process.execPath, [script, ...args], { cwd: root })).rejects.toThrow('Usage:')
    if (args.length <= 1) await expect(bumpVersion(root, args[0])).rejects.toThrow('Usage:')
    expect(await snapshot(root)).toEqual(before)
  },
)

it.each(['package.json', 'src-tauri/tauri.conf.json', 'Cargo.toml', 'src-tauri/Cargo.toml', 'Cargo.lock'] as const)(
  'rejects inconsistent %s before writing any files',
  async (file) => {
    const root = await fixture()
    await writeFile(path.join(root, file), files[file].replace('0.1.1', '0.0.9'))
    const before = await snapshot(root)
    await expect(bumpVersion(root, '0.1.2')).rejects.toThrow()
    expect(await snapshot(root)).toEqual(before)
  },
)

it('rejects a missing lock entry before writing any files', async () => {
  const root = await fixture()
  await writeFile(path.join(root, 'Cargo.lock'), files['Cargo.lock'].replace('cute-screen-storage', 'other'))
  const before = await snapshot(root)
  await expect(bumpVersion(root, '0.1.2')).rejects.toThrow('Expected exactly one version')
  expect(await snapshot(root)).toEqual(before)
})
