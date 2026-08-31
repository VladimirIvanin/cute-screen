import { fireEvent, render, screen, within } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  assertLocaleCompleteness,
  createEditorShellPinia,
} from '@cute-screen/editor-vue'
import { renderApp } from './app-test-kit'

describe('M02 editor shell', () => {
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

  it('docks filmstrip, tool rail and zoom in one bottom chrome row', async () => {
    window.localStorage.clear()
    const view = render(EditorShell, {
      props: { fixture: 'ready' },
      global: { plugins: [createEditorShellPinia()] },
    })

    const chrome = view.container.querySelector('.cs-bottom-chrome')
    expect(chrome).toBeTruthy()
    expect(
      chrome?.querySelector('.cs-bottom-chrome-center .cs-toolrail'),
    ).toBeTruthy()
    expect(chrome?.querySelector('.cs-zoom-controls')).toBeTruthy()
    expect(
      view.container.querySelector('.cs-workbench > .cs-toolrail'),
    ).toBeNull()
    await vi.waitFor(() => {
      expect(chrome?.querySelector('.cs-filmstrip')).toBeTruthy()
    })
  })

  it('uses the quick-mode tool contract and hides full editor chrome', () => {
    const view = render(EditorShell, {
      props: { quickMode: true, fixture: 'ready' },
      global: { plugins: [createEditorShellPinia()] },
    })

    expect(view.container.querySelector('.cs-editor-shell')).toHaveClass(
      'is-quick-mode',
    )

    const rail = screen.getByRole('complementary', { name: 'Tools' })
    const labels = within(rail)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
    expect(labels).toEqual([
      'Select',
      'Arrow',
      'Shape',
      'Pencil',
      'Marker',
      'Text',
      'Numbered marker',
      'Callout',
      'Image',
      'Eyedropper',
      'Hide data',
      'Spotlight',
      'Ruler',
      'Loupe',
    ])
    expect(
      screen.queryByRole('button', { name: 'Crop' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Layers' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
  })

  it('keeps all editor chrome hidden while quick mode is selecting', () => {
    const view = render(EditorShell, {
      props: {
        quickMode: true,
        quickSelectionMode: true,
        fixture: 'ready',
      },
      global: { plugins: [createEditorShellPinia()] },
    })

    expect(view.container.querySelector('.cs-bottom-chrome')).toBeNull()
    expect(view.container.querySelector('.cs-quick-toolrail-group')).toBeNull()
    expect(view.container.querySelector('.cs-context-toolbar')).toBeNull()
    expect(view.container.querySelector('.cs-zoom-controls')).toBeNull()
  })
})
