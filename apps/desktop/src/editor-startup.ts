export interface EditorStartupSteps {
  readonly loadPersistedDocument: () => Promise<unknown>
  readonly loadSystemFonts: () => Promise<unknown>
  readonly refreshPlatformCapabilities: () => Promise<unknown>
  readonly installLifecycleGuards: () => Promise<unknown>
}

/**
 * Last-document mount is the only step that may keep the editor on `loading`.
 * Font catalog and capability probes must not block that transition.
 */
export async function runEditorStartup(
  steps: EditorStartupSteps,
): Promise<void> {
  await steps.loadPersistedDocument()
  void steps.loadSystemFonts()
  void steps.refreshPlatformCapabilities()
  await steps.installLifecycleGuards()
}
