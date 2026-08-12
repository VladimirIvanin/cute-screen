export type CaptureBackendKind =
  'unavailable' | 'waylandPortal' | 'windowsDxgi' | 'x11'

export interface CaptureCapabilities {
  readonly available: boolean
  readonly backend: CaptureBackendKind
  readonly interactiveSelector: boolean
  readonly monitorTarget: boolean
  readonly windowTarget: boolean
  readonly activeWindowTarget: boolean
  readonly cursor: boolean
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
  readonly cliFallbackCommand?: string
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
  readonly geometry?: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    readonly sourceWidth: number
    readonly sourceHeight: number
    readonly layoutFingerprint?: string
    readonly monitorIds?: readonly string[]
  }
}

export type CaptureAction =
  'area' | 'screen' | 'window' | 'activeWindow' | 'repeat'
export type CaptureInvocationSource = 'cli' | 'tray' | 'ui' | 'hotkey'
export type CaptureTerminalOutcome =
  | 'captured'
  | 'cancelled'
  | 'busy'
  | 'permissionDenied'
  | 'unavailable'
  | 'invalidTarget'
  | 'failed'

export type CaptureProgressState =
  'probing' | 'ready' | 'delay' | 'selecting' | 'capturing' | 'persisting'

export interface CaptureProgressV1 {
  readonly version: 1
  readonly correlationId: string
  readonly state: CaptureProgressState
}

export interface CaptureRequestV1 {
  readonly correlationId: string
  readonly action: CaptureAction
  readonly delayMs: number
  readonly cursor: boolean
  readonly seriesId?: string
  readonly invocationSource: CaptureInvocationSource
}

export interface CaptureOutcomeV1 {
  readonly version: 1
  readonly correlationId: string
  readonly outcome: CaptureTerminalOutcome
  readonly document?: {
    readonly documentId: string
    readonly captureId: string
    readonly revision: number
    readonly documentJson: string
    readonly sourceHash: string
    readonly imageToken?: string
  }
}

export interface ShortcutSpec {
  readonly id: string
  readonly preferredTrigger?: string
}

export interface ShortcutBindingResult {
  readonly id: string
  readonly active: boolean
  readonly correlationId: string
}
