import path from 'node:path'

import { saveFailureScreenshot } from './failure-artifacts'

const appBinaryPath = process.env.CUTE_SCREEN_WDIO_APP_BINARY
const outputDir = path.resolve(
  process.env.CUTE_SCREEN_WDIO_ARTIFACTS ?? 'artifacts/tauri-e2e',
)
const scenarioId = process.env.CUTE_SCREEN_E2E_SCENARIO ?? 'default'
const harnessQuery = process.env.CUTE_SCREEN_E2E_HARNESS_QUERY

if (!appBinaryPath) {
  throw new Error(
    'CUTE_SCREEN_WDIO_APP_BINARY must point to the test-harness binary',
  )
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
        autoDownloadEdgeDriver: false,
        driverProvider: 'embedded',
        appArgs: harnessQuery ? [`--e2e-harness-query=${harnessQuery}`] : [],
        env: {
          CUTE_SCREEN_E2E_SCENARIO: scenarioId,
          ...(harnessQuery
            ? { CUTE_SCREEN_E2E_HARNESS_QUERY: harnessQuery }
            : {}),
        },
      },
    ],
  ],
  capabilities: [{ browserName: 'tauri' }],
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
    timeout: process.env.CUTE_SCREEN_REFERENCE_PASS ? 180_000 : 60_000,
  },
  afterTest: async (test, _context, { passed }) => {
    await saveFailureScreenshot(outputDir, test.title, passed)
  },
}
