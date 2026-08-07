import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { browser } from '@wdio/globals'

export async function saveFailureScreenshot(
  outputDirectory: string,
  title: string,
  passed: boolean,
): Promise<void> {
  if (passed) return

  await mkdir(outputDirectory, { recursive: true })
  const safeTitle = title.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '')
  await browser.saveScreenshot(
    path.join(outputDirectory, `failure-${safeTitle || 'test'}.png`),
  )
}
