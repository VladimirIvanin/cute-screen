import { invoke } from '@tauri-apps/api/core'
import type { CaptureSourceBridge } from '../../settings/capture-source'

export const nativeCaptureSource: CaptureSourceBridge = {
  snapshot: () => invoke('capture_methods'),
  save: (method) => invoke('capture_set_method', { method }),
}
