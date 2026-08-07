export type CaptureBackendKind = 'unavailable' | 'waylandPortal' | 'x11'

export interface CaptureCapabilities {
  readonly available: boolean
  readonly backend: CaptureBackendKind
  readonly interactiveSelector: boolean
  readonly monitorTarget: boolean
  readonly windowTarget: boolean
}

export interface HotkeyCapabilities {
  readonly available: boolean
  readonly backend: 'globalShortcutsPortal' | 'native' | 'unavailable'
  readonly canListShortcuts: boolean
}

export type ClipboardCapabilities = Readonly<Record<string, never>>

export type DialogCapabilities = Readonly<Record<string, never>>

export type WindowCapabilities = Readonly<Record<string, never>>

export type LibraryCapabilities = Readonly<Record<string, never>>

export interface PlatformAdapter {
  readonly capture: CaptureCapabilities
  readonly hotkeys: HotkeyCapabilities
  readonly clipboard: ClipboardCapabilities
  readonly dialogs: DialogCapabilities
  readonly windows: WindowCapabilities
  readonly library: LibraryCapabilities
}

export interface PlatformCapabilities {
  readonly correlationId: string
  readonly session: 'macos' | 'wayland' | 'windows' | 'x11' | 'unknown'
  readonly capture: CaptureCapabilities
  readonly hotkeys: HotkeyCapabilities
  readonly cliFallback: boolean
}

export interface PortalCapabilityProbe {
  readonly screenshotVersion: number
  readonly availableTargets: number
  readonly globalShortcutsAvailable: boolean
}

export interface CaptureResult {
  readonly imageToken: string
  readonly correlationId: string
  readonly width: number
  readonly height: number
}
