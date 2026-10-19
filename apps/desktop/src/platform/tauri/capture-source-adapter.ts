import { invoke } from '@tauri-apps/api/core'
import type { PlatformCapabilities } from '@cute-screen/editor-vue'
import type { CaptureSourceBridge } from '../../settings/capture-source'

export const nativeCaptureSource: CaptureSourceBridge = {
  available: async () => {
    const capabilities = await invoke<PlatformCapabilities>('platform_capabilities', {
      correlationId: 'screen-selection-settings',
    })
    return capabilities.session === 'wayland' &&
      capabilities.capture.backend === 'waylandPortal' &&
      capabilities.capture.interactiveSelector
  },
  select: () => invoke<boolean>('capture_select_monitor'),
}
