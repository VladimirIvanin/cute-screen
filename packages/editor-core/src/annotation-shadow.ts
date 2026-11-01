/** Pixel effects and highlighter retain their own compositing semantics. */
export function supportsAnnotationShadow(tool: string): boolean {
  return ['arrow', 'line', 'shape', 'gradient', 'pencil', 'text', 'callout', 'numberedMarker', 'ruler', 'emoji', 'image'].includes(tool)
}
