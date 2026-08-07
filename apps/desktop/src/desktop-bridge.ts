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
}

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
}
