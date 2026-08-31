export interface AppHarnessConfig {
  readonly fixture: 'empty' | 'error' | 'loading' | 'ready'
  readonly m03: boolean
  readonly m04Capture: boolean
  readonly m04Fallback: boolean
  readonly m05: boolean
  readonly m05Viewport: boolean
  readonly m05ReferencePerf: boolean
  readonly m08: boolean
  readonly m08SourceNotReady: boolean
  readonly m08ClipboardError: boolean
  readonly m08SourceAlpha: number
}

export function readAppHarnessConfig(): AppHarnessConfig {
  const enabled = import.meta.env.VITE_TEST_HARNESS === 'true'
  const query = new URLSearchParams(window.location.search)
  const fixture = enabled
    ? ((query.get('m02') as AppHarnessConfig['fixture'] | null) ?? 'empty')
    : 'empty'
  const m05 = enabled && query.get('m05') === '1'
  const m08 = enabled && query.get('m08') === '1'
  const alpha = query.get('m08alpha')
  return {
    fixture,
    m03: enabled && query.get('m03') === '1',
    m04Capture: enabled && query.get('m04') === '1',
    m04Fallback: enabled && query.get('m04fallback') === '1',
    m05,
    m05Viewport: m05 && query.get('m05viewport') === '1',
    m05ReferencePerf: enabled && query.get('m05perf') === '1',
    m08,
    m08SourceNotReady: m08 && query.get('m08notready') === '1',
    m08ClipboardError: m08 && query.get('m08clipboarderror') === '1',
    m08SourceAlpha:
      m08 && (alpha === '0' || alpha === '128' || alpha === '255')
        ? Number(alpha)
        : 255,
  }
}
