import { describe, expect, it } from 'vitest'

import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
  simplifySampledPoints,
} from './drawing'

const id = '019c1f62-058e-7000-8000-000000000010'

describe('M06 drawing factories', () => {
  it('does not create a zero-length arrow', () => {
    expect(
      createDrawingLayer({
        id,
        tool: 'arrow',
        start: { x: 10, y: 10 },
        end: { x: 10, y: 10 },
      }),
    ).toBeUndefined()
  })

  it('keeps a marker unselected and uses the highlight blend default', () => {
    expect(
      createDrawingLayer({
        id,
        tool: 'marker',
        start: { x: 10, y: 10 },
        end: { x: 20, y: 10 },
      }),
    ).toMatchObject({
      kind: 'marker',
      blendMode: 'multiply',
      opacity: 0.35,
      // Tight geometry is expanded by the 18 px flat marker stroke.
      localBounds: { width: 28, height: 18 },
    })
  })

  it('stores the Darken marker mode as the layer blend mode', () => {
    const layer = createDrawingLayer({
      id,
      tool: 'marker',
      start: { x: 10, y: 10 },
      end: { x: 20, y: 10 },
      defaults: {
        ...DEFAULT_DRAWING_DEFAULTS,
        marker: { ...DEFAULT_DRAWING_DEFAULTS.marker, mode: 'darken' },
      },
    })
    expect(layer).toMatchObject({ kind: 'marker', blendMode: 'darken' })
  })

  it('constrains arrows to a 45-degree angle', () => {
    const layer = createDrawingLayer({
      id,
      tool: 'arrow',
      start: { x: 0, y: 0 },
      end: { x: 10, y: 2 },
      constrainAngle: true,
    })
    expect(layer).toMatchObject({ kind: 'arrow' })
    const payload = layer?.payload as {
      start: { y: number }
      end: { y: number }
    }
    expect(payload.end.y).toBe(payload.start.y)
  })

  it('keeps quadratic bends and cap geometry inside the persisted bounds', () => {
    const layer = createDrawingLayer({
      id,
      tool: 'arrow',
      start: { x: 20, y: 20 },
      end: { x: 80, y: 20 },
      defaults: {
        ...DEFAULT_DRAWING_DEFAULTS,
        arrow: {
          ...DEFAULT_DRAWING_DEFAULTS.arrow,
          path: 'quadratic',
          startCap: 'triangle',
          endCap: 'triangle',
        },
      },
    })
    expect(layer).toMatchObject({ kind: 'arrow' })
    const payload = layer?.payload as {
      readonly bend: { readonly x: number; readonly y: number }
    }
    expect(payload.bend.y).toBeGreaterThanOrEqual(0)
    expect(payload.bend.x).toBeGreaterThanOrEqual(0)
    expect(layer?.localBounds?.width).toBeGreaterThan(60)
  })

  it('uses a square local geometry for Shift-constrained shapes', () => {
    const layer = createDrawingLayer({
      id,
      tool: 'shape',
      start: { x: 0, y: 0 },
      end: { x: 20, y: 5 },
      constrainAngle: true,
    })
    expect(layer?.localBounds?.width).toBe(layer?.localBounds?.height)
  })

  it('preserves endpoints while dropping dense sampled points', () => {
    expect(
      simplifySampledPoints([
        { x: 0, y: 0, pressure: 0.5 },
        { x: 0.1, y: 0, pressure: 0.5 },
        { x: 2, y: 0, pressure: 0.6 },
      ]),
    ).toEqual([
      { x: 0, y: 0, pressure: 0.5 },
      { x: 2, y: 0, pressure: 0.6 },
    ])
  })
})
