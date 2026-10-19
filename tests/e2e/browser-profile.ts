import {
  mkdir,
  mkdtemp,
  rm,
} from 'node:fs/promises'
import path from 'node:path'

type ChromeCapabilities = {
  'goog:chromeOptions'?: {
    args?: string[]
    [key: string]: unknown
  }
}

/** One owner per WDIO worker; never scan or remove another runner's profiles. */
export function browserProfileHooks(outputDir: string) {
  let directory: string | undefined

  return {
    beforeSession: async (_config: unknown, capabilities: ChromeCapabilities) => {
      const options = capabilities['goog:chromeOptions'] ?? {}
      const args = options.args ?? []
      if (args.some((arg) => arg.startsWith('--user-data-dir'))) {
        throw new Error('Browser E2E requires an owned temporary Chrome profile')
      }
      await mkdir(outputDir, { recursive: true })
      directory = await mkdtemp(path.join(outputDir, 'chrome-profile-'))
      capabilities['goog:chromeOptions'] = {
        ...options,
        args: [...args, `--user-data-dir=${directory}`],
      }
    },
    afterSession: async () => {
      if (!directory) return
      await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
      directory = undefined
    },
  }
}
