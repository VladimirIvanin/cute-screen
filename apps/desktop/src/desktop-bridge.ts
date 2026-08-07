import { invoke } from '@tauri-apps/api/core'

export interface PingResponse {
  readonly message: 'pong'
  readonly protocolVersion: 1
}

export interface DesktopBridge {
  ping(): Promise<PingResponse>
}

export const tauriDesktopBridge: DesktopBridge = {
  ping: () => invoke<PingResponse>('ping'),
}
