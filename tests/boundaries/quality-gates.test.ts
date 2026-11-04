import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import {
  homedir,
  tmpdir,
} from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  afterEach,
  expect,
  it,
} from 'vitest'

const execute = promisify(execFile)
const repository = process.cwd()
const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture(projectCheck = 'node -e "process.exit(17)"') {
  const root = await mkdtemp(path.join(tmpdir(), 'cute-screen-quality-test-'))
  roots.push(root)
  await mkdir(path.join(root, 'scripts'))
  for (const file of ['scripts/quality-tools.mjs', 'scripts/eslint-readability.mjs', 'hk.pkl',
    'eslint.config.js', 'eslint.format.config.js', '.prettierignore', '.prettierrc.json', '.gitignore']) {
    await copyFile(path.join(repository, file), path.join(root, file))
  }
  const manifest = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    // Keep Corepack from inheriting a different package manager from a temporary-directory ancestor.
    packageManager: manifest.packageManager,
    qualityTools: manifest.qualityTools,
    scripts: { 'check:project': projectCheck },
  }, null, 2) + '\n')
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir')
  return root
}

function options(root: string) {
  return {
    cwd: root,
    env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(root, 'no-global-config'), GIT_CONFIG_NOSYSTEM: '1' },
  }
}

async function git(
  root: string,
  args: string[],
) {
  return execute('git', args, options(root))
}

async function tool(
  root: string,
  args: string[],
  env: Record<string, string> = {},
) {
  return execute(process.execPath, ['scripts/quality-tools.mjs', ...args], {
    ...options(root), env: { ...options(root).env, ...env },
  })
}

async function initializedFixture() {
  const root = await fixture()
  await git(root, ['init', '--quiet'])
  await git(root, ['config', 'user.name', 'Quality gate test'])
  await git(root, ['config', 'user.email', 'quality@example.invalid'])
  await writeFile(path.join(root, 'probe.mjs'), "console.log('initial')\n")
  await git(root, ['add', '.'])
  await git(root, ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture'])
  return root
}

it('fails with an installation instruction when pinned tools are missing', async () => {
  const root = await fixture()
  await expect(tool(root, ['verify'], { CUTE_SCREEN_QUALITY_TOOLS_ROOT: path.join(root, 'empty-cache') }))
    .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('pnpm tools:install') })
})

it('rejects a binary whose version differs from its manifest pin', async () => {
  const root = await fixture()
  const file = path.join(root, 'package.json')
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  const pinned = manifest.qualityTools.hk
  manifest.qualityTools.hk = '999.0.0'
  await writeFile(file, JSON.stringify(manifest))
  const cache = path.join(root, 'tools')
  const directory = path.join(cache, 'hk/999.0.0/bin')
  await mkdir(directory, { recursive: true })
  const binary = process.platform === 'win32' ? 'hk.exe' : 'hk'
  const installed = process.env.CUTE_SCREEN_QUALITY_TOOLS_ROOT
    ?? path.join(homedir(), '.cache/cute-screen-ci/quality-tools')
  await copyFile(path.join(installed, 'hk', pinned, 'bin', binary), path.join(directory, binary))
  await expect(tool(root, ['verify'], { CUTE_SCREEN_QUALITY_TOOLS_ROOT: cache }))
    .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining(`expected 999.0.0, found hk ${pinned}`) })
})

it('uses the repository hk config and propagates project failures', async () => {
  const root = await initializedFixture()
  const foreignConfig = path.join(root, 'foreign.pkl')
  await writeFile(foreignConfig, 'This is not a valid hk config')
  await expect(tool(root, ['hk', 'check', '--all'], { HK_FILE: foreignConfig }))
    .rejects.toMatchObject({ code: 17 })
})

it('refuses to replace an existing user hook and installs nothing else', async () => {
  const root = await initializedFixture()
  // Force legacy mode to exercise the file-preservation contract on every Git version.
  const hook = path.join(root, '.git/hooks/pre-commit')
  const original = '#!/bin/sh\nexit 23\n'
  await writeFile(hook, original, { mode: 0o755 })
  await expect(tool(root, ['hk', 'install', '--legacy'])).rejects.toMatchObject({ code: 1 })
  expect(await readFile(hook, 'utf8')).toBe(original)
  await expect(readFile(path.join(root, '.git/hooks/pre-push'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('checks staged content, restores unstaged content and never fixes or stages it', async () => {
  const root = await initializedFixture()
  await tool(root, ['hk', 'install', '--legacy'])
  const probe = path.join(root, 'probe.mjs')
  const staged = "console.log('staged')\n"
  const unstaged = 'const = broken unstaged content\n'
  await writeFile(probe, staged)
  await git(root, ['add', 'probe.mjs'])
  await writeFile(probe, unstaged)
  await git(root, ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'staged content'])
  expect(await readFile(probe, 'utf8')).toBe(unstaged)
  expect((await git(root, ['show', ':probe.mjs'])).stdout).toBe(staged)
  expect((await git(root, ['show', 'HEAD:probe.mjs'])).stdout).toBe(staged)

  const invalid = "const unused = 'staged violation'\n"
  await writeFile(probe, invalid)
  await git(root, ['add', 'probe.mjs'])
  await writeFile(probe, staged)
  await expect(git(root, ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'invalid staged source']))
    .rejects.toMatchObject({ code: 1 })
  expect(await readFile(probe, 'utf8')).toBe(staged)
  expect((await git(root, ['show', ':probe.mjs'])).stdout).toBe(invalid)

  const json = path.join(root, 'probe.json')
  const unformatted = '{"answer":42}\n'
  await writeFile(json, unformatted)
  await git(root, ['reset', '--quiet', 'HEAD', '--', 'probe.mjs'])
  await writeFile(probe, staged)
  await git(root, ['add', 'probe.json'])
  await expect(git(root, ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'invalid staged JSON']))
    .rejects.toMatchObject({ code: 1 })
  expect(await readFile(json, 'utf8')).toBe(unformatted)
  expect((await git(root, ['show', ':probe.json'])).stdout).toBe(unformatted)
}, 30_000)
