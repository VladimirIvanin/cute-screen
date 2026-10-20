import { createApp } from 'vue'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import {
  isDesktopRuntime,
  reportUiPreferencesError,
} from './platform/tauri/ui-preferences-adapter'

import { resolveHarnessSearch } from './e2e-harness-query'
import { installInterfaceZoomGuard } from './interface-zoom'
import './styles.css'

const disposeInterfaceZoomGuard = installInterfaceZoomGuard()
import.meta.hot?.dispose(disposeInterfaceZoomGuard)

if (import.meta.env.VITE_TEST_HARNESS === 'true') {
  await import('./test-harness')
}

const harnessSearch = await resolveHarnessSearch()
if (
  import.meta.env.VITE_TEST_HARNESS === 'true' &&
    harnessSearch &&
    !window.location.search
) {
  window.history.replaceState(null, '', `${window.location.pathname}${harnessSearch}`)
}
const harnessParams = new URLSearchParams(harnessSearch)
const pinia = createEditorShellPinia()
if (isDesktopRuntime()) {
  try {
    const { installDesktopUiPreferences } = await import('./platform/tauri/ui-preferences-adapter')
    await installDesktopUiPreferences(useEditorShellStore(pinia))
  } catch (error) {
    reportUiPreferencesError(error)
  }
}
const isM01Harness = import.meta.env.VITE_M01_HARNESS === 'true' && harnessParams.get('m01') === '1'

const isQuickCapture = new URLSearchParams(window.location.search).get('quickCapture') === '1'
const isSettings = ['shortcuts', 'general', 'history'].includes(new URLSearchParams(window.location.search).get('settings') ?? '')
const Root = import.meta.env.VITE_TEST_HARNESS === 'true' && harnessParams.get('historyHarness') === '1'
  ? (await import('./HistoryHarness.vue')).default
  : isM01Harness
    ? (await import('./M01Harness.vue')).default
    : isQuickCapture
      ? (await import('./QuickCaptureApp.vue')).default
      : isSettings
        ? (await import('./SettingsApp.vue')).default
        : (await import('./App.vue')).default

const rootProps = import.meta.env.VITE_TEST_HARNESS === 'true' && isSettings && harnessParams.get('settingsHarness') === '1'
  ? { bridge: (await import('./settings/browser-harness')).createSettingsHarnessBridge() }
  : {}
createApp(Root, rootProps).use(pinia).mount('#app')
