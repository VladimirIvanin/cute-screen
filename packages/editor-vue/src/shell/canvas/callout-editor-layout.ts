import {
  calloutTextLayout,
  createCalloutLayer,
  type RichTextLayout,
  type StrokeStyle,
} from '@cute-screen/editor-renderer'
import type { createCanvasWorkspaceState } from './workspace-state'
import { transformCanvasPoint } from './geometry-controller'

type EditingText = NonNullable<ReturnType<typeof createCanvasWorkspaceState>['editingText']['value']>

/** Update the anchored label before restoring the caret, avoiding scroll jumps. */
export function positionCalloutEditor(input: {
  readonly editing: EditingText
  readonly layout: RichTextLayout
  readonly editor: HTMLDivElement
  readonly zoom: number | undefined
  readonly resolveStroke: () => StrokeStyle
}): void {
  const { editing, layout, editor, zoom, resolveStroke } = input
  if (editing.kind !== 'callout') return
  const state = editing.controller.state
  const existing = editing.existing?.kind === 'callout' ? editing.existing : undefined
  const base = existing ?? createCalloutLayer({ id: editing.id, text: state.content.text || ' ',
    target: editing.calloutDraft!.target, label: editing.calloutDraft!.label,
    stroke: editing.calloutStroke ?? resolveStroke(),
  })!
  const geometry = calloutTextLayout({ ...base.payload, content: state.content,
    background: editing.background }, { measureText: () => layout })
  const previous = editing.origin
  editing.origin = transformCanvasPoint(base.transform, geometry.text)
  const scale = (zoom ?? 100) / 100
  editor.style.left = `${Number.parseFloat(editor.style.left || '0') + (editing.origin.x - previous.x) * scale}px`
  editor.style.top = `${Number.parseFloat(editor.style.top || '0') + (editing.origin.y - previous.y) * scale}px`
}
