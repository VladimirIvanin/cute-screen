import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import App from '../../../apps/desktop/src/App.vue'
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
})
