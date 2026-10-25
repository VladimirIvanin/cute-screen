import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  McpClient,
  type McpConfiguration,
} from './mcp-client'

export function parseMcpConfiguration(config: string): McpConfiguration {
  if (config.startsWith('{')) {
    const parsed = JSON.parse(config) as McpConfiguration & {
      mcpServers?: Record<string, McpConfiguration>
      servers?: Record<string, McpConfiguration>
      context_servers?: Record<string, McpConfiguration>
      mcp?: { servers?: Record<string, McpConfiguration>; 'cute-screen'?: { command: string[]; environment: Record<string, string> } }
    }
    const entry = parsed.mcpServers?.['cute-screen'] ?? parsed.servers?.['cute-screen']
      ?? parsed.context_servers?.['cute-screen'] ?? parsed.mcp?.servers?.['cute-screen']
    if (entry) return entry
    const local = parsed.mcp?.['cute-screen']
    if (local) return { command: local.command[0]!, args: local.command.slice(1), env: local.environment }
    return parsed
  }
  if (config.startsWith('name: Cute Screen MCP\n')) {
    const value = (key: string) => JSON.parse(config.split('\n').find((line) => line.startsWith(`    ${key}: `))!.slice(key.length + 6))
    return { command: value('command'), args: value('args'), env: value('env') }
  }
  const value = (key: string) => JSON.parse(config.split('\n').find((line) => line.startsWith(`${key} = `))!.slice(key.length + 3))
  return { command: value('command'), args: value('args'), env: { CUTE_SCREEN_MCP_TOKEN: value('CUTE_SCREEN_MCP_TOKEN') } }
}

export async function selectMcpClient(client: string): Promise<void> {
  await expect($('#mcp-client')).toBeEnabled()
  if (process.env.CUTE_SCREEN_E2E_DRIVER_PROVIDER === 'embedded') {
    // Embedded webdriver 1.3.0 clicks OPTION via el.click(), which cannot change
    // a native SELECT. Send normal form events to the production Vue handler.
    await browser.execute((value: string) => {
      const select = document.querySelector<HTMLSelectElement>('#mcp-client')
      if (!select || select.disabled) throw new Error('client selector unavailable')
      select.value = value
      select.dispatchEvent(new Event('input', { bubbles: true }))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }, client)
  } else {
    await $('#mcp-client').selectByAttribute('value', client)
  }
  await expect($('#mcp-client')).toHaveValue(client)
}

export async function connectAgent(): Promise<McpClient> {
  if (!(await browser.tauri.listWindows()).includes('settings')) {
    await browser.tauri.switchWindow('main')
    await browser.setWindowSize(1280, 800)
    await $('.cs-agent-connect').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
  }
  await browser.tauri.switchWindow('settings')
  const navigation = $('.cs-settings-sidebar nav button:nth-child(4)')
  await navigation.click()
  await expect($('.cs-agent-settings')).toBeDisplayed()
  await expect($('.cs-agent-settings')).toHaveAttribute('aria-busy', 'false')
  await selectMcpClient('codex')
  if (!(await $('.cs-agent-enable input').isSelected())) await $('.cs-agent-enable input').click()
  await expect($('.cs-agent-buttons button')).toBeEnabled()
  const existing = $('button[aria-label^="Open configuration Codex"]')
  if (await existing.isExisting()) await existing.click()
  else await $('.cs-agent-buttons button').click()
  await expect($('#mcp-config')).toBeDisplayed()
  const client = new McpClient(parseMcpConfiguration(await $('#mcp-config').getValue()))
  await client.initialize()
  return client
}

export async function waitForCapture(
  client: McpClient,
  jobId: unknown,
): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> = {}
  await browser.waitUntil(async () => {
    result = await client.data('get_job', { jobId })
    return result.status === 'finished'
  }, { timeout: 20000, interval: 100 })
  return result.result as Record<string, unknown>
}
