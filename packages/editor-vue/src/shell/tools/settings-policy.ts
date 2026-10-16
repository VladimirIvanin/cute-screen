/** Automatic defaults describe the next gesture; text is formatted after placement. */
const AUTOMATIC_DEFAULTS_TOOLS = new Set([
  'arrow',
  'shape',
  'pencil',
  'marker',
  'numberedMarker',
  'censor',
  'spotlight',
  'ruler',
  'loupe',
])

export function showsCreationDefaults(toolId: string | undefined): boolean {
  return Boolean(toolId && AUTOMATIC_DEFAULTS_TOOLS.has(toolId))
}

export function hasToolSettings(toolId: string): boolean {
  return showsCreationDefaults(toolId) || ['text', 'callout', 'crop'].includes(toolId)
}
