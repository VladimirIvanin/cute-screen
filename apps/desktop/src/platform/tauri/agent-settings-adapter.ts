import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AgentSettingsBridge } from '../../agent/contracts'

export const agentSettingsBridge: AgentSettingsBridge = {
  snapshot: () => invoke('mcp_settings'),
  configure: (enabled) => invoke('mcp_configure', { enabled }),
  create: (client) => invoke('mcp_create_connection', { client }),
  revoke: (id) => invoke('mcp_revoke', { id }),
  check: () => invoke('mcp_check'),
  copy: (text) => invoke<void>('clipboard_write_text', { text, correlationId: 'mcp-config' }),
}
export const openAgentSettings = () => invoke<void>('settings_open_agents')
export const listenAgentSettings = (navigate: () => void) => listen<string>('cute-screen:settings-section', (event) => {
  if (event.payload === 'agents') navigate()
})
