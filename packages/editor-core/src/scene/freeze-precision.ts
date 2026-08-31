import type {
  Point2D,
  RenderCensorEffect,
  RenderCensorNode,
  RenderCensorRegion,
  RenderLoupeNode,
  RenderRulerNode,
  RenderSpotlightNode,
} from './contracts'
import {
  assertFinite,
  assertNonNegative,
  assertPositive,
  freezeColor,
} from './validation'

export function freezePoint(point: Point2D, field: string): Point2D {
  assertFinite(point.x, `${field}.x`)
  assertFinite(point.y, `${field}.y`)
  return Object.freeze({ x: point.x, y: point.y })
}

export function freezeCensorNode(node: RenderCensorNode): RenderCensorNode {
  if (node.sampleSource !== 'compositeBelow') {
    throw new RangeError(`${node.id}.sampleSource is invalid`)
  }
  const region: RenderCensorRegion =
    node.region.kind === 'rectangle'
      ? (() => {
          assertFinite(node.region.x, `${node.id}.region.x`)
          assertFinite(node.region.y, `${node.id}.region.y`)
          assertPositive(node.region.width, `${node.id}.region.width`)
          assertPositive(node.region.height, `${node.id}.region.height`)
          return Object.freeze({ ...node.region })
        })()
      : (() => {
          if (node.region.points.length < 3) {
            throw new RangeError(`${node.id}.region.points is invalid`)
          }
          return Object.freeze({
            kind: 'freeform' as const,
            points: Object.freeze(
              node.region.points.map((point, index) =>
                freezePoint(point, `${node.id}.region.points[${index}]`),
              ),
            ),
          })
        })()
  let effect: RenderCensorEffect
  if (node.effect.mode === 'pixelate') {
    if (
      !Number.isInteger(node.effect.blockSize) ||
      node.effect.blockSize < 2 ||
      node.effect.blockSize > 128
    ) {
      throw new RangeError(`${node.id}.effect.blockSize is invalid`)
    }
    effect = Object.freeze({ ...node.effect })
  } else if (node.effect.mode === 'blur') {
    if (
      !Number.isFinite(node.effect.strength) ||
      node.effect.strength < 0.5 ||
      node.effect.strength > 128
    ) {
      throw new RangeError(`${node.id}.effect.strength is invalid`)
    }
    effect = Object.freeze({ ...node.effect })
  } else {
    effect = Object.freeze({
      ...node.effect,
      color: freezeColor(node.effect.color),
    })
  }
  return Object.freeze({ ...node, region, effect })
}

export function freezeSpotlightNode(
  node: RenderSpotlightNode,
): RenderSpotlightNode {
  if (!['rectangle', 'ellipse', 'diamond'].includes(node.aperture.shape)) {
    throw new RangeError(`${node.id}.aperture.shape is invalid`)
  }
  assertFinite(node.aperture.x, `${node.id}.aperture.x`)
  assertFinite(node.aperture.y, `${node.id}.aperture.y`)
  assertPositive(node.aperture.width, `${node.id}.aperture.width`)
  assertPositive(node.aperture.height, `${node.id}.aperture.height`)
  if (
    !Number.isFinite(node.dimOpacity) ||
    node.dimOpacity < 0 ||
    node.dimOpacity > 1
  ) {
    throw new RangeError(`${node.id}.dimOpacity is invalid`)
  }
  if (
    node.feather !== null &&
    node.feather !== 'soft' &&
    node.feather !== 'strong'
  ) {
    throw new RangeError(`${node.id}.feather is invalid`)
  }
  return Object.freeze({
    ...node,
    aperture: Object.freeze({ ...node.aperture }),
    dimColor: freezeColor(node.dimColor),
  })
}

export function freezeRulerNode(node: RenderRulerNode): RenderRulerNode {
  for (const [field, value] of Object.entries({
    x1: node.x1,
    y1: node.y1,
    x2: node.x2,
    y2: node.y2,
    length: node.length,
    angleDegrees: node.angleDegrees,
    percent: node.percent,
  })) {
    assertFinite(value, `${node.id}.${field}`)
  }
  if (node.length <= 0 || node.percent < 0 || !node.label) {
    throw new RangeError(`${node.id} ruler measurement is invalid`)
  }
  if (
    node.percentBasis !== 'canvasDiagonal' ||
    (node.unit !== 'pixels' && node.unit !== 'percent')
  ) {
    throw new RangeError(`${node.id} ruler unit is invalid`)
  }
  if (
    !Number.isInteger(node.thickness) ||
    node.thickness < 1 ||
    node.thickness > 12
  ) {
    throw new RangeError(`${node.id}.thickness is invalid`)
  }
  if (
    !Number.isInteger(node.fontSize) ||
    node.fontSize < 10 ||
    node.fontSize > 48
  ) {
    throw new RangeError(`${node.id}.fontSize is invalid`)
  }
  return Object.freeze({ ...node, color: freezeColor(node.color) })
}

export function freezeLoupeNode(node: RenderLoupeNode): RenderLoupeNode {
  if (node.sampleSource !== 'compositeBelow') {
    throw new RangeError(`${node.id}.sampleSource is invalid`)
  }
  for (const [field, value] of Object.entries(node.sourceRegion)) {
    if (field === 'width' || field === 'height') {
      assertPositive(value, `${node.id}.sourceRegion.${field}`)
    } else {
      assertFinite(value, `${node.id}.sourceRegion.${field}`)
    }
  }
  if (node.lens.shape !== 'circle' && node.lens.shape !== 'rectangle') {
    throw new RangeError(`${node.id}.lens.shape is invalid`)
  }
  assertFinite(node.lens.x, `${node.id}.lens.x`)
  assertFinite(node.lens.y, `${node.id}.lens.y`)
  assertPositive(node.lens.size, `${node.id}.lens.size`)
  if (!Number.isFinite(node.zoom) || node.zoom < 1 || node.zoom > 16) {
    throw new RangeError(`${node.id}.zoom is invalid`)
  }
  if (
    !Number.isFinite(node.border.width) ||
    node.border.width < 0 ||
    node.border.width > 64
  ) {
    throw new RangeError(`${node.id}.border.width is invalid`)
  }
  const shadow =
    node.shadow === null
      ? null
      : (() => {
          assertFinite(node.shadow.offsetX, `${node.id}.shadow.offsetX`)
          assertFinite(node.shadow.offsetY, `${node.id}.shadow.offsetY`)
          assertNonNegative(node.shadow.blur, `${node.id}.shadow.blur`)
          return Object.freeze({
            ...node.shadow,
            color: freezeColor(node.shadow.color),
          })
        })()
  return Object.freeze({
    ...node,
    sourceRegion: Object.freeze({ ...node.sourceRegion }),
    lens: Object.freeze({ ...node.lens }),
    border: Object.freeze({
      ...node.border,
      color: freezeColor(node.border.color),
    }),
    shadow,
  })
}
