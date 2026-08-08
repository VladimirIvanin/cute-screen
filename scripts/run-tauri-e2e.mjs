import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const appData = await mkdtemp(path.join(tmpdir(), 'cute-screen-e2e-'))
const artifacts = path.join(root, 'artifacts', 'tauri-e2e')
await mkdir(artifacts, { recursive: true })

function isolatedAppDataEnvironment(directory) {
  const environment = { CUTE_SCREEN_E2E_APP_DATA: directory }

  if (process.platform === 'linux') {
    return {
      ...environment,
      XDG_CACHE_HOME: path.join(directory, 'cache'),
      XDG_CONFIG_HOME: path.join(directory, 'config'),
      XDG_DATA_HOME: path.join(directory, 'data'),
      XDG_STATE_HOME: path.join(directory, 'state'),
    }
  }

  if (process.platform === 'win32') {
    return {
      ...environment,
      APPDATA: path.join(directory, 'roaming'),
      LOCALAPPDATA: path.join(directory, 'local'),
    }
  }

  return environment
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const executable = path.join(
  root,
  'target',
  'debug',
  process.platform === 'win32' ? 'cute-screen.exe' : 'cute-screen',
)

try {
  run('pnpm', ['fixtures:generate:m01'])
  run(
    'pnpm',
    [
      'tauri',
      'build',
      '--debug',
      '--no-bundle',
      '--features',
      'fake-platform,test-harness',
      '--config',
      'src-tauri/tauri.test.conf.json',
    ],
    {
      VITE_TEST_HARNESS: 'true',
      VITE_M01_HARNESS: 'true',
    },
  )
  run('pnpm', ['exec', 'wdio', 'run', 'tests/e2e/wdio.tauri.conf.ts'], {
    ...isolatedAppDataEnvironment(appData),
    CUTE_SCREEN_WDIO_APP_BINARY: executable,
    CUTE_SCREEN_WDIO_ARTIFACTS: artifacts,
  })
} finally {
  await rm(appData, { recursive: true, force: true })
}
