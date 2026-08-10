import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

import App from '../../../apps/desktop/src/App.vue'
import ActionFeedback from '../../../packages/editor-vue/src/shell/components/ActionFeedback.vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import TopBar from '../../../packages/editor-vue/src/shell/components/TopBar.vue'
import ZoomControls from '../../../packages/editor-vue/src/shell/components/ZoomControls.vue'
import {
  assertLocaleCompleteness,
  createEditorShellPinia,
  parsePreferences,
  resolveSystemLocale,
} from '@cute-screen/editor-vue'

function renderApp() {
  return render(App, { global: { plugins: [createEditorShellPinia()] } })
}

describe('M02 editor shell', () => {
  it('shows a non-preset Fit percentage in the zoom preset control', () => {
    render(ZoomControls, {
      props: {
        zoom: 22,
        t: (key) => key,
      },
    })

    expect(screen.getByRole('combobox', { name: 'zoom' })).toHaveValue('22')
    expect(screen.getByRole('option', { name: '22%' })).toBeInTheDocument()
  })

  it('disables capture when the native capability probe says it is unavailable', () => {
    render(TopBar, {
      props: {
        locale: 'en',
        theme: 'system',
        canCopyOrExport: false,
        captureAvailable: false,
        captureUnavailableReason: 'Portal backend is unavailable',
        t: (key) => key,
      },
    })

    expect(screen.getByRole('button', { name: 'capture' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'capture' })).toHaveAttribute(
      'title',
      'Portal backend is unavailable',
    )
  })

  it('renders a native selector cancellation as terminal feedback, not an error', () => {
    render(ActionFeedback, {
      props: {
        state: {
          status: 'cancelled',
          action: 'capture',
          message: 'Capture cancelled',
        },
        t: (key) => key,
      },
    })

    expect(screen.getByRole('status')).toHaveTextContent('Capture cancelled')
    expect(
      screen.queryByRole('button', { name: 'retry' }),
    ).not.toBeInTheDocument()
  })

  it('shows and confirms copying the exact CLI fallback when global shortcuts are unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(EditorShell, {
      props: {
        captureFallbackCommand:
          "'/opt/Cute Screen/cute-screen' capture --mode area",
      },
      global: { plugins: [createEditorShellPinia()] },
    })

    expect(
      screen.getByText("'/opt/Cute Screen/cute-screen' capture --mode area"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy capture command' }),
    ).toBeInTheDocument()
    await fireEvent.click(
      screen.getByRole('button', { name: 'Copy capture command' }),
    )
    expect(writeText).toHaveBeenCalledWith(
      "'/opt/Cute Screen/cute-screen' capture --mode area",
    )
    expect(screen.getByText('Capture command copied')).toBeInTheDocument()
    if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('mounts from a clean state with a useful empty canvas', () => {
    renderApp()

    expect(
      screen.getByRole('heading', { name: 'Capture your first screen' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(
      screen.queryByRole('navigation', { name: 'Series frames' }),
    ).not.toBeInTheDocument()
  })

  it('keeps familiar compact actions accessible and labels every icon control', async () => {
    renderApp()
    expect(screen.getByRole('button', { name: 'Capture' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'More actions' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(
      screen.getByRole('menuitemradio', { name: 'Dark' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitemradio', { name: 'RU' }),
    ).toBeInTheDocument()
  })

  it('uses the product locale fallback for corrupt preferences', () => {
    expect(resolveSystemLocale(['ru-RU', 'en-US'])).toBe('ru')
    expect(resolveSystemLocale(['de-DE'])).toBe('en')
    expect(parsePreferences('{broken', ['ru-RU'])).toMatchObject({
      locale: 'ru',
      theme: 'system',
    })
    expect(
      parsePreferences('{"schemaVersion":1,"locale":"fr","theme":"night"}', [
        'en-US',
      ]),
    ).toMatchObject({ locale: 'en', theme: 'system' })
  })

  it('keeps the RU and EN dictionaries complete', () => {
    expect(assertLocaleCompleteness()).toBe(true)
  })

  it('localizes visible shell labels and action feedback without a restart', async () => {
    renderApp()

    await fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await fireEvent.click(screen.getByRole('menuitemradio', { name: 'RU' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: 'Инструменты' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('main', { name: 'Область холста' }),
    ).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Снимок' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Захват станет доступен после подключения native backend.',
    )
  })
})
