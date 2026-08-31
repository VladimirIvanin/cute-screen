import { computed, type ComputedRef, type Ref } from 'vue'
import type { ToolDescriptor } from '../types'

type Availability =
  'interactive' | 'editable' | 'canvas' | 'editableCanvas' | 'contentImage'

interface ToolCatalogEntry extends Omit<ToolDescriptor, 'disabled'> {
  readonly availability: Availability
}

const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  {
    id: 'select',
    group: 'canvas',
    icon: 'select',
    labelKey: 'toolSelect',
    shortcut: 'V',
    availability: 'interactive',
  },
  {
    id: 'hand',
    group: 'canvas',
    icon: 'hand',
    labelKey: 'toolHand',
    shortcut: 'H',
    availability: 'interactive',
  },
  {
    id: 'crop',
    group: 'canvas',
    icon: 'crop',
    labelKey: 'toolCrop',
    shortcut: 'C',
    availability: 'editableCanvas',
  },
  {
    id: 'arrow',
    group: 'annotate',
    icon: 'arrow',
    labelKey: 'toolArrow',
    shortcut: 'A',
    availability: 'interactive',
  },
  {
    id: 'shape',
    group: 'annotate',
    icon: 'shape',
    labelKey: 'toolShape',
    shortcut: 'S',
    availability: 'interactive',
  },
  {
    id: 'pencil',
    group: 'annotate',
    icon: 'pencil',
    labelKey: 'toolPencil',
    shortcut: 'P',
    availability: 'interactive',
  },
  {
    id: 'marker',
    group: 'annotate',
    icon: 'marker',
    labelKey: 'toolMarker',
    shortcut: 'M',
    availability: 'interactive',
  },
  {
    id: 'text',
    group: 'annotate',
    icon: 'text',
    labelKey: 'toolText',
    shortcut: 'T',
    availability: 'editable',
  },
  {
    id: 'numberedMarker',
    group: 'annotate',
    icon: 'plus',
    labelKey: 'toolNumberedMarker',
    shortcut: 'N',
    availability: 'editable',
  },
  {
    id: 'callout',
    group: 'annotate',
    icon: 'text',
    labelKey: 'toolCallout',
    shortcut: 'O',
    availability: 'editable',
  },
  {
    id: 'image',
    group: 'annotate',
    icon: 'image',
    labelKey: 'toolImage',
    availability: 'contentImage',
  },
  {
    id: 'eyedropper',
    group: 'more',
    icon: 'eyedropper',
    labelKey: 'toolEyedropper',
    shortcut: 'I',
    availability: 'canvas',
    disabledReasonKey: 'toolNeedsCanvas',
  },
  {
    id: 'censor',
    group: 'more',
    icon: 'privacy',
    labelKey: 'toolPrivacy',
    availability: 'editableCanvas',
  },
  {
    id: 'spotlight',
    group: 'more',
    icon: 'spotlight',
    labelKey: 'toolSpotlight',
    availability: 'editableCanvas',
  },
  {
    id: 'ruler',
    group: 'more',
    icon: 'ruler',
    labelKey: 'toolRuler',
    shortcut: 'R',
    availability: 'editableCanvas',
  },
  {
    id: 'loupe',
    group: 'more',
    icon: 'loupe',
    labelKey: 'toolLoupe',
    shortcut: 'L',
    availability: 'editableCanvas',
  },
]

const QUICK_TOOL_IDS = new Set([
  'select',
  'arrow',
  'shape',
  'pencil',
  'marker',
  'text',
  'numberedMarker',
  'callout',
  'image',
  'eyedropper',
  'censor',
  'spotlight',
  'ruler',
  'loupe',
])

export interface ToolCatalogContext {
  readonly quickMode: boolean
  readonly readOnlyDocument: boolean
  readonly contentImageBridgeAvailable: boolean
  readonly contentImageImporting: Ref<boolean>
  readonly hasInteractiveDocument: ComputedRef<boolean>
  readonly hasCanvas: ComputedRef<boolean>
}

function disabled(
  entry: ToolCatalogEntry,
  context: ToolCatalogContext,
): boolean {
  if (entry.availability === 'interactive') {
    return !context.hasInteractiveDocument.value
  }
  if (entry.availability === 'editable') {
    return !context.hasInteractiveDocument.value || context.readOnlyDocument
  }
  if (entry.availability === 'canvas') return !context.hasCanvas.value
  if (entry.availability === 'editableCanvas') {
    return !context.hasCanvas.value || context.readOnlyDocument
  }
  return (
    !context.hasInteractiveDocument.value ||
    context.readOnlyDocument ||
    !context.contentImageBridgeAvailable ||
    context.contentImageImporting.value
  )
}

function resolveTool(
  entry: ToolCatalogEntry,
  context: ToolCatalogContext,
): ToolDescriptor {
  const { availability, ...descriptor } = entry
  void availability
  const reason = availabilityReason(entry, context)
  if (reason) {
    return {
      ...descriptor,
      disabled: disabled(entry, context),
      disabledReasonKey: reason,
    }
  }
  return { ...descriptor, disabled: disabled(entry, context) }
}

function availabilityReason(
  entry: ToolCatalogEntry,
  context: ToolCatalogContext,
): ToolDescriptor['disabledReasonKey'] {
  if (entry.disabledReasonKey) return entry.disabledReasonKey
  if (entry.availability !== 'editableCanvas') return undefined
  return !context.hasCanvas.value ? 'toolNeedsCanvas' : 'readOnlyDocument'
}

export function createToolCatalog(context: ToolCatalogContext) {
  const allTools = computed<readonly ToolDescriptor[]>(() =>
    TOOL_CATALOG.map((entry) => resolveTool(entry, context)),
  )
  const tools = computed<readonly ToolDescriptor[]>(() =>
    context.quickMode
      ? allTools.value.filter((tool) => QUICK_TOOL_IDS.has(tool.id))
      : allTools.value,
  )
  return { tools }
}
