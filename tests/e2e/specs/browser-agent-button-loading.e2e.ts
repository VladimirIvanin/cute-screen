import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { setEditorPreferences } from '../editor-settings'
import {
  mkdir,
  writeFile,
} from 'node:fs/promises'

type PendingAgent = { calls: number; release(): void; restore(): void }
type ProbeWindow = Window & { __agentLoading?: PendingAgent }

describe('connect agent loading geometry', () => {
  it('keeps button and neighboring actions stable while native settings open', async () => {
    await browser.setWindowSize(1600, 900)
    await browser.url('/')
    await browser.execute(() => localStorage.clear())
    await browser.url('/?m02=ready')
    await expect($('.cs-editor-shell')).toExist()
    const reports = []
    for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      await browser.execute(() => {
        const state = window as typeof window & {
          __TAURI_INTERNALS__: { invoke(command: string, ...args: unknown[]): Promise<unknown> }
          __agentLoading?: PendingAgent
        }
        const native = state.__TAURI_INTERNALS__
        const original = native.invoke
        let release: () => void = () => undefined
        const probe: PendingAgent = { calls: 0, release: () => release(), restore: () => {
          release()
          native.invoke = original
          delete state.__agentLoading
        } }
        state.__agentLoading = probe
        native.invoke = (command, ...args) => {
          if (command !== 'settings_open_agents') return original.call(native, command, ...args)
          probe.calls++
          return new Promise((resolve) => {
            release = () => resolve(undefined)
          })
        }
      })
      const agent = $('.cs-agent-connect')
      const before = await browser.execute(() =>
        ['.cs-agent-connect', '.cs-top-actions', '.cs-button-primary'].map((selector) => {
          const r = document.querySelector(selector)!.getBoundingClientRect()
          return [r.x, r.y, r.width, r.height]
        }))
      try {
        await agent.click()
        await expect(agent).toBeDisabled()
        await expect(agent).toHaveAttribute('aria-busy', 'true')
        const observed = await browser.execute(async () => {
          const samples: number[][][] = []
          for (let frame = 0; frame < 24; frame++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            samples.push(['.cs-agent-connect', '.cs-top-actions', '.cs-button-primary'].map((selector) => {
              const r = document.querySelector(selector)!.getBoundingClientRect()
              return [r.x, r.y, r.width, r.height]
            }))
          }
          return samples
        })
        const delta = Math.max(...observed.flatMap((sample) => sample.flatMap((box, index) =>
          box.map((value, axis) => Math.abs(value - before[index]![axis]!)))))
        await browser.saveScreenshot(`artifacts/browser-e2e/agent-button-loading-${locale}-${theme}.png`)
        expect(delta).toBeLessThanOrEqual(0.5)
        const calls = await browser.execute(() => (window as ProbeWindow).__agentLoading!.calls)
        expect(calls).toBe(1)
        reports.push({ locale, theme, before, maxPendingDelta: delta, calls })
        await browser.execute(() => (window as ProbeWindow).__agentLoading!.release())
        await expect(agent).toBeEnabled()
        await expect(agent).toHaveAttribute('aria-busy', 'false')
      } finally {
        await browser.execute(() => (window as ProbeWindow).__agentLoading?.restore())
      }
    }
    await mkdir('artifacts/agent-button-loading', { recursive: true })
    await writeFile('artifacts/agent-button-loading/geometry.json', JSON.stringify(reports, null, 2))
  }).timeout(90000)
})
