import path from 'node:path'

import { saveFailureScreenshot } from './failure-artifacts'

const appBinaryPath = process.env.CUTE_SCREEN_WDIO_APP_BINARY
const outputDir = path.resolve(
  process.env.CUTE_SCREEN_WDIO_ARTIFACTS ?? 'artifacts/tauri-e2e',
)

if (!appBinaryPath) {
  throw new Error(
    'CUTE_SCREEN_WDIO_APP_BINARY must point to the test-harness binary',
  )
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/tauri-foundation.e2e.ts'],
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
        driverProvider: 'embedded',
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
        outputFileFormat: ({ cid }) => `junit-${cid}.xml`,
      },
    ],
  ],
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  afterTest: async (test, _context, { passed }) => {
    await saveFailureScreenshot(outputDir, test.title, passed)
  },
}
