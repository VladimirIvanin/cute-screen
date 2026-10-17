import { invoke } from '@tauri-apps/api/core'
import type { ExportFilenameBridge } from '../../settings/export-filename-contracts'
import type { ExportFilenameSettings } from '../../generated/desktop-ipc'

export const nativeExportFilename: ExportFilenameBridge = {
  load: () => invoke<ExportFilenameSettings>('export_filename_get'),
  preview: (pattern) => invoke<string>('export_filename_preview', { pattern }),
  save: (pattern) => invoke<ExportFilenameSettings>('export_filename_save', { pattern }),
}
