import { invoke } from '@tauri-apps/api/core'

import type {
  ImageTransportBridge,
  CaptureResult,
  PlatformCapabilities,
  PortalCapabilityProbe,
  StagedImageMetadata,
} from '@cute-screen/editor-vue'

export interface PingResponse {
  readonly message: 'pong'
  readonly protocolVersion: 1
}

export interface DesktopBridge extends ImageTransportBridge {
  ping(): Promise<PingResponse>
  platformCapabilities(correlationId: string): Promise<PlatformCapabilities>
  /** Available only in builds compiled with the Rust `test-harness` feature. */
  testPortalProbe?(correlationId: string): Promise<PortalCapabilityProbe>
  /** Opens the real system selector; available only in test-harness builds. */
  testPortalCapture?(correlationId: string): Promise<CaptureResult>
  repositoryOpenLast(
    correlationId: string,
  ): Promise<RepositoryOpenDocument | null>
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
  testPortalProbe: (correlationId) =>
    invoke<PortalCapabilityProbe>('test_portal_probe', { correlationId }),
  testPortalCapture: (correlationId) =>
    invoke<CaptureResult>('test_portal_capture', { correlationId }),
  repositoryOpenLast: (correlationId) =>
    invoke<RepositoryOpenDocument | null>('repository_open_last', {
      correlationId,
    }),
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
