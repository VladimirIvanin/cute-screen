export type AgentClient = 'codex' | 'claude' | 'cursor' | 'zcode' | 'gigacode' | 'opencode'
  | 'claude-desktop' | 'vscode' | 'gemini' | 'windsurf' | 'cline' | 'roo' | 'zed' | 'continue' | 'generic'
export interface AgentConnection {
  id: string
  client: AgentClient
  connected: boolean
  lastAction: string | null
  lastSeen: number | null
}
export interface AgentSettings { enabled: boolean; connections: readonly AgentConnection[] }
export interface AgentSettingsBridge {
  snapshot(): Promise<AgentSettings>
  configure(enabled: boolean): Promise<AgentSettings>
  create(client: AgentClient): Promise<{ id: string; config: string; snapshot: AgentSettings }>
  configuration(id: string): Promise<string>
  revoke(id: string): Promise<AgentSettings>
  check(): Promise<{ companion: boolean; editorReady: boolean; bridge: boolean }>
  copy(text: string): Promise<void>
}
