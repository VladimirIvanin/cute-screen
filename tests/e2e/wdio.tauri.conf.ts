import path from 'node:path'
import type { TauriCapabilities } from '@wdio/tauri-service'
import { browser } from '@wdio/globals'

import { saveFailureScreenshot } from './failure-artifacts'
import { focusMainTauriWindow } from './main-window'

const appBinaryPath = process.env.CUTE_SCREEN_WDIO_APP_BINARY
const outputDir = path.resolve(process.env.CUTE_SCREEN_WDIO_ARTIFACTS ?? 'artifacts/tauri-e2e')
const scenarioId = process.env.CUTE_SCREEN_E2E_SCENARIO ?? 'default'
const harnessQuery = process.env.CUTE_SCREEN_E2E_HARNESS_QUERY
let mainWindowSelected = false
const driverProvider = process.env.CUTE_SCREEN_E2E_DRIVER_PROVIDER
  ?? (process.platform === 'win32' ? 'external' : 'embedded')
if (driverProvider !== 'external' && driverProvider !== 'embedded') {
  throw new Error('CUTE_SCREEN_E2E_DRIVER_PROVIDER must be external or embedded')
}

if (!appBinaryPath) {
  throw new Error('CUTE_SCREEN_WDIO_APP_BINARY must point to the test-harness binary')
}

// tauri-driver 2.1.0 forwards this native option; service 1.3.0 only types width/height.
type NativeTauriOptions = NonNullable<TauriCapabilities['tauri:options']> & {
  webviewOptions?: { userDataFolder: string }
}
const tauriCapability: Omit<TauriCapabilities, 'tauri:options'> & { 'tauri:options': NativeTauriOptions } = {
  browserName: 'tauri',
  'tauri:options': {
    application: appBinaryPath,
    args: harnessQuery ? [`--e2e-harness-query=${harnessQuery}`] : [],
    ...(process.platform === 'win32' && process.env.WEBVIEW2_USER_DATA_FOLDER ? {
      webviewOptions: { userDataFolder: process.env.WEBVIEW2_USER_DATA_FOLDER },
    } : {}),
  },
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/tauri-*.e2e.ts'],
  maxInstances: 1,
  logLevel: 'info',
  outputDir,
  services: [
    [
      '@wdio/tauri-service',
      {
        appBinaryPath,
        captureBackendLogs: true,
        captureFrontendLogs: true,
        autoDownloadEdgeDriver: true,
        autoInstallTauriDriver: process.platform === 'win32',
        driverProvider,
        appArgs: harnessQuery ? [`--e2e-harness-query=${harnessQuery}`] : [],
        env: {
          CUTE_SCREEN_E2E_SCENARIO: scenarioId,
          ...(harnessQuery ? { CUTE_SCREEN_E2E_HARNESS_QUERY: harnessQuery } : {}),
        },
      },
    ],
  ],
  capabilities: [tauriCapability],
  framework: 'mocha',
  reporters: [
    'spec',
    [
      'junit',
      {
        outputDir,
        outputFileFormat: ({ cid }) => `junit-${scenarioId}-${cid}.xml`,
      },
    ],
  ],
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  mochaOpts: {
    ui: 'bdd',
    timeout: process.env.CUTE_SCREEN_E2E_SCENARIO === 'history'
      ? 300_000
      : process.env.CUTE_SCREEN_REFERENCE_PASS ? 180_000 : 60_000,
  },
  beforeSuite: async () => {
    // Service setup is complete, and suite fixtures still see the main WebView.
    if (!mainWindowSelected) {
      await focusMainTauriWindow(browser)
      mainWindowSelected = true
    }
  },
  afterTest: async (test, _context, { passed }) => {
    await saveFailureScreenshot(outputDir, test.title, passed)
  },
}
