import type {
  LinuxCaptureMethod,
  LinuxCaptureMethods,
} from '../generated/desktop-ipc'

export interface CaptureSourceBridge {
  snapshot(): Promise<LinuxCaptureMethods | null>
  save(method: LinuxCaptureMethod): Promise<LinuxCaptureMethods>
}
