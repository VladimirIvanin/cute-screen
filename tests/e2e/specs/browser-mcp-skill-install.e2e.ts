import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { mkdir } from 'node:fs/promises'

const installCommand = 'npx --yes skills add VladimirIvanin/cute-screen --skill cute-screen-annotate --yes'

describe('MCP skill installation instructions', () => {
  for (const locale of ['ru', 'en']) for (const theme of ['light', 'dark']) {
    it(`copies the command with MCP off and fits ${locale} / ${theme}`, async () => {
      await mkdir('artifacts/mcp-skill-install', { recursive: true })
      await browser.url('/?settings=general&settingsHarness=1')
      await browser.execute((language, appearance) => {
        localStorage.setItem('cute-screen.ui-preferences.v1', JSON.stringify({
          schemaVersion: 1,
          locale: language,
          theme: appearance,
        }))
      }, locale, theme)
      await browser.refresh()
      await expect($('.cs-settings')).toBeDisplayed()
      // Mock only the native IPC boundary; Settings mounts the production panel.
      await browser.execute(() => {
        const state = window as unknown as {
          __TAURI_INTERNALS__: { invoke(command: string, args?: { text: string }): Promise<unknown> }
          copiedSkillCommand?: string | undefined
        }
        state.__TAURI_INTERNALS__ = {
          invoke: async (command, args) => {
            if (command === 'mcp_settings') return { enabled: false, connections: [] }
            if (command === 'clipboard_write_text') {
              state.copiedSkillCommand = args?.text
              return
            }
            throw new Error(`Unexpected IPC: ${command}`)
          },
        }
      })
      await $('.cs-settings-sidebar nav button:nth-child(4)').click()
      await expect($('.cs-agent-skill')).toBeDisplayed()
      await expect($('.cs-agent-enable input')).not.toBeSelected()
      await expect($('.cs-agent-skill code')).toHaveText(installCommand)
      const copy = $('.cs-agent-skill button')
      await expect(copy).toBeEnabled()
      await copy.click()
      const copied = await browser.execute(() => {
        return (window as unknown as { copiedSkillCommand: string }).copiedSkillCommand
      })
      expect(copied).toBe(installCommand)
      await expect($('.cs-agent-settings [role="status"]')).toHaveText(
        locale === 'ru' ? 'Команда установки скопирована' : 'Install command copied',
      )
      for (const width of [820, 620]) {
        await browser.setWindowSize(width, 760)
        await copy.scrollIntoView({ block: 'center' })
        expect(await browser.execute(() => {
          const panel = document.querySelector('.cs-settings-scroll')!
          const code = document.querySelector('.cs-agent-skill pre')!
          return panel.scrollWidth <= panel.clientWidth && code.scrollWidth <= code.clientWidth
        })).toBe(true)
      }
      await browser.saveScreenshot(`artifacts/mcp-skill-install/${locale}-${theme}.png`)
    })
  }
})
