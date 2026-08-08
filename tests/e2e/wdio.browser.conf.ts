import path from 'node:path'

import { saveFailureScreenshot } from './failure-artifacts'

const outputDir = path.resolve('artifacts/browser-e2e')

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/browser-*.e2e.ts'],
  maxInstances: 1,
  logLevel: 'warn',
  baseUrl: 'http://127.0.0.1:5173',
  outputDir,
  services: [
    [
      '@wdio/tauri-service',
      {
        mode: 'browser',
        devServerUrl: 'http://127.0.0.1:5173',
        devServer: {
          command: 'pnpm dev:e2e:browser',
          cwd: process.cwd(),
          reuseExistingServer: false,
          timeoutMs: 60_000,
        },
      },
    ],
  ],
  capabilities: [
    {
      browserName: 'tauri',
      'goog:chromeOptions': {
        // Chrome 138+ disables the software WebGL fallback unless this is
        // explicit. Browser mode intentionally exercises CanvasKit/WebGL,
        // while the application runtime retains its Canvas2D fallback.
        args: ['--enable-unsafe-swiftshader'],
      },
    },
  ],
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
  waitforTimeout: 10_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 2,
  mochaOpts: {
    ui: 'bdd',
    timeout: 30_000,
  },
  afterTest: async (test, _context, { passed }) => {
    await saveFailureScreenshot(outputDir, test.title, passed)
  },
}
