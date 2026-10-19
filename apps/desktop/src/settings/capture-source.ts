export interface CaptureSourceBridge {
  available(): Promise<boolean>
  select(): Promise<boolean>
}
