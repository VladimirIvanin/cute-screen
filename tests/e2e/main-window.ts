interface TauriWindowSelector {
  tauri: {
    switchWindow(label: string): Promise<void>
  }
}

/**
 * The resident app prewarms a second hidden WebView. Select the editor by its
 * stable Tauri label so WebDriver never runs a scenario in quick-capture.
 */
export async function focusMainTauriWindow(
  browser: TauriWindowSelector,
): Promise<void> {
  await browser.tauri.switchWindow('main')
}
