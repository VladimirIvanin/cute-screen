import type { AgentClient } from './contracts'

interface ClientProfile {
  label: string
  format: string
  destination: string
  help: { ru: string; en: string }
}

const mergeJson = {
  ru: 'Добавьте cute-screen в указанный раздел существующего JSON. Сохраните остальные настройки и перезапустите подключение MCP.',
  en: 'Merge cute-screen into the indicated section of your existing JSON. Keep other settings and restart the MCP connection.',
}

export const agentClientProfiles = {
  codex: {
    label: 'Codex', format: 'TOML · mcp_servers', destination: '~/.codex/config.toml',
    help: { ru: 'Добавьте секции mcp_servers.cute-screen в config.toml и перезапустите подключение MCP.',
      en: 'Add the mcp_servers.cute-screen sections to config.toml and restart the MCP connection.' },
  },
  claude: {
    label: 'Claude Code', format: 'JSON · mcpServers', destination: '.mcp.json (Claude Code)', help: mergeJson,
  },
  'claude-desktop': {
    label: 'Claude Desktop', format: 'JSON · mcpServers', destination: 'claude_desktop_config.json',
    help: { ru: 'Откройте Settings → Developer → Edit Config, объедините mcpServers и полностью перезапустите Claude Desktop. Официальные приложения: Windows/macOS.',
      en: 'Open Settings → Developer → Edit Config, merge mcpServers and fully restart Claude Desktop. Official apps: Windows/macOS.' },
  },
  cursor: {
    label: 'Cursor', format: 'JSON · mcpServers', destination: '.cursor/mcp.json / ~/.cursor/mcp.json', help: mergeJson,
  },
  vscode: {
    label: 'VS Code / GitHub Copilot', format: 'JSON · servers', destination: '.vscode/mcp.json',
    help: { ru: 'Объедините servers в .vscode/mcp.json. Запустите сервер и подтвердите доверие в VS Code.',
      en: 'Merge servers into .vscode/mcp.json. Start the server and review trust in VS Code.' },
  },
  gemini: {
    label: 'Gemini CLI', format: 'JSON · mcpServers', destination: '.gemini/settings.json / ~/.gemini/settings.json', help: mergeJson,
  },
  windsurf: {
    label: 'Windsurf / Cascade', format: 'JSON · mcpServers', destination: 'Cascade → MCPs → Open MCP config file',
    help: { ru: 'Откройте конфиг через панель Cascade и объедините mcpServers. Это профиль Cascade в Windsurf / Devin Desktop; новый Devin Local использует другой конфиг.',
      en: 'Open the config from the Cascade panel and merge mcpServers. This profile is for Cascade in Windsurf / Devin Desktop; the newer Devin Local uses a different config.' },
  },
  cline: {
    label: 'Cline', format: 'JSON · mcpServers', destination: 'cline_mcp_settings.json',
    help: { ru: 'В расширении: MCP Servers → Configure → Configure MCP Servers. В CLI: ~/.cline/data/settings/cline_mcp_settings.json. Объедините mcpServers.',
      en: 'Extension: MCP Servers → Configure → Configure MCP Servers. CLI: ~/.cline/data/settings/cline_mcp_settings.json. Merge mcpServers.' },
  },
  roo: {
    label: 'Roo Code', format: 'JSON · mcpServers', destination: '.roo/mcp.json / MCP → Edit Global MCP', help: mergeJson,
  },
  zed: {
    label: 'Zed', format: 'JSON · context_servers', destination: 'Zed → zed: open settings file',
    help: { ru: 'Откройте файл настроек Zed через палитру команд и объедините context_servers. Используйте Zed Agent; терминальные агенты читают свои собственные конфиги.',
      en: 'Open the Zed settings file from the command palette and merge context_servers. Use Zed Agent; terminal agents read their own configs.' },
  },
  continue: {
    label: 'Continue', format: 'YAML · mcpServers[]', destination: '.continue/mcpServers/cute-screen.yaml',
    help: { ru: 'Создайте этот YAML-файл в проекте. Для вызова MCP-инструментов выберите Agent mode в Continue.',
      en: 'Create this YAML file in your project. Choose Agent mode in Continue to use MCP tools.' },
  },
  zcode: {
    label: 'ZCode', format: 'JSON · mcp.servers', destination: '~/.zcode/cli/config.json → mcp.servers', help: mergeJson,
  },
  gigacode: {
    label: 'GigaCode CLI', format: 'JSON · mcpServers', destination: '~/.gigacode/settings.json', help: mergeJson,
  },
  opencode: {
    label: 'OpenCode', format: 'JSON · mcp', destination: 'opencode.json / ~/.config/opencode/opencode.json → mcp', help: mergeJson,
  },
  generic: {
    label: 'Other / stdio', format: 'JSON · command / args / env', destination: 'command / args / env',
    help: { ru: 'Для клиента с ручной формой: имя сервера cute-screen, транспорт stdio. Перенесите command, каждый элемент args и переменную env в соответствующие поля.',
      en: 'For clients with a manual form: server name cute-screen, transport stdio. Enter command, each args item and the env variable into the corresponding fields.' },
  },
} satisfies Record<AgentClient, ClientProfile>
