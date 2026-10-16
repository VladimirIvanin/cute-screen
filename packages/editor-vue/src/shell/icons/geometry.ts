/** Monochrome geometry, including solid liquid/rubber parts; theme and sizing belong to UiIcon. */
export type IconPrimitive =
  | readonly ['path', { readonly d: string; readonly fill?: 'currentColor'; readonly stroke?: 'none' }]
  | readonly ['circle', { readonly cx: number; readonly cy: number; readonly r: number }]
  | readonly ['rect', { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx?: number }]
  | readonly ['line', { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }]
  | readonly ['polyline' | 'polygon', { readonly points: string }]
  | readonly ['ellipse', { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }]

export type IconGeometry = readonly IconPrimitive[]

// Original Cute Screen drawings, MIT. Compare as a family at 18 CSS px.
// User reference: upright chisel nib pointing up, a short collar and broad rounded shoulders.
export const markerGeometry = [
  ['path', { d: 'M9 9V5l6-3v7' }],
  ['path', { d: 'M7 13v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2' }],
  ['path', { d: 'M4 21v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6' }],
] as const satisfies IconGeometry

// A diagonal pencil with a sharp graphite tip and a separate eraser band.
export const pencilGeometry = [
  ['path', { d: 'M4 20l1-5L16 4l4 4L9 19Z' }],
  ['path', { d: 'm5 15 4 4M14 6l4 4' }],
] as const satisfies IconGeometry

// Design candidates share the same source and renderer as the selected UiIcon.
export const outlineEyedropperGeometry = [
  ['path', { d: 'M14 6a3 3 0 1 1 3 3l-1 1-3-3Z' }],
  ['path', { d: 'm12 6 6 6M13.5 7.5 5 16l-1 4 4-1 8.5-8.5' }],
] as const satisfies IconGeometry

export const filledEyedropperGeometry = [
  ['path', { d: 'M14 6l2-2a2.8 2.8 0 0 1 4 4l-2 2-1 1-4-4Z', fill: 'currentColor' }],
  ['path', { d: 'M13.5 7.5 5 16a2.1 2.1 0 0 0 3 3l8.5-8.5' }],
  ['path', { d: 'M7 14h6l-5 5a2.1 2.1 0 0 1-3-3Z', fill: 'currentColor', stroke: 'none' }],
  ['path', { d: 'm12.35 4.65 7 7a1.2 1.2 0 0 1-1.7 1.7l-7-7a1.2 1.2 0 0 1 1.7-1.7Z', fill: 'currentColor', stroke: 'none' }],
] as const satisfies IconGeometry

export const dropEyedropperGeometry = [
  ['path', { d: 'M14 6l2-2a2.8 2.8 0 0 1 4 4l-2 2-1 1-4-4Z' }],
  ['path', { d: 'm12 6 6 6M13.5 7.5 7 14l-1 3 3-1 7.5-5.5' }],
  ['path', { d: 'M4 18c-.8 1.1-2 2.2-2 3a2 2 0 0 0 4 0c0-.8-1.2-1.9-2-3Z', fill: 'currentColor', stroke: 'none' }],
] as const satisfies IconGeometry

// The liquid is visible at small sizes without a detached extra symbol.
export const eyedropperGeometry = filledEyedropperGeometry

// Uniform 45-degree background, occluded by the window. Hatch endpoints meet
// the outline without clearance; approved in the project's icon workbench.
export const spotlightGeometry = [
  ['path', { d: 'M2.5 7.5L7.5 2.5M2.5 14.5L6 11M8 9L14.5 2.5M2.5 21.5L9 15' }],
  ['path', { d: 'M15 9L21.5 2.5M9.5 21.5L16 15M18 13L21.5 9.5M16.5 21.5L21.5 16.5' }],
  ['rect', { x: 6, y: 9, width: 12, height: 6, rx: 0.75 }],
] as const satisfies IconGeometry
