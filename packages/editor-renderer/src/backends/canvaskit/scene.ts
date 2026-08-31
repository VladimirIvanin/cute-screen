import type { RenderNode, RenderSceneSnapshot } from '@cute-screen/editor-core'
import { scaledOutputSize } from '../../precision-rendering'
import type { RenderExportOptions } from '../../types'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitImage,
  CanvasKitImageResource,
  CanvasKitSurface,
} from './contracts'
import {
  drawCensorCanvasKit,
  drawRulerCanvasKit,
  drawSnapshotCanvasKit,
  drawSpotlightCanvasKit,
} from './effects'
import { CanvasKitTypefaceStore } from './geometry'
import { drawImageNodeCanvasKit } from './image-node'
import { drawLoupeCanvasKit } from './loupe-effect'
import { drawNodesCanvasKit } from './nodes'

interface SceneContext {
  readonly canvasKit: CanvasKitApi
  readonly surface: CanvasKitSurface
  readonly canvas: CanvasKitCanvas
  readonly scene: RenderSceneSnapshot
  readonly resources: ReadonlyMap<string, CanvasKitImageResource>
  readonly typefaces: CanvasKitTypefaceStore | undefined
  readonly scale: number
}

function drawOrderedNode(context: SceneContext, node: RenderNode): void {
  switch (node.kind) {
    case 'censor':
      drawCensorCanvasKit(
        context.canvasKit,
        context.surface,
        context.canvas,
        context.scene,
        node,
        context.scale,
      )
      return
    case 'spotlight':
      drawSpotlightCanvasKit(
        context.canvasKit,
        context.surface,
        context.canvas,
        context.scene,
        node,
        context.scale,
      )
      return
    case 'ruler':
      drawRulerCanvasKit(
        context.canvasKit,
        context.canvas,
        node,
        context.typefaces,
      )
      return
    case 'loupe':
      drawLoupeCanvasKit(
        context.canvasKit,
        context.surface,
        context.canvas,
        context.scene,
        node,
        context.scale,
      )
      return
    case 'image':
      drawImageNodeCanvasKit(
        context.canvasKit,
        context.canvas,
        node,
        context.resources,
      )
      return
    default:
      drawNodesCanvasKit(
        context.canvasKit,
        context.canvas,
        [node],
        context.resources,
        context.typefaces,
      )
  }
}

export function drawScene(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  scene: RenderSceneSnapshot,
  resources: ReadonlyMap<string, CanvasKitImageResource>,
  typefaces?: CanvasKitTypefaceStore,
  scale = 1,
  translateToOutput = false,
): void {
  const canvas = surface.getCanvas()
  canvas.clear(canvasKit.TRANSPARENT)
  canvas.save()
  try {
    canvas.scale(scale, scale)
    if (translateToOutput) {
      canvas.translate(-scene.outputBounds.x, -scene.outputBounds.y)
    }
    const context: SceneContext = {
      canvasKit,
      surface,
      canvas,
      scene,
      resources,
      typefaces,
      scale,
    }
    for (const node of scene.nodes) {
      if (node.visible && node.opacity !== 0) drawOrderedNode(context, node)
    }
  } finally {
    canvas.restore()
  }
  surface.flush()
}

function encodePng(canvasKit: CanvasKitApi, image: CanvasKitImage): Uint8Array {
  const bytes = image.encodeToBytes(canvasKit.ImageFormat.PNG)
  if (!bytes) throw new Error('CanvasKit PNG encoding failed')
  return new Uint8Array(bytes)
}

function copyCroppedSnapshot(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  fullImage: CanvasKitImage,
  scene: RenderSceneSnapshot,
  scale: number,
): void {
  const size = scaledOutputSize(scene.outputBounds, scale)
  const canvas = surface.getCanvas()
  canvas.clear(canvasKit.TRANSPARENT)
  const paint = new canvasKit.Paint()
  try {
    paint.setAntiAlias(false)
    paint.setColorComponents(1, 1, 1, 1)
    drawSnapshotCanvasKit(
      canvasKit,
      canvas,
      fullImage,
      canvasKit.XYWHRect(
        scene.outputBounds.x * scale,
        scene.outputBounds.y * scale,
        scene.outputBounds.width * scale,
        scene.outputBounds.height * scale,
      ),
      canvasKit.XYWHRect(0, 0, size.width, size.height),
      paint,
    )
  } finally {
    paint.delete()
  }
  surface.flush()
}

function encodeCroppedPng(
  canvasKit: CanvasKitApi,
  fullImage: CanvasKitImage,
  scene: RenderSceneSnapshot,
  scale: number,
): Uint8Array {
  const size = scaledOutputSize(scene.outputBounds, scale)
  const surface = canvasKit.MakeSurface(size.width, size.height)
  if (!surface) throw new Error('CanvasKit cropped surface creation failed')
  try {
    copyCroppedSnapshot(canvasKit, surface, fullImage, scene, scale)
    const image = surface.makeImageSnapshot()
    try {
      return encodePng(canvasKit, image)
    } finally {
      image.delete()
    }
  } finally {
    surface.dispose()
  }
}

function encodeSceneSurface(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  scene: RenderSceneSnapshot,
  scale: number,
): Uint8Array {
  const image = surface.makeImageSnapshot()
  try {
    const fullOutput =
      scene.outputBounds.x === 0 &&
      scene.outputBounds.y === 0 &&
      scene.outputBounds.width === scene.width &&
      scene.outputBounds.height === scene.height
    return fullOutput
      ? encodePng(canvasKit, image)
      : encodeCroppedPng(canvasKit, image, scene, scale)
  } finally {
    image.delete()
  }
}

export function renderCanvasKitPng(
  canvasKit: CanvasKitApi,
  scene: RenderSceneSnapshot,
  resources: ReadonlyMap<string, CanvasKitImageResource>,
  typefaces: CanvasKitTypefaceStore,
  options: RenderExportOptions = {},
): Uint8Array {
  const scale = options.scale ?? 1
  const width = Math.max(1, Math.round(scene.width * scale))
  const height = Math.max(1, Math.round(scene.height * scale))
  const surface = canvasKit.MakeSurface(width, height)
  if (!surface) throw new Error('CanvasKit headless surface creation failed')
  try {
    drawScene(canvasKit, surface, scene, resources, typefaces, scale)
    return encodeSceneSurface(canvasKit, surface, scene, scale)
  } finally {
    surface.dispose()
  }
}
