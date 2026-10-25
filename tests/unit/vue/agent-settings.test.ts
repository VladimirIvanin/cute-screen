import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import AgentSettingsPanel from '../../../apps/desktop/src/settings/AgentSettings.vue'
import { agentClientProfiles } from '../../../apps/desktop/src/agent/client-profiles'
import type {
  AgentSettings,
  AgentSettingsBridge,
} from '../../../apps/desktop/src/agent/contracts'

function bridge(): AgentSettingsBridge {
  let state: AgentSettings = { enabled: false, connections: [] }
  return {
    snapshot: async () => state,
    configure: async (enabled) => {
      state = { ...state, enabled }
      return state
    },
    create: async (client) => {
      state = { ...state, connections: [{ id: 'connection', client, connected: false, lastAction: null, lastSeen: null }] }
      return { config: '{"mcpServers":{"cute-screen":{"command":"/app/cute-screen-mcp"}}}', snapshot: state }
    },
    revoke: async () => {
      state = { ...state, connections: [] }
      return state
    },
    check: async () => ({ companion: true, bridge: true, editorReady: true }),
    copy: vi.fn(async () => undefined),
  }
}
describe('agent connection settings', () => {
  it('switches all profiles with their own format and instructions, clearing the previous secret', async () => {
    const adapter = bridge()
    adapter.create = vi.fn(adapter.create)
    render(AgentSettingsPanel, { props: { locale: 'en', bridge: adapter } })
    await fireEvent.click(await screen.findByRole('checkbox'))
    for (const [id, profile] of Object.entries(agentClientProfiles)) {
      await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled())
      await fireEvent.update(screen.getByRole('combobox'), id)
      expect(screen.queryByRole('textbox')).toBeNull()
      expect(screen.getByText(profile.format)).toBeVisible()
      expect(screen.getByText(profile.destination)).toBeVisible()
      expect(screen.getByText(profile.help.en)).toBeVisible()
      await fireEvent.click(screen.getByRole('button', { name: 'Create configuration' }))
      await screen.findByRole('textbox')
      expect(adapter.create).toHaveBeenLastCalledWith(id)
    }
  })

  it('offers OpenCode, shows its destination and requests its configuration', async () => {
    const adapter = bridge()
    adapter.create = vi.fn(adapter.create)
    render(AgentSettingsPanel, { props: { locale: 'ru', bridge: adapter } })
    await fireEvent.click(await screen.findByRole('checkbox'))
    await fireEvent.update(screen.getByRole('combobox'), 'opencode')
    expect(screen.getByRole('combobox')).toHaveValue('opencode')
    expect(screen.getByText('opencode.json / ~/.config/opencode/opencode.json → mcp')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Создать конфигурацию' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Создать конфигурацию' }))
    await waitFor(() => expect(adapter.create).toHaveBeenCalledWith('opencode'))
    await screen.findByRole('textbox')
  })

  it('starts disabled, generates a configuration, copies it and revokes access', async () => {
    const adapter = bridge()
    render(AgentSettingsPanel, { props: { locale: 'en', bridge: adapter } })
    const enable = await screen.findByRole('checkbox', { name: 'Enable agent connections' })
    expect(screen.getByRole('button', { name: 'Create configuration' })).toBeDisabled()
    await fireEvent.click(enable)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create configuration' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Create configuration' }))
    await screen.findByRole('textbox', { name: 'Connection configuration' })
    await fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(adapter.copy).toHaveBeenCalledWith(expect.stringContaining('cute-screen-mcp')))
    await fireEvent.click(screen.getByRole('button', { name: 'Revoke codex' }))
    await screen.findByText('No connections yet')
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('renders recoverable errors and does not claim a successful connection', async () => {
    const adapter = bridge()
    adapter.snapshot = vi.fn().mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue({ enabled: false, connections: [] })
    render(AgentSettingsPanel, { props: { locale: 'en', bridge: adapter } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable')
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('checkbox')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
