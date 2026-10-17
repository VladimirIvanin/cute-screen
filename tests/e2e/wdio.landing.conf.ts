import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'

import { saveFailureScreenshot } from './failure-artifacts'

const outputDir = path.resolve('artifacts/landing-e2e')
const port = process.env.CUTE_SCREEN_LANDING_E2E_PORT ?? '5176'
if (!/^[0-9]+$/u.test(port)) {
  throw new Error('CUTE_SCREEN_LANDING_E2E_PORT must be a decimal port number')
}
const baseUrl = `http://127.0.0.1:${port}/cute-screen/`

async function startLandingServer(): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const serverProcess = spawn(
    process.execPath,
    [
      path.resolve('node_modules/vite/bin/vite.js'),
      'preview',
      '--config',
      path.resolve('apps/landing/vite.config.ts'),
      '--port',
      port,
      '--strictPort',
    ],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
    },
  )

  return {
    url: baseUrl,
    close: async () => {
      if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) return
      serverProcess.kill()
      await once(serverProcess, 'exit')
    },
  }
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/landing.e2e.ts'],
  maxInstances: 1,
  logLevel: 'warn',
  baseUrl,
  outputDir,
  services: [
    [
      '@wdio/tauri-service',
      {
        mode: 'browser',
        devServerUrl: baseUrl,
        devServer: startLandingServer,
      },
    ],
  ],
  capabilities: [
    {
      browserName: 'tauri',
      'goog:chromeOptions': {
        args: [...(process.env.CUTE_SCREEN_BROWSER_E2E_HEADLESS === '1' ? ['--headless=new'] : [])],
      },
    },
  ],
  framework: 'mocha',
  reporters: ['spec'],
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
