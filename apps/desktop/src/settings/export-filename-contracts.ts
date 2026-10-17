import type { ExportFilenameSettings } from '../generated/desktop-ipc'

export interface ExportFilenameBridge {
  load(): Promise<ExportFilenameSettings>
  preview(pattern: string): Promise<string>
  save(pattern: string): Promise<ExportFilenameSettings>
}
