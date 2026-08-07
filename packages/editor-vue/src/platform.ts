export type CaptureCapabilities = Readonly<Record<string, never>>

export type HotkeyCapabilities = Readonly<Record<string, never>>

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
