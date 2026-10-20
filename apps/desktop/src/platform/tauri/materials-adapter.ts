import { invoke } from '@tauri-apps/api/core'
import type {
  MaterialBridge,
  MaterialRecord,
} from '@cute-screen/editor-vue'
import type { MaterialRecord as NativeMaterial } from '../../generated/desktop-ipc'

export const nativeMaterialBridge: MaterialBridge = {
  list: async () => (await invoke<NativeMaterial[]>('materials_list')).map((record): MaterialRecord => {
    const kind = record.kind
    if (
      kind !== 'preset' &&
      kind !== 'gradient' &&
      kind !== 'background' &&
      kind !== 'logo'
    ) throw new Error('Unsupported material kind')
    return { ...record, kind }
  }),
  put: (record) => invoke<void>('materials_put', record),
  remove: (id) => invoke<void>('materials_remove', { id }),
}
