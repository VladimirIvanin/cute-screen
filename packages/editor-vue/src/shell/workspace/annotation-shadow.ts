import { supportsAnnotationShadow } from '@cute-screen/editor-renderer'
import {
  applyLayerStyle,
  annotationTool,
  type LayerNode,
  type AnnotationTool,
} from '@cute-screen/editor-renderer'
import type { ContextToolbarSchema } from '../types'
import type { EmojiContext } from './emoji-state'

export { supportsAnnotationShadow } from '@cute-screen/editor-renderer'

export function annotationShadowSchema(
  context: EmojiContext,
  schema: ContextToolbarSchema | undefined,
  defaultsTool?: string,
): ContextToolbarSchema | undefined {
  if (!schema) return schema
  if (defaultsTool) {
    if (!supportsAnnotationShadow(defaultsTool)) return schema
    const value = context.workspace.rememberedStyles.value[defaultsTool as AnnotationTool]?.annotationShadow
    return { ...schema, disabled: Boolean(schema.disabled || context.props.readOnlyDocument),
      annotationShadow: value === 'soft' || value === 'strong' ? value : 'none' }
  }
  const layers = context.workspace.activeDocument.value?.layers.filter(
    (layer) => context.store.selectedLayerIds.includes(layer.id),
  ) ?? []
  if (!layers.length || !layers.every((layer) => supportsAnnotationShadow(annotationTool(layer)))) return schema
  const value = layers[0]!.annotationShadow ?? 'none'
  return { ...schema, annotationShadow: layers.every((layer) => (layer.annotationShadow ?? 'none') === value) ? value : 'mixed' }
}

export function changeAnnotationShadow(
  context: EmojiContext,
  layer: LayerNode | undefined,
  props: EmojiContext['props'],
  tool: string | undefined,
  value: string,
): void {
  if (!['none', 'soft', 'strong'].includes(value) || context.props.readOnlyDocument) return
  if (layer) {
    if (!supportsAnnotationShadow(annotationTool(layer)) || layer.locked) return
    props.documentSession?.execute({ type: 'updateLayer', before: layer,
      after: applyLayerStyle(layer, { annotationShadow: value }) })
  } else if (tool && supportsAnnotationShadow(tool)) context.workspace.rememberedStyles.value = {
    ...context.workspace.rememberedStyles.value,
    [tool]: { ...context.workspace.rememberedStyles.value[tool as AnnotationTool], annotationShadow: value },
  }
}

export function retainShadowDefault(
  context: EmojiContext,
  tool: string,
): void {
  const value = context.workspace.rememberedStyles.value[tool as AnnotationTool]?.annotationShadow ?? 'none'
  context.workspace.rememberedStyles.value = {
    ...context.workspace.rememberedStyles.value, [tool]: { annotationShadow: value },
  }
}
