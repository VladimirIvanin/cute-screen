import type { EditorDocument } from '../document/types'
import type {
  RenderNode,
  RenderSceneSnapshot,
} from '../scene/contracts'
import { createRenderSceneSnapshot } from '../scene/snapshot'
import { resolveCompositionLayout } from './layout'
import { backgroundNodes } from './scene-background'
import { brandingGroup } from './scene-branding'
import {
  frameNodes,
  frameRadius,
  hasWindowChrome,
} from './scene-frame'
import {
  cardShadow,
  visibleNode,
} from './scene-primitives'

export function composeDocumentScene(
  document: EditorDocument,
  content: RenderSceneSnapshot,
  cardNodes: readonly RenderNode[],
): RenderSceneSnapshot {
  const settings = document.presentation.composition
  if (!settings) return content
  const l = resolveCompositionLayout(document)
  if (
    l.width > 32768 ||
    l.height > 32768 ||
    l.width * l.height > 134217728
  ) throw new Error('Composition exceeds the image pixel budget')
  const bounds = { x: 0, y: 0, width: l.width, height: l.height }
  const windowChrome = hasWindowChrome(settings.frame)
  const nodes: RenderNode[] = [
    ...backgroundNodes('card:background', bounds, settings.background, content),
    ...backgroundNodes('card:header', l.header, settings.header.fill, content),
    ...backgroundNodes('card:footer', l.footer, settings.footer.fill, content),
    ...cardShadow(l.frame, frameRadius(settings, l), settings.shadow),
    ...frameNodes(settings, l),
    { ...visibleNode, id: 'card:content', kind: 'group', scene: content, destination: l.content,
      clip: l.screen, cornerRadius: settings.frame.kind === 'phone'
        ? Math.min(l.screen.width, l.screen.height) * 0.07 : windowChrome ? 0 : settings.radius,
      ...(windowChrome
        ? { outerClip: { bounds: l.frame, cornerRadius: frameRadius(settings, l) } } : {}), blur: 0 },
    ...cardNodes,
    ...settings.branding.map((b) => brandingGroup(b, l)),
  ]
  return createRenderSceneSnapshot({ width: l.width, height: l.height, nodes })
}
