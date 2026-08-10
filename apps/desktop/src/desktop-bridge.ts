import { invoke } from '@tauri-apps/api/core'

import type {
  ImageTransportBridge,
  SystemFontCatalogBridge,
  SystemFontFace,
  ContentImageBridge,
  ClipboardBridge,
  NativeClipboardSnapshot,
  CaptureOutcomeV1,
  CaptureRequestV1,
  CaptureResult,
  PlatformCapabilities,
  PortalCapabilityProbe,
  ShortcutBindingResult,
  ShortcutSpec,
  StagedImageMetadata,
  TextureFillBridge,
  TextureImportOutcome,
} from '@cute-screen/editor-vue'

export interface PingResponse {
  readonly message: 'pong'
  readonly protocolVersion: 1
}

export interface DesktopBridge
  extends
    ImageTransportBridge,
    TextureFillBridge,
    ContentImageBridge,
    ClipboardBridge,
    SystemFontCatalogBridge {
  ping(): Promise<PingResponse>
  platformCapabilities(correlationId: string): Promise<PlatformCapabilities>
  captureRequest(request: CaptureRequestV1): Promise<CaptureOutcomeV1>
  captureCancel(): Promise<boolean>
  capturePreflightSetReady(ready: boolean): Promise<void>
  capturePreflightComplete(
    correlationId: string,
    allowed: boolean,
  ): Promise<boolean>
  hotkeysBind(
    shortcuts: readonly ShortcutSpec[],
    correlationId: string,
  ): Promise<readonly ShortcutBindingResult[]>
  /** Available only in builds compiled with the Rust `test-harness` feature. */
  testPortalProbe?(correlationId: string): Promise<PortalCapabilityProbe>
  /** Opens the real system selector; available only in test-harness builds. */
  testPortalCapture?(correlationId: string): Promise<CaptureResult>
  repositoryOpenLast(
    correlationId: string,
  ): Promise<RepositoryOpenDocument | null>
  repositoryOpenImage(correlationId: string): Promise<OpenImageOutcome>
  importContentImage(correlationId: string): Promise<TextureImportOutcome>
  readClipboardSnapshot(correlationId: string): Promise<NativeClipboardSnapshot>
  writeClipboardText(text: string, correlationId: string): Promise<void>
  listSystemFonts(correlationId: string): Promise<readonly SystemFontFace[]>
  clipboardOpenImage(correlationId: string): Promise<ClipboardOpenImageOutcome>
  repositoryListActiveSeriesFrames(
    correlationId: string,
  ): Promise<readonly RepositorySeriesFrame[]>
  repositorySaveDocument(
    documentId: string,
    expectedRevision: number,
    documentJson: string,
    correlationId: string,
  ): Promise<number>
  repositoryExportRecoveryBundle(
    documentId: string,
    correlationId: string,
  ): Promise<RecoveryExportOutcome>
  repositoryImportTexture(correlationId: string): Promise<TextureImportOutcome>
  repositoryResolveTexture(
    blobHash: string,
    correlationId: string,
  ): Promise<TextureImportOutcome>
  lifecycleCompleteMainWindowClose(): Promise<void>
  lifecycleFinishQuit(): Promise<void>
  settingsGet(key: string, correlationId: string): Promise<string | null>
  settingsPut(
    key: string,
    schemaVersion: number,
    valueJson: string,
    correlationId: string,
  ): Promise<void>
}

export interface RepositoryOpenDocument {
  readonly documentId: string
  readonly captureId: string
  readonly revision: number
  readonly documentJson: string
  readonly sourceHash: string
  readonly imageToken?: string
}

export interface RepositorySeriesFrame {
  readonly captureId: string
}

export type OpenImageOutcome =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'opened'; readonly document: RepositoryOpenDocument }

export type ClipboardOpenImageOutcome =
  | { readonly kind: 'noBitmap' }
  | { readonly kind: 'opened'; readonly document: RepositoryOpenDocument }

export type RecoveryExportOutcome =
  { readonly kind: 'saved' } | { readonly kind: 'cancelled' }

export const tauriDesktopBridge: DesktopBridge = {
  ping: () => invoke<PingResponse>('ping'),
  stageImage: (token, correlationId) =>
    invoke<StagedImageMetadata>('stage_image', { token, correlationId }),
  readImageBytes: (token, correlationId) =>
    invoke<ArrayBuffer>('read_image_bytes', { token, correlationId }),
  platformCapabilities: (correlationId) =>
    invoke<PlatformCapabilities>('platform_capabilities', { correlationId }),
  captureRequest: (request) =>
    invoke<CaptureOutcomeV1>('capture_request', { request }),
  captureCancel: () => invoke<boolean>('capture_cancel'),
  capturePreflightSetReady: (ready) =>
    invoke<void>('capture_preflight_set_ready', { ready }),
  capturePreflightComplete: (correlationId, allowed) =>
    invoke<boolean>('capture_preflight_complete', { correlationId, allowed }),
  hotkeysBind: (shortcuts, correlationId) =>
    invoke<readonly ShortcutBindingResult[]>('hotkeys_bind', {
      shortcuts,
      correlationId,
    }),
  testPortalProbe: (correlationId) =>
    invoke<PortalCapabilityProbe>('test_portal_probe', { correlationId }),
  testPortalCapture: (correlationId) =>
    invoke<CaptureResult>('test_portal_capture', { correlationId }),
  repositoryOpenLast: (correlationId) =>
    invoke<RepositoryOpenDocument | null>('repository_open_last', {
      correlationId,
    }),
  repositoryOpenImage: (correlationId) =>
    invoke<OpenImageOutcome>('repository_open_image', { correlationId }),
  importContentImage: (correlationId) =>
    invoke<TextureImportOutcome>('repository_import_content_image', {
      correlationId,
    }),
  readClipboardSnapshot: (correlationId) =>
    invoke<NativeClipboardSnapshot>('clipboard_read_snapshot', {
      correlationId,
    }),
  writeClipboardText: (text, correlationId) =>
    invoke<void>('clipboard_write_text', { text, correlationId }),
  listSystemFonts: (correlationId) =>
    invoke<readonly SystemFontFace[]>('font_catalog_list', { correlationId }),
  clipboardOpenImage: (correlationId) =>
    invoke<ClipboardOpenImageOutcome>('clipboard_open_image', {
      correlationId,
    }),
  repositoryListActiveSeriesFrames: (correlationId) =>
    invoke<readonly RepositorySeriesFrame[]>(
      'repository_list_active_series_frames',
      {
        correlationId,
      },
    ),
  repositorySaveDocument: (
    documentId,
    expectedRevision,
    documentJson,
    correlationId,
  ) =>
    invoke<number>('repository_save_document', {
      documentId,
      expectedRevision,
      documentJson,
      correlationId,
    }),
  repositoryExportRecoveryBundle: (documentId, correlationId) =>
    invoke<RecoveryExportOutcome>('repository_export_recovery_bundle', {
      documentId,
      correlationId,
    }),
  importTexture: (correlationId) =>
    invoke<TextureImportOutcome>('repository_import_texture', {
      correlationId,
    }),
  resolveTexture: (blobHash, correlationId) =>
    invoke<TextureImportOutcome>('repository_resolve_texture', {
      blobHash,
      correlationId,
    }),
  repositoryImportTexture: (correlationId) =>
    invoke<TextureImportOutcome>('repository_import_texture', {
      correlationId,
    }),
  repositoryResolveTexture: (blobHash, correlationId) =>
    invoke<TextureImportOutcome>('repository_resolve_texture', {
      blobHash,
      correlationId,
    }),
  lifecycleCompleteMainWindowClose: () =>
    invoke<void>('lifecycle_complete_main_window_close'),
  lifecycleFinishQuit: () => invoke<void>('lifecycle_finish_quit'),
  settingsGet: (key, correlationId) =>
    invoke<string | null>('settings_get', { key, correlationId }),
  settingsPut: (key, schemaVersion, valueJson, correlationId) =>
    invoke<void>('settings_put', {
      key,
      schemaVersion,
      valueJson,
      correlationId,
    }),
}
