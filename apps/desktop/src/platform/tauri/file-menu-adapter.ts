import { watch } from 'vue'

interface FileMenuShell {
  runFileAction(action: 'openImage' | 'export'): Promise<void> | undefined
  canExport(): boolean
}

export async function installFileMenuListener(
  shell: { readonly value: FileMenuShell | undefined },
  cleanup: Array<() => void>,
): Promise<void> {
  const { listen } = await import('@tauri-apps/api/event')
  const canExport = () => shell.value?.canExport() ?? false
  const stop = watch(canExport, async (enabled) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('app_menu_set_export_enabled', { enabled })
    } catch (error) {
      console.warn('cute-screen file menu state update failed', error)
    }
  }, { immediate: true })
  cleanup.push(stop)
  const unlisten = await listen<string>('cute-screen:file-action', ({ payload }) => {
    if (payload === 'app-open-image') {
      void shell.value?.runFileAction('openImage')
    } else if (payload === 'app-export' && canExport()) {
      void shell.value?.runFileAction('export')
    }
  })
  cleanup.push(unlisten)
}
