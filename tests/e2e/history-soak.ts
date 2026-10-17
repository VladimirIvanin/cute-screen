import {
  browser,
  expect,
} from '@wdio/globals'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
const execute = promisify(execFile)

async function rss(): Promise<number | null> {
  if (process.platform !== 'linux') return null
  const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
  if (!executable) throw new Error('Missing native executable')
  const { stdout: roots } = await execute('pgrep', ['-f', `^${executable}( |$)`])
  const ids = new Set(roots.trim().split('\n').map(Number))
  const { stdout } = await execute('ps', ['-eo', 'pid=,ppid=,rss='])
  const rows = stdout.trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number))
  let changed = true
  while (changed) {
    changed = false
    for (const [id, parent] of rows) if (
      id &&
      parent &&
      ids.has(parent) &&
      !ids.has(id)
    ) {
      ids.add(id)
      changed = true
    }
  }
  return rows.reduce((total, [id, , value]) => total + (id && ids.has(id) ? value ?? 0 : 0), 0)
}

async function batch(
  ids: readonly string[],
  count: number,
  offset: number,
): Promise<void> {
  await browser.execute(async ({ ids, count, offset }) => {
    const wait = async (condition: () => boolean, phase: string) => {
      const deadline = Date.now() + 15000
      while (!condition()) {
        if (Date.now() > deadline) {
          const state = window as typeof window & { __cuteScreenE2eM08?: { snapshot(): { document: { id: string } } } }
          const trigger = document.querySelector<HTMLButtonElement>('.cs-history-trigger')
          const diagnostic = { phase, doc: state.__cuteScreenE2eM08?.snapshot()?.document.id,
            expanded: trigger?.getAttribute('aria-expanded'), disabled: trigger?.disabled,
            loading: document.querySelector('.cs-history-scroll')?.getAttribute('aria-busy'),
            error: document.querySelector('.cs-history-message[role="alert"]')?.textContent }
          throw new Error(`History navigation did not settle: ${JSON.stringify(diagnostic)}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
    const state = window as typeof window & { __cuteScreenE2eM08?: { snapshot(): { document: { id: string } } } }
    for (let index = 0; index < count; index += 1) {
      const target = (index + offset) % 2
      const trigger = document.querySelector<HTMLButtonElement>('.cs-history-trigger')!
      trigger.click()
      await wait(() => document.querySelectorAll('.cs-history-capture').length === 2
        && document.querySelector('.cs-history-scroll')?.getAttribute('aria-busy') === 'false'
        && document.querySelector('.cs-history-trigger')?.getAttribute('aria-expanded') === 'true', 'page')
      document.querySelectorAll<HTMLButtonElement>('.cs-history-capture')[target]!.click()
      await wait(() => state.__cuteScreenE2eM08?.snapshot()?.document.id === ids[target]
        && document.querySelector('.cs-history-trigger')?.getAttribute('aria-expanded') === 'false'
        && !document.querySelector<HTMLButtonElement>('.cs-history-trigger')?.disabled, `frame-${index + offset}`)
    }
  }, { ids: [...ids], count, offset })
}

export async function historySoak(ids: readonly string[]): Promise<void> {
  for (let index = 0; index < 4; index += 1) await batch(ids, 5, index * 5)
  const samples = [{ switches: 0, rssKiB: await rss() }]
  for (let index = 0; index < 40; index += 1) {
    await batch(ids, 5, index * 5)
    samples.push({ switches: (index + 1) * 5, rssKiB: await rss() })
  }
  await writeFile(path.resolve('artifacts/tauri-e2e/history-soak.json'), JSON.stringify({ platform: process.platform, userAgent: await browser.execute(() => navigator.userAgent), warmupSwitches: 20, samples }, null, 2))
  const baseline = samples[0]!.rssKiB
  const final = samples.at(-1)!.rssKiB
  if (baseline !== null && final !== null) expect(final - baseline).toBeLessThan(96 * 1024)
}

export async function waitForHistoryDocument(): Promise<void> {
  await browser.waitUntil(() => browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eM08?: { snapshot(): { document: unknown } | undefined }
    }
    return Boolean(state.__cuteScreenE2eM08?.snapshot()?.document)
  }), { timeout: 15000 })
}
