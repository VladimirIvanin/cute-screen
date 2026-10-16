import {
  measuredNumberedMarkerLayer,
  type RichTextContent,
  type TextLayer,
  type CalloutLayer,
  rebaseCalloutLayer,
  type EditorCommand,
} from '@cute-screen/editor-renderer'

/** Point text grows to this document-space width; manual widths are unrestricted. */
export const INITIAL_TEXT_MAX_WIDTH = 480

export { measureRichTextContent as layoutTextContent } from '@cute-screen/editor-renderer'
import { measureRichTextContent as layoutTextContent } from '@cute-screen/editor-renderer'

export function measuredTextLayer<T extends TextLayer>(
  layer: T,
  maximumWidth = Infinity,
): T {
  const current = layer.payload.content
  const natural = layoutTextContent(current)
  const content = current.wrap === 'autoSize' && natural.width > maximumWidth
    ? { ...current, wrap: 'fixedWidth' as const, fixedWidth: maximumWidth } : current
  const layout = content === current ? natural : layoutTextContent(content)
  return { ...layer, localBounds: { ...layer.localBounds, width: layout.width, height: layout.height },
    payload: { ...layer.payload, content } }
}

/** Preserve a single command/history boundary when pasting styles onto a group. */
export function measuredTextCommand(command: EditorCommand): EditorCommand {
  if (command.type === 'batch') return { ...command, commands: command.commands.map(measuredTextCommand) }
  if (command.type === 'updateLayer' && command.after.kind === 'numberedMarker')
    return { ...command, after: measuredNumberedMarkerLayer(command.after) }
  if (command.type === 'updateLayer' && command.after.kind === 'callout')
    return { ...command, after: measuredCalloutLayer(command.after) }
  if (command.type === 'updateLayer' && command.after.kind === 'text')
    return { ...command, after: measuredTextLayer(command.after) }
  return command
}

export function measuredTextHeight(
  content: RichTextContent,
  width: number,
): number {
  return layoutTextContent({ ...content, wrap: 'fixedWidth', fixedWidth: width }).height
}

export function measuredCalloutLayer(
  layer: CalloutLayer,
  maximumWidth = Infinity,
): CalloutLayer {
  const current = layer.payload.content
  const natural = layoutTextContent(current)
  const content = current.wrap === 'autoSize' && natural.width > maximumWidth
    ? { ...current, wrap: 'fixedWidth' as const, fixedWidth: maximumWidth } : current
  return rebaseCalloutLayer(layer, { ...layer.payload, content })
}
