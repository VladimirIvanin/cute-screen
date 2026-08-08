import { createApp } from 'vue'
import { createEditorShellPinia } from '@cute-screen/editor-vue'

import App from './App.vue'
import { resolveHarnessSearch } from './e2e-harness-query'
import './styles.css'

if (import.meta.env.VITE_TEST_HARNESS === 'true') {
  await import('./test-harness')
}

const harnessSearch = await resolveHarnessSearch()
const harnessParams = new URLSearchParams(harnessSearch)
const isM01Harness =
  import.meta.env.VITE_M01_HARNESS === 'true' &&
  harnessParams.get('m01') === '1'

const Root = isM01Harness ? (await import('./M01Harness.vue')).default : App

createApp(Root).use(createEditorShellPinia()).mount('#app')
