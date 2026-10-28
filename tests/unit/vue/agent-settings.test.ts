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
  const configs = new Map<string, string>()
  let nextId = 0
  return {
    snapshot: async () => state,
    configure: async (enabled) => {
      state = { ...state, enabled }
      return state
    },
    create: async (client) => {
      const id = `connection-${++nextId}`
      const config = JSON.stringify({ mcpServers: { 'cute-screen': { command: '/app/cute-screen-mcp', id } } })
      configs.set(id, config)
      state = {
        ...state,
        connections: [...state.connections, { id, client, connected: false, lastAction: null, lastSeen: null }],
      }
      return { id, config, snapshot: state }
    },
    configuration: async (id) => {
      const config = configs.get(id)
      if (!config) throw new Error('Connection was revoked')
      return config
    },
    revoke: async (id) => {
      configs.delete(id)
      state = { ...state, connections: state.connections.filter((entry) => entry.id !== id) }
      return state
    },
    check: async () => ({ companion: true, bridge: true, editorReady: true }),
    copy: vi.fn(async () => undefined),
  }
}
describe('agent connection settings', () => {
  it('copies the skill command with MCP off and updates its guidance when the locale changes', async () => {
    const adapter = bridge()
    adapter.create = vi.fn(adapter.create)
    const view = render(AgentSettingsPanel, { props: { locale: 'en', bridge: adapter } })
    const copy = await screen.findByRole('button', { name: 'Copy install command' })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(copy).toBeEnabled()
    expect(screen.getByText(/Run this command in a terminal from your project folder/u)).toBeVisible()
    await fireEvent.click(copy)
    await waitFor(() => expect(adapter.copy).toHaveBeenCalledWith(
      'npx --yes skills add VladimirIvanin/cute-screen --skill cute-screen-annotate --yes',
    ))
    expect(await screen.findByRole('status')).toHaveTextContent('Install command copied')
    expect(adapter.create).not.toHaveBeenCalled()
    await view.rerender({ locale: 'ru' })
    expect(screen.getByRole('heading', { name: 'Навык для агента' })).toBeVisible()
    expect(screen.getByText(/Выполните команду в терминале из папки проекта/u)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Скопировать команду' })).toBeEnabled()
  })

  it('disables copying while pending and retries a failed skill-command copy', async () => {
    const adapter = bridge()
    let rejectCopy: (reason: Error) => void = () => undefined
    adapter.copy = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectCopy = reject
    })).mockResolvedValue(undefined)
    render(AgentSettingsPanel, { props: { locale: 'en', bridge: adapter } })
    const copy = await screen.findByRole('button', { name: 'Copy install command' })
    await fireEvent.click(copy)
    expect(copy).toBeDisabled()
    rejectCopy(new Error('Clipboard unavailable'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Clipboard unavailable')
    expect(screen.queryByText('Install command copied')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Install command copied')
    expect(adapter.copy).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(adapter.copy).toHaveBeenCalledWith(expect.stringContaining('cute-screen-mcp')))
    await fireEvent.click(screen.getByRole('button', { name: /^Revoke Codex/u }))
    await screen.findByText('No connections yet')
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('reopens and copies an existing config after remount without creating a new key', async () => {
    const adapter = bridge()
    adapter.create = vi.fn(adapter.create)
    let view = render(AgentSettingsPanel, { props: { locale: 'en', bridge: adapter } })
    await fireEvent.click(await screen.findByRole('checkbox'))
    await fireEvent.click(screen.getByRole('button', { name: 'Create configuration' }))
    const original = (await screen.findByRole('textbox') as HTMLTextAreaElement).value
    view.unmount()
    view = render(AgentSettingsPanel, { props: { locale: 'en', bridge: adapter } })
    await fireEvent.click(await screen.findByRole('button', { name: /^Open configuration Codex/u }))
    expect(await screen.findByRole('textbox')).toHaveValue(original)
    expect(screen.getByRole('textbox')).toHaveFocus()
    await fireEvent.click(screen.getByRole('button', { name: 'Hide configuration' }))
    await fireEvent.click(screen.getByRole('button', { name: /^Copy configuration Codex/u }))
    await waitFor(() => expect(adapter.copy).toHaveBeenCalledWith(original))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(adapter.create).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('adds independent keys for one client and revokes only the selected connection', async () => {
    const adapter = bridge()
    render(AgentSettingsPanel, { props: { locale: 'en', bridge: adapter } })
    await fireEvent.click(await screen.findByRole('checkbox'))
    await fireEvent.click(screen.getByRole('button', { name: 'Create configuration' }))
    await screen.findByRole('textbox')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create another key' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Create another key' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Open configuration Codex/u })).toHaveLength(2))
    const second = (screen.getByRole('textbox') as HTMLTextAreaElement).value
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Revoke Codex/u })[0]).toBeEnabled())
    await fireEvent.click(screen.getAllByRole('button', { name: /^Revoke Codex/u })[0]!)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Open configuration Codex/u })).toHaveLength(1))
    expect(screen.getByRole('textbox')).toHaveValue(second)
    await fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create another key' })).toBeDisabled())
    await fireEvent.click(screen.getByRole('button', { name: /^Open configuration Codex/u }))
    expect(await screen.findByRole('textbox')).toHaveValue(second)
  })

  it('retries a failed existing-config copy without generating or revoking keys', async () => {
    const adapter = bridge()
    adapter.create = vi.fn(adapter.create)
    adapter.revoke = vi.fn(adapter.revoke)
    render(AgentSettingsPanel, { props: { locale: 'en', bridge: adapter } })
    await fireEvent.click(await screen.findByRole('checkbox'))
    await fireEvent.click(screen.getByRole('button', { name: 'Create configuration' }))
    const original = (await screen.findByRole('textbox') as HTMLTextAreaElement).value
    await fireEvent.click(screen.getByRole('button', { name: 'Hide configuration' }))
    adapter.configuration = vi.fn().mockRejectedValueOnce(new Error('Credential unavailable')).mockResolvedValue(original)
    await fireEvent.click(screen.getByRole('button', { name: /^Copy configuration Codex/u }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Credential unavailable')
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(adapter.copy).toHaveBeenCalledWith(original))
    expect(adapter.configuration).toHaveBeenCalledTimes(2)
    expect(adapter.create).toHaveBeenCalledTimes(1)
    expect(adapter.revoke).not.toHaveBeenCalled()
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
