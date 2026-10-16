import { spawnSync } from 'node:child_process'
import net from 'node:net'
import {
  copyFile,
  mkdtemp,
  mkdir,
  rm,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { cacheDownloadedEdgeDriver } from './tauri-driver-cache.mjs'

const root = process.cwd()
const artifacts = path.join(root, 'artifacts', 'tauri-e2e')
await mkdir(artifacts, { recursive: true })
const runtimeDirectory = path.join(artifacts, 'runtime')
const driverCache = path.join(artifacts, 'driver-cache')
await mkdir(runtimeDirectory, { recursive: true })

const embeddedWebDriverPort = Number.parseInt(process.env.TAURI_WEBDRIVER_PORT ?? '4445', 10)

const scenarios = [
  {
    id: 'spotlight-preview',
    spec: 'tests/e2e/specs/tauri-spotlight-preview.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'ruler-resolution',
    spec: 'tests/e2e/specs/tauri-ruler-resolution.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'center-rotation',
    spec: 'tests/e2e/specs/tauri-center-rotation.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'loupe-settings',
    spec: 'tests/e2e/specs/tauri-loupe-settings.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'tool-settings',
    spec: 'tests/e2e/specs/tauri-tool-settings.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    persistenceGroup: 'tool-settings',
  },
  {
    id: 'tool-settings-reopen',
    spec: 'tests/e2e/specs/tauri-tool-settings-reopen.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    persistenceGroup: 'tool-settings',
  },
  {
    id: 'custom-icons',
    spec: 'tests/e2e/specs/tauri-custom-icons.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'shape-defaults-placement',
    spec: 'tests/e2e/specs/tauri-shape-defaults-placement.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'highlighter',
    spec: 'tests/e2e/specs/tauri-highlighter.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'quick-editor-handoff',
    spec: 'tests/e2e/specs/tauri-quick-editor-handoff.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'shape-toolbar',
    spec: 'tests/e2e/specs/tauri-shape-toolbar.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'windows-capture-exclusion',
    spec: 'tests/e2e/specs/tauri-windows-capture-exclusion.e2e.ts',
    harnessQuery: '?m04=1',
    interactiveWindows: true,
  },
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
    id: 'quick-chrome',
    spec: 'tests/e2e/specs/tauri-quick-chrome.e2e.ts',
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

const requestedScenarioIds = new Set(
  (process.env.CUTE_SCREEN_E2E_SCENARIOS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
)
const selectedScenarios =
  requestedScenarioIds.size === 0
    ? scenarios.filter((scenario) => !scenario.interactiveWindows)
    : scenarios.filter(({ id }) => requestedScenarioIds.has(id))
if (selectedScenarios.some((scenario) => scenario.interactiveWindows) && process.platform !== 'win32') {
  throw new Error('windows-capture-exclusion requires an interactive Windows desktop')
}
const unknownScenarioIds = [...requestedScenarioIds].filter((id) => !scenarios.some((scenario) => scenario.id === id))
if (unknownScenarioIds.length > 0) {
  throw new Error(`Unknown Tauri E2E scenarios: ${unknownScenarioIds.join(', ')}`)
}

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
      WEBVIEW2_USER_DATA_FOLDER: path.join(directory, 'webview2'),
    }
  }

  return environment
}

function run(
  command,
  args,
  extraEnv = {},
) {
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

async function waitForPortFree(
  port,
  timeoutMs = 30_000,
) {
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

const cargoTargetDirectory = process.env.CARGO_TARGET_DIR
  ? path.resolve(root, process.env.CARGO_TARGET_DIR)
  : path.join(root, 'target')
const builtExecutable = path.join(
  cargoTargetDirectory,
  'debug',
  process.platform === 'win32' ? 'cute-screen.exe' : 'cute-screen',
)
const wdioCli = path.join(root, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js')

const failedScenarios = []
const retainedAppDataDirs = []
const persistenceDirectories = new Map()

try {
  if (run('pnpm', ['fixtures:generate:m01']) !== 0) {
    throw new Error('Tauri E2E fixture generation failed; application will not be launched')
  }
  const buildStatus = run(
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
      CARGO_TARGET_DIR: cargoTargetDirectory,
    },
  )

  if (buildStatus !== 0) {
    throw new Error('Tauri E2E build failed; refusing to test a stale application binary')
  }

  // Other desktop tasks may rebuild target/debug while this suite is running.
  // Pin the successfully built harness before starting any driver or scenario.
  const binaryDirectory = await mkdtemp(path.join(runtimeDirectory, 'cute-screen-e2e-binary-'))
  const executable = path.join(binaryDirectory, path.basename(builtExecutable))
  await copyFile(builtExecutable, executable)
  const help = spawnSync(executable, ['--e2e-harness-query=?m04=1', '--help'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (help.status !== 0) {
    throw new Error('Built binary is not the test harness; another build may have replaced target/debug')
  }
  console.info(`Pinned Tauri test binary: ${executable}`)

  for (const scenario of selectedScenarios) {
    const group = scenario.persistenceGroup
    if (group && !persistenceDirectories.has(group)) {
      persistenceDirectories.set(group, await mkdtemp(path.join(runtimeDirectory, `cute-screen-e2e-${group}-`)))
    }
    const appData = group
      ? persistenceDirectories.get(group)
      : await mkdtemp(path.join(runtimeDirectory, `cute-screen-e2e-${scenario.id}-`))

    await waitForPortFree(embeddedWebDriverPort)

    const scenarioEnv = {
      ...isolatedAppDataEnvironment(appData),
      CUTE_SCREEN_WDIO_APP_BINARY: executable,
      CUTE_SCREEN_WDIO_ARTIFACTS: artifacts,
      CUTE_SCREEN_E2E_SCENARIO: scenario.id,
      CUTE_SCREEN_E2E_DRIVER_PROVIDER: process.env.CUTE_SCREEN_E2E_DRIVER_PROVIDER
        ?? scenario.driverProvider ?? (process.platform === 'win32' ? 'external' : 'embedded'),
      ...(process.platform === 'win32' ? {
        TEMP: runtimeDirectory,
        TMP: runtimeDirectory,
        PATH: `${driverCache}${path.delimiter}${process.env.PATH ?? ''}`,
      } : {}),
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
    if (process.platform === 'win32') await cacheDownloadedEdgeDriver(path.join(runtimeDirectory, 'msedgedriver'), driverCache)

    if (status === 0 && !group) {
      await rm(appData, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
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

for (const [group, directory] of persistenceDirectories) {
  const failed = selectedScenarios.some(
    (scenario) => scenario.persistenceGroup === group && failedScenarios.includes(scenario.id),
  )
  if (failed) {
    if (!retainedAppDataDirs.includes(directory)) retainedAppDataDirs.push(directory)
  } else {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
  }
}

if (failedScenarios.length > 0) {
  process.exitCode = 1
  throw new Error(
    `Tauri E2E failed for: ${failedScenarios.join(', ')}; retained appData=${retainedAppDataDirs.join(', ')}`,
  )
}
