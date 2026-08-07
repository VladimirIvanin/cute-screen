import type { EditorCoreBoundary } from '@cute-screen/editor-core'

/** Compile-time marker for the renderer-to-core dependency boundary. */
export type EditorRendererBoundary = Readonly<{
  core: EditorCoreBoundary
  package: 'editor-renderer'
}>
