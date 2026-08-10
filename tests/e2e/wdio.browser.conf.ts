import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'

import { saveFailureScreenshot } from './failure-artifacts'

const outputDir = path.resolve('artifacts/browser-e2e')
const devServerUrl = 'http://127.0.0.1:5173'

async function startBrowserDevServer(): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const devServerProcess = spawn(
    process.execPath,
    [
      path.resolve('node_modules/vite/bin/vite.js'),
      '--mode',
      'e2e',
      '--config',
      path.resolve('apps/desktop/vite.config.ts'),
    ],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
    },
  )

  return {
    url: devServerUrl,
    close: async () => {
      if (
        devServerProcess.exitCode !== null ||
        devServerProcess.signalCode !== null
      ) {
        return
      }
      devServerProcess.kill()
      await once(devServerProcess, 'exit')
    },
  }
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/browser-*.e2e.ts'],
  maxInstances: 1,
  logLevel: 'warn',
  baseUrl: devServerUrl,
  outputDir,
  services: [
    [
      '@wdio/tauri-service',
      {
        mode: 'browser',
        devServerUrl,
        devServer: startBrowserDevServer,
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
