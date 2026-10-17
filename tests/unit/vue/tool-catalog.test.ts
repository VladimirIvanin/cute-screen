import {
  computed,
  ref,
} from 'vue'
import {
  describe,
  expect,
  it,
} from 'vitest'

import { createToolCatalog } from '../../../packages/editor-vue/src/shell/tools/catalog'

function mountCatalog(options?: {
  readonly bridge?: boolean
  readonly readOnly?: boolean
}) {
  const contentImageBridgeAvailable = ref(options?.bridge ?? false)
  const readOnlyDocument = ref(options?.readOnly ?? false)
  const contentImageImporting = ref(false)
  const hasInteractiveDocument = computed(() => true)
  const hasCanvas = computed(() => true)
  const { tools } = createToolCatalog({
    quickMode: false,
    readOnlyDocument,
    contentImageBridgeAvailable,
    contentImageImporting,
    hasInteractiveDocument,
    hasCanvas,
  })
  const imageTool = () => tools.value.find((tool) => tool.id === 'image')
  return {
    contentImageBridgeAvailable,
    readOnlyDocument,
    imageTool,
  }
}

describe('tool catalog availability', () => {
  it('enables Image after contentImageBridge arrives asynchronously', () => {
    const catalog = mountCatalog({ bridge: false })
    expect(catalog.imageTool()?.disabled).toBe(true)
    expect(catalog.imageTool()?.disabledReasonKey).toBe('imageImportUnavailable')

    catalog.contentImageBridgeAvailable.value = true
    expect(catalog.imageTool()?.disabled).toBe(false)
    expect(catalog.imageTool()?.disabledReasonKey).toBeUndefined()
  })

  it('reacts to readOnlyDocument without recreating the catalog', () => {
    const catalog = mountCatalog({ bridge: true, readOnly: false })
    expect(catalog.imageTool()?.disabled).toBe(false)

    catalog.readOnlyDocument.value = true
    expect(catalog.imageTool()?.disabled).toBe(true)
    expect(catalog.imageTool()?.disabledReasonKey).toBe('readOnlyDocument')
  })
})
