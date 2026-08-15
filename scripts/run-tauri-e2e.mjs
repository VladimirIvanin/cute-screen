import { spawnSync } from 'node:child_process'
import net from 'node:net'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const artifacts = path.join(root, 'artifacts', 'tauri-e2e')
await mkdir(artifacts, { recursive: true })

const embeddedWebDriverPort = Number.parseInt(
  process.env.TAURI_WEBDRIVER_PORT ?? '4445',
  10,
)

const scenarios = [
  {
    id: 'foundation',
    spec: 'tests/e2e/specs/tauri-foundation.e2e.ts',
  },
  {
    id: 'shell',
    spec: 'tests/e2e/specs/tauri-shell.e2e.ts',
    harnessQuery: '?m02=ready',
  },
  {
    id: 'arrow',
    spec: 'tests/e2e/specs/tauri-arrow.e2e.ts',
    harnessQuery: '?m05=1',
  },
  {
    id: 'v7-rich-text',
    spec: 'tests/e2e/specs/tauri-v7-rich-text.e2e.ts',
    harnessQuery: '?m05=1',
  },
  {
    id: 'm05-viewport',
    spec: 'tests/e2e/specs/tauri-m05-viewport.e2e.ts',
    harnessQuery: '?m05=1&m05viewport=1',
  },
  {
    id: 'document-write',
    spec: 'tests/e2e/specs/document-persistence-write.e2e.ts',
    harnessQuery: '?m03=1',
    persistenceGroup: 'm03',
  },
  {
    id: 'document-reopen',
    spec: 'tests/e2e/specs/document-persistence-reopen.e2e.ts',
    harnessQuery: '?m03=1',
    persistenceGroup: 'm03',
  },
  {
    id: 'm04-clean-profile-capture',
    spec: 'tests/e2e/specs/m04-clean-profile-capture.e2e.ts',
    harnessQuery: '?m04=1',
    fakeCapture: true,
  },
  {
    id: 'm08-crop-first-open',
    spec: 'tests/e2e/specs/tauri-m08-crop-first-open.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'm08-eyedropper-clipboard',
    spec: 'tests/e2e/specs/tauri-m08-eyedropper-clipboard.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'renderer-alpha',
    spec: 'tests/e2e/specs/tauri-renderer-alpha.e2e.ts',
    harnessQuery: '?m01=1&token=m01-alpha-png',
  },
  {
    id: 'renderer-binary',
    spec: 'tests/e2e/specs/tauri-renderer-binary.e2e.ts',
    harnessQuery: '?m01=1&assetFailure=1&token=m01-icc-png',
  },
  {
    id: 'renderer-exif',
    spec: 'tests/e2e/specs/tauri-renderer-exif.e2e.ts',
    harnessQuery: '?m01=1&token=m01-exif-png',
  },
  {
    id: 'renderer-corrupted',
    spec: 'tests/e2e/specs/tauri-renderer-corrupted.e2e.ts',
    harnessQuery: '?m01=1&token=m01-corrupted-png',
  },
]

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
  return result.status ?? 1
}

function isPortInUse(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        resolve(false)
        return
      }
      reject(error)
    })
  })
}

async function waitForPortFree(port, timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const inUse = await isPortInUse(port)
    if (!inUse) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `Embedded WebDriver port ${port} is still in use after ${timeoutMs}ms; previous app instance did not exit`,
  )
}

const executable = path.join(
  root,
  'target',
  'debug',
  process.platform === 'win32' ? 'cute-screen.exe' : 'cute-screen',
)
const wdioCli = path.join(
  root,
  'node_modules',
  '@wdio',
  'cli',
  'bin',
  'wdio.js',
)

const failedScenarios = []
const retainedAppDataDirs = []
let m03AppData

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

  for (const scenario of scenarios) {
    const appData =
      scenario.persistenceGroup === 'm03'
        ? (m03AppData ??= await mkdtemp(
            path.join(tmpdir(), 'cute-screen-e2e-m03-'),
          ))
        : await mkdtemp(path.join(tmpdir(), `cute-screen-e2e-${scenario.id}-`))

    await waitForPortFree(embeddedWebDriverPort)

    const scenarioEnv = {
      ...isolatedAppDataEnvironment(appData),
      CUTE_SCREEN_WDIO_APP_BINARY: executable,
      CUTE_SCREEN_WDIO_ARTIFACTS: artifacts,
      CUTE_SCREEN_E2E_SCENARIO: scenario.id,
    }
    if (scenario.harnessQuery) {
      scenarioEnv.CUTE_SCREEN_E2E_HARNESS_QUERY = scenario.harnessQuery
    }
    if (scenario.fakeCapture) {
      scenarioEnv.CUTE_SCREEN_E2E_FAKE_CAPTURE = '1'
    }

    const status = run(
      process.execPath,
      [wdioCli, 'run', 'tests/e2e/wdio.tauri.conf.ts', '--spec', scenario.spec],
      scenarioEnv,
    )

    if (status === 0 && scenario.persistenceGroup !== 'm03') {
      await rm(appData, { recursive: true, force: true })
      continue
    }

    if (status === 0) continue

    failedScenarios.push(scenario.id)
    retainedAppDataDirs.push(appData)
  }
} catch (error) {
  process.exitCode = 1
  throw error
}

if (m03AppData) {
  if (failedScenarios.some((id) => id.startsWith('document-'))) {
    retainedAppDataDirs.push(m03AppData)
  } else {
    await rm(m03AppData, { recursive: true, force: true })
  }
}

if (failedScenarios.length > 0) {
  process.exitCode = 1
  throw new Error(
    `Tauri E2E failed for: ${failedScenarios.join(', ')}; retained appData=${retainedAppDataDirs.join(', ')}`,
  )
}
