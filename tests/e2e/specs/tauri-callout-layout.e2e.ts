import { exerciseCalloutLayout } from './callout-layout-scenarios'

describe('Measured callouts in a real Tauri WebView', () => {
  it('creates outside labels through drag, wraps, reopens, resizes and undoes', async () => {
    await exerciseCalloutLayout(process.env.CUTE_SCREEN_WDIO_ARTIFACTS ?? 'artifacts/tauri-e2e')
  })
})
