import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorDocumentFromImage,
  createComposition,
  createRulerLayer,
  contentToCard,
  resolveCompositionLayout,
} from '@cute-screen/editor-renderer'
import {
  DocumentSessionController,
  createEditorShellPinia,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import type {
  MaterialBridge,
  MaterialRecord,
} from '../../../packages/editor-vue/src/materials'
import {
  compositionViewport,
  mergeCompositionView,
} from '../../../packages/editor-vue/src/shell/canvas/composition-view'
import type {
  CanvasViewportEmit,
  CanvasViewportProps,
} from '../../../packages/editor-vue/src/shell/canvas/contracts'
import {
  shallowReactive,
  markRaw,
} from 'vue'
function initial() {
  return createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000', baseLayerId: '019c1f62-058e-7000-8000-000000000001',
    timestamp: '2026-10-20T00:00:00Z', source: { blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', provenance: 'fileOpen',
      width: 3840, height: 2160, orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
}
describe('publication card interface', () => {
  it('saves templates after naming, keeps failed drafts, cancels with focus and removes only the library entry', async () => {
    localStorage.clear()
    let items: MaterialRecord[] = []
    let fail = true
    let releaseSave: (() => void) | undefined
    const bridge: MaterialBridge = {
      list: async () => items,
      put: async (record) => {
        if (fail) throw new Error('Disk unavailable')
        await new Promise<void>((resolve) => {
          releaseSave = resolve
        })
        items = [...items, { ...record, byteSize: 0 }]
      },
      remove: async (id) => {
        items = items.filter((item) => item.id !== id)
      },
    }
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) }, correlationId: () => 'templates' })
    const view = render(EditorShell, { props: { documentSession: markRaw(session), materialBridge: bridge },
      global: { plugins: [createEditorShellPinia()] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const panel = screen.getByRole('complementary', { name: 'Appearance' })
      const controls = within(panel)
      expect(controls.getByRole('group', { name: 'Ready-made templates' }).querySelectorAll('svg')).toHaveLength(3)
      expect(controls.queryByRole('button', { name: 'Materials' })).toBeNull()
      const trigger = controls.getByRole('button', { name: 'Save template…' })
      expect(trigger).toBeDisabled()
      await fireEvent.click(controls.getByRole('button', { name: 'My templates' }))
      expect(await controls.findByText('Save an appearance to reuse it on other screenshots.')).toBeVisible()
      expect(session.snapshot.core.canUndo).toBe(false)
      await fireEvent.click(controls.getByRole('button', { name: 'Browser' }))
      const before = session.snapshot.core.document
      await fireEvent.click(trigger)
      const name = controls.getByRole('textbox', { name: 'Template name' })
      expect(name).toHaveFocus()
      expect(controls.getByRole('button', { name: 'Save' })).toBeDisabled()
      await fireEvent.keyDown(name, { key: 'Escape' })
      await vi.waitFor(() => expect(trigger).toHaveFocus())
      expect(panel).toBeVisible()
      await fireEvent.click(trigger)
      await fireEvent.input(controls.getByRole('textbox', { name: 'Template name' }), { target: { value: 'Publication' } })
      await fireEvent.submit(controls.getByRole('form', { name: 'Save template' }))
      expect(await controls.findByRole('alert')).toHaveTextContent('Disk unavailable')
      expect(controls.getByRole('textbox', { name: 'Template name' })).toHaveValue('Publication')
      fail = false
      await fireEvent.submit(controls.getByRole('form', { name: 'Save template' }))
      expect(controls.getByRole('textbox', { name: 'Template name' })).toBeDisabled()
      expect(controls.getByRole('button', { name: 'Saving…' })).toBeDisabled()
      expect(controls.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      releaseSave!()
      await vi.waitFor(() => expect(controls.queryByRole('textbox', { name: 'Template name' })).toBeNull())
      expect(trigger).toHaveFocus()
      expect(items.map((item) => item.kind)).toEqual(['preset'])
      expect(session.snapshot.core.document).toEqual(before)
      await fireEvent.click(controls.getByRole('button', { name: 'Publication' }))
      const remove = controls.getByRole('button', { name: 'Remove saved item Publication' })
      await fireEvent.click(remove)
      const confirm = controls.getByRole('group', { name: 'Remove saved item' })
      await fireEvent.keyDown(within(confirm).getByRole('button', { name: 'Cancel' }), { key: 'Escape' })
      await vi.waitFor(() => expect(remove).toHaveFocus())
      await fireEvent.click(remove)
      await fireEvent.click(within(controls.getByRole('group', { name: 'Remove saved item' })).getByRole('button', { name: 'Remove' }))
      await vi.waitFor(() => expect(controls.queryByRole('button', { name: 'Publication' })).toBeNull())
      expect(items).toHaveLength(0)
      expect(session.snapshot.core.document).toEqual(before)
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('keeps saved backgrounds and logos beside their settings, applies only the chosen part and saves only a background', async () => {
    localStorage.clear()
    const bg = { ...createComposition().background, kind: 'solid' as const }
    let items: MaterialRecord[] = [
      { id: 'background', kind: 'gradient', title: 'Forest', valueJson: JSON.stringify(bg), byteSize: 0 },
      { id: 'logo', kind: 'logo', title: 'Company', valueJson: JSON.stringify({ blobHash: 'b'.repeat(64), width: 64, height: 64, format: 'png' }), byteSize: 0 },
    ]
    const bridge: MaterialBridge = { list: async () => items,
      put: async (record) => {
        items = [...items, { ...record, byteSize: 0 }]
      }, remove: async () => undefined }
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) }, correlationId: () => 'contextual-library' })
    const view = render(EditorShell, { props: { documentSession: markRaw(session), materialBridge: bridge },
      global: { plugins: [createEditorShellPinia()] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const controls = within(screen.getByRole('complementary', { name: 'Appearance' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Browser' }))
      const before = session.snapshot.core.document
      await fireEvent.click(controls.getByRole('button', { name: 'Background' }))
      await fireEvent.click(await controls.findByRole('button', { name: 'Forest' }))
      expect(controls.queryByRole('button', { name: 'Company' })).toBeNull()
      expect(session.snapshot.core.document.presentation.composition)
        .toEqual({ ...before.presentation.composition, background: bg })
      session.undo()
      expect(session.snapshot.core.document).toEqual(before)
      await fireEvent.click(controls.getByRole('button', { name: 'Save this background…' }))
      await fireEvent.input(controls.getByRole('textbox', { name: 'Background name' }), { target: { value: 'My backdrop' } })
      await fireEvent.submit(controls.getByRole('form', { name: 'Save background' }))
      await vi.waitFor(() => expect(items.at(-1)?.kind).toBe('gradient'))
      expect(JSON.parse(items.at(-1)!.valueJson)).toEqual(before.presentation.composition!.background)
      await fireEvent.click(controls.getByRole('button', { name: 'Text and logo' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Add signature' }))
      await fireEvent.click(await controls.findByRole('button', { name: 'Company' }))
      expect(session.snapshot.core.document.presentation.composition?.branding[0]?.image?.blobHash).toBe('b'.repeat(64))
      session.undo()
      expect(session.snapshot.core.document.presentation.composition?.branding[0]?.image).toBeNull()
      await fireEvent.click(controls.getByRole('button', { name: 'My templates' }))
      expect(controls.queryByRole('button', { name: 'Forest' })).toBeNull()
      expect(controls.queryByRole('button', { name: 'Company' })).toBeNull()
      await view.rerender({ readOnlyDocument: true })
      expect(controls.getByRole('button', { name: 'Save template…' })).toBeDisabled()
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('navigates every inspector section without creating presentation or history and cancels drafts on departure', async () => {
    localStorage.clear()
    const document = initial()
    const session = new DocumentSessionController({ document, revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
      correlationId: () => 'appearance-navigation' })
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] } })
    try {
      const execute = vi.spyOn(session, 'execute')
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const panel = screen.getByRole('complementary', { name: 'Appearance' })
      const controls = within(panel)
      const sections = [
        ['layout', 'Size and padding', '[aria-label="All sides"]'],
        ['background', 'Background', '[data-card-fill="transparent"]'],
        ['shadow', 'Shadow', '[aria-label="Shadow strength"]'],
        ['frame', 'Frame', '[role="radiogroup"][aria-label="Frame type"]'],
        ['bands', 'Strips', '[aria-label="Strip height"]'],
        ['branding', 'Text and logo', '.cs-brand-add'],
      ] as const
      for (const [section, label, control] of sections) {
        await fireEvent.click(controls.getByRole('button', { name: label }))
        expect(panel.querySelector(`[data-composition-section="${section}"]`)).toHaveAttribute('aria-current', 'page')
        expect(panel.querySelector('.cs-composition-body')!.querySelector(control)).toBeVisible()
        expect(panel.querySelector('details')).toBeNull()
        expect(session.snapshot.core.document).toEqual(document)
        expect(session.snapshot.core.canUndo).toBe(false)
        expect(execute).not.toHaveBeenCalled()
      }
      await fireEvent.click(controls.getByRole('button', { name: 'Size and padding' }))
      expect(controls.queryByRole('spinbutton', { name: 'Shadow strength' })).toBeNull()
      const inset = controls.getByRole('spinbutton', { name: 'All sides' })
      await fireEvent.input(inset, { target: { value: '17' } })
      await fireEvent.pointerDown(controls.getByRole('button', { name: 'Background' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Background' }))
      expect(execute).not.toHaveBeenCalled()
      await fireEvent.click(controls.getByRole('button', { name: 'Size and padding' }))
      expect(controls.getByRole('spinbutton', { name: 'All sides' })).toHaveValue('0')
      await fireEvent.input(controls.getByRole('spinbutton', { name: 'All sides' }), { target: { value: '17' } })
      await fireEvent.keyDown(controls.getByRole('spinbutton', { name: 'All sides' }), { key: 'Enter' })
      expect(execute).toHaveBeenCalledTimes(1)
      await fireEvent.click(controls.getByRole('button', { name: 'Shadow' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Size and padding' }))
      expect(execute).toHaveBeenCalledTimes(1)
      session.undo()
      await vi.waitFor(() => expect(controls.getByRole('spinbutton', { name: 'All sides' })).toHaveValue('0'))
      expect(session.snapshot.core.document).toEqual(document)
      session.redo()
      await vi.waitFor(() => expect(controls.getByRole('spinbutton', { name: 'All sides' })).toHaveValue('17'))
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('removes appearance in one command, cancels the draft and restores all settings through undo', async () => {
    localStorage.clear()
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
      correlationId: () => 'remove-appearance' })
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const controls = within(screen.getByRole('complementary', { name: 'Appearance' }))
      const remove = controls.getByRole('button', { name: 'Remove appearance' })
      expect(remove).toBeDisabled()
      await fireEvent.click(controls.getByRole('button', { name: 'Browser' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Shadow' }))
      const before = session.snapshot.core.document
      const execute = vi.spyOn(session, 'execute')
      const shadow = controls.getByRole('spinbutton', { name: 'Shadow strength' })
      await fireEvent.input(shadow, { target: { value: '92' } })
      await fireEvent.pointerDown(remove, { button: 0 })
      await fireEvent.click(remove)
      await vi.waitFor(() => expect(remove).toBeDisabled())
      expect(execute).toHaveBeenCalledTimes(1)
      expect(session.snapshot.core.document.presentation.composition).toBeUndefined()
      expect(session.snapshot.core.document.layers).toEqual(before.layers)
      expect(session.snapshot.core.document.canvas).toEqual(before.canvas)
      session.undo()
      await vi.waitFor(() => expect(remove).toBeEnabled())
      expect(session.snapshot.core.document).toEqual(before)
      expect(shadow).toHaveValue(String(Math.round(before.presentation.composition!.shadow * 100)))
      session.redo()
      await vi.waitFor(() => expect(remove).toBeDisabled())
      session.undo()
      await view.rerender({ readOnlyDocument: true })
      expect(remove).toBeDisabled()
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('uses the tool palette for background colors, preserving alpha, undo and Escape focus', async () => {
    localStorage.clear()
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
      correlationId: () => 'appearance-palette' })
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const panel = screen.getByRole('complementary', { name: 'Appearance' })
      const controls = within(panel)
      await fireEvent.click(controls.getByRole('button', { name: 'Background' }))
      await fireEvent.click(within(controls.getAllByRole('group', { name: 'Fill' })[0]!)
        .getByRole('button', { name: 'Color' }))
      const opacity = controls.getAllByRole('spinbutton', { name: 'Background opacity %' })[0]!
      await fireEvent.input(opacity, { target: { value: '37' } })
      await fireEvent.keyDown(opacity, { key: 'Enter' })
      const before = session.snapshot.core.document.presentation.composition!.background.color
      const execute = vi.spyOn(session, 'execute')
      const trigger = controls.getAllByRole('button', { name: 'Background color' })[0]!
      await fireEvent.click(trigger)
      const palette = await screen.findByRole('dialog', { name: 'Background color' })
      await fireEvent.click(within(palette).getByRole('button', { name: 'Red' }))
      expect(execute).toHaveBeenCalledTimes(1)
      expect(session.snapshot.core.document.presentation.composition!.background.color)
        .toEqual({ red: 1, green: 117 / 255, blue: 86 / 255, alpha: 0.37 })
      session.undo()
      expect(session.snapshot.core.document.presentation.composition!.background.color).toEqual(before)
      await fireEvent.click(trigger)
      await fireEvent.click(within(await screen.findByRole('dialog', { name: 'Background color' }))
        .getByRole('button', { name: 'Custom colour' }))
      const hex = await screen.findByRole('textbox', { name: 'HEX colour code' })
      await fireEvent.input(hex, { target: { value: 'badhex' } })
      await fireEvent.change(hex)
      expect(await within(await screen.findByRole('dialog', { name: 'Background color' })).findByRole('alert'))
        .toBeVisible()
      expect(execute).toHaveBeenCalledTimes(1)
      await fireEvent.keyDown(hex, { key: 'Escape' })
      const back = await screen.findByRole('dialog', { name: 'Background color' })
      await fireEvent.keyDown(back, { key: 'Escape' })
      await vi.waitFor(() => expect(trigger).toHaveFocus())
      expect(panel).toBeVisible()
      expect(panel.querySelector('input[type="color"]')).toBeNull()
      await view.rerender({ readOnlyDocument: true })
      expect(trigger).toBeDisabled()
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('opens frame controls from persistent navigation and changes only the frame kind through undoable commands', async () => {
    localStorage.clear()
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
      correlationId: () => 'frame-tiles' })
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const panel = screen.getByRole('complementary', { name: 'Appearance' })
      const sections = [...panel.querySelectorAll('[data-composition-section]')]
      expect(sections.map((section) => section.getAttribute('data-composition-section')))
        .toEqual(['layout', 'background', 'shadow', 'frame', 'bands', 'branding'])
      await fireEvent.click(within(panel).getByRole('button', { name: 'Frame' }))
      const choices = within(within(panel).getByRole('radiogroup', { name: 'Frame type' }))
      expect(choices.getAllByRole('radio')).toHaveLength(4)
      expect(choices.getByRole('radio', { name: 'No frame' })).toBeChecked()
      expect(session.snapshot.core.canUndo).toBe(false)
      const execute = vi.spyOn(session, 'execute')
      await fireEvent.click(choices.getByRole('radio', { name: 'Window' }))
      expect(execute).toHaveBeenCalledTimes(1)
      expect(session.snapshot.core.document.presentation.composition?.frame.kind).toBe('window')
      const title = within(panel).getByRole('textbox', { name: 'Title' })
      await fireEvent.change(title, { target: { value: 'My window' } })
      await fireEvent.click(choices.getByRole('radio', { name: 'Phone' }))
      expect(within(panel).queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
      expect(within(panel).getByRole('button', { name: 'Rotate mockup' })).toBeVisible()
      await fireEvent.click(choices.getByRole('radio', { name: 'Browser' }))
      expect(within(panel).getByRole('textbox', { name: 'Title' })).toHaveValue('My window')
      expect(within(panel).getByRole('textbox', { name: 'URL' })).toBeVisible()
      session.undo()
      await vi.waitFor(() => expect(choices.getByRole('radio', { name: 'Phone' })).toBeChecked())
      session.redo()
      await vi.waitFor(() => expect(choices.getByRole('radio', { name: 'Browser' })).toBeChecked())
      await view.rerender({ readOnlyDocument: true })
      expect(choices.getAllByRole('radio').every((radio) => (radio as HTMLInputElement).matches(':disabled')))
        .toBe(true)
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('opens appearance without editing and offers only padding, browser and phone starter styles', async () => {
    localStorage.clear()
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) }, correlationId: () => 'card-ui' })
    const view = render(EditorShell,
      { props: { documentSession: markRaw(session) },
        global: { plugins: [createEditorShellPinia()] } })
    try {
      const button = await screen.findByRole('button', { name: 'Appearance' })
      expect(session.snapshot.core.canUndo).toBe(false)
      await fireEvent.click(button)
      const panel = screen.getByRole('complementary', { name: 'Appearance' })
      expect(session.snapshot.core.canUndo).toBe(false)
      expect(within(panel).getByRole('button', { name: 'Size and padding' })).toBeVisible()
      await fireEvent.click(within(panel).getByRole('button', { name: 'Background' }))
      const initialFills = within(panel).getAllByRole('group', { name: 'Fill' })[0]!
      expect(within(initialFills).getByRole('button', { name: 'Transparent' })).toHaveAttribute('aria-pressed', 'true')
      const execute = vi.spyOn(session, 'execute')
      await fireEvent.click(within(initialFills).getByRole('button', { name: 'Color' }))
      expect(execute).toHaveBeenCalledTimes(1)
      expect(session.snapshot.core.document.presentation.composition?.background.kind).toBe('solid')
      expect(resolveCompositionLayout(session.snapshot.core.document)).toEqual(resolveCompositionLayout(initial()))
      session.undo()
      expect(session.snapshot.core.document.presentation.composition).toBeUndefined()
      await vi.waitFor(() => {
        expect(within(panel).getByRole('button', { name: 'Size and padding' })).toBeVisible()
      })
      session.redo()
      expect(session.snapshot.core.document.presentation.composition?.background.kind).toBe('solid')
      session.undo()
      expect(within(panel).queryByRole('button', { name: 'Footer strip' })).not.toBeInTheDocument()
      expect(within(panel).queryByRole('button', { name: 'Header strip' })).not.toBeInTheDocument()
      expect(within(panel).queryByRole('button', { name: 'Two strips' })).not.toBeInTheDocument()
      await fireEvent.click(within(panel).getByRole('button', { name: 'With padding' }))
      expect(session.snapshot.core.document.presentation.composition?.layout.insets.left).toBe(8)
      const fills = within(panel).getAllByRole('group', { name: 'Fill' })[0]!
      expect(within(fills).getAllByRole('button')).toHaveLength(7)
      expect(within(fills).getByRole('button', { name: 'Linear' })).toHaveAttribute('aria-pressed', 'true')
      const previous = session.snapshot.core.document.presentation.composition!.background
      await fireEvent.click(within(fills).getByRole('button', { name: 'Radial' }))
      expect(session.snapshot.core.document.presentation.composition!.background).toEqual({ ...previous, kind: 'radial' })
      session.undo()
      expect(session.snapshot.core.document.presentation.composition!.background).toEqual(previous)
      expect(screen.queryByRole('button', { name: 'On card' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'On screenshot' })).not.toBeInTheDocument()
      session.undo()
      expect(session.snapshot.core.document.presentation.composition).toBeUndefined()
      session.redo()
      expect(session.snapshot.core.document.presentation.composition?.layout.insets.left).toBe(8)
      await fireEvent.click(within(panel).getByRole('button', { name: 'Layers' }))
      expect(screen.queryByRole('complementary', { name: 'Appearance' })).not.toBeInTheDocument()
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('never offers appearance in Quick Capture', () => {
    const view = render(EditorShell, { props: { fixture: 'ready', quickMode: true }, global: { plugins: [createEditorShellPinia()] } })
    expect(view.container.querySelector('.cs-composition-panel')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument()
  })
  it('edits linked and independent insets and cancels shadow drafts without closing the panel', async () => {
    localStorage.clear()
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) }, correlationId: () => 'compact-card' })
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const panel = screen.getByRole('complementary', { name: 'Appearance' })
      const controls = within(panel)
      const execute = vi.spyOn(session, 'execute')
      const all = controls.getByRole('spinbutton', { name: 'All sides' })
      await fireEvent.input(all, { target: { value: '12' } })
      expect(controls.getByRole('button', { name: 'Left: 12 %' })).toBeVisible()
      expect(controls.getByRole('button', { name: 'Right: 12 %' })).toBeVisible()
      expect(session.snapshot.core.document.presentation.composition).toBeUndefined()
      await fireEvent.keyDown(all, { key: 'Enter' })
      expect(session.snapshot.core.document.presentation.composition?.layout.insets).toMatchObject({
        top: 12, right: 12, bottom: 12, left: 12,
      })
      const slider = controls.getByRole('slider', { name: 'All sides' })
      const beforeSlider = execute.mock.calls.length
      await fireEvent.keyDown(slider, { key: 'ArrowRight' })
      expect(all).toHaveValue('13')
      expect(execute).toHaveBeenCalledTimes(beforeSlider)
      expect(session.snapshot.core.document.presentation.composition?.layout.insets.top).toBe(12)
      await fireEvent.keyUp(slider, { key: 'ArrowRight' })
      expect(execute).toHaveBeenCalledTimes(beforeSlider + 1)
      expect(session.snapshot.core.document.presentation.composition?.layout.insets)
        .toMatchObject({ top: 13, right: 13, bottom: 13, left: 13 })
      session.undo()
      await vi.waitFor(() => expect(all).toHaveValue('12'))
      const units = within(controls.getByRole('group', { name: 'Inset units' }))
      expect(units.getByRole('button', { name: '%' })).toHaveAttribute('aria-pressed', 'true')
      await fireEvent.click(units.getByRole('button', { name: 'px' }))
      expect(session.snapshot.core.document.presentation.composition?.layout.insets).toMatchObject({ unit: 'px', top: 12 })
      session.undo()
      await vi.waitFor(() => expect(units.getByRole('button', { name: '%' })).toHaveAttribute('aria-pressed', 'true'))
      const link = controls.getByRole('button', { name: 'Equal padding on all sides' })
      expect(link).toHaveAttribute('aria-pressed', 'true')
      expect(link.querySelector('.tabler-icon-link')).toBeTruthy()
      const beforeLink = execute.mock.calls.length
      await fireEvent.input(all, { target: { value: '17' } })
      await fireEvent.pointerDown(link)
      await fireEvent.click(link)
      expect(execute).toHaveBeenCalledTimes(beforeLink + 1)
      expect(session.snapshot.core.document.presentation.composition?.layout.insets.top).toBe(12)
      expect(link).toHaveAttribute('aria-pressed', 'false')
      expect(link.querySelector('.tabler-icon-unlink')).toBeTruthy()
      await fireEvent.click(controls.getByRole('button', { name: 'Left: 12 %' }))
      const left = controls.getByRole('spinbutton', { name: 'Left' })
      const beforeSelection = execute.mock.calls.length
      await fireEvent.input(left, { target: { value: '27' } })
      expect(controls.getByRole('button', { name: 'Left: 27 %' })).toHaveAttribute('aria-pressed', 'true')
      await fireEvent.pointerDown(controls.getByRole('button', { name: 'Right: 12 %' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Right: 12 %' }))
      expect(execute).toHaveBeenCalledTimes(beforeSelection)
      expect(controls.getByRole('button', { name: 'Left: 12 %' })).toBeVisible()
      await fireEvent.click(controls.getByRole('button', { name: 'Left: 12 %' }))
      const selectedLeft = controls.getByRole('spinbutton', { name: 'Left' })
      await fireEvent.input(selectedLeft, { target: { value: '201' } })
      expect(selectedLeft).toHaveAttribute('aria-invalid', 'true')
      await fireEvent.keyDown(selectedLeft, { key: 'Escape' })
      expect(selectedLeft).toHaveValue('12')
      expect(execute).toHaveBeenCalledTimes(beforeSelection)
      await fireEvent.input(selectedLeft, { target: { value: '24' } })
      await fireEvent.keyDown(selectedLeft, { key: 'Enter' })
      expect(session.snapshot.core.document.presentation.composition?.layout.insets).toMatchObject({
        top: 12, right: 12, bottom: 12, left: 24, linked: false,
      })
      const previous = execute.mock.calls.length
      await fireEvent.click(controls.getByRole('button', { name: 'Equal padding on all sides' }))
      expect(execute).toHaveBeenCalledTimes(previous + 1)
      expect(controls.getByRole('spinbutton', { name: 'All sides' })).toHaveValue('12')
      session.undo()
      await vi.waitFor(() => expect(controls.getByRole('spinbutton', { name: 'Left' })).toHaveValue('24'))
      session.redo()
      await fireEvent.click(controls.getByRole('button', { name: 'Shadow' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Medium' }))
      expect(session.snapshot.core.document.presentation.composition?.shadow).toBe(0.45)
      const beforeDraft = execute.mock.calls.length
      const shadow = controls.getByRole('spinbutton', { name: 'Shadow strength' })
      await fireEvent.input(shadow, { target: { value: '68' } })
      expect(execute).toHaveBeenCalledTimes(beforeDraft)
      expect(session.snapshot.core.document.presentation.composition?.shadow).toBe(0.45)
      await fireEvent.keyDown(shadow, { key: 'Escape' })
      expect(panel).toBeVisible()
      expect(shadow).toHaveValue('45')
      await fireEvent.blur(shadow)
      expect(execute).toHaveBeenCalledTimes(beforeDraft)
      await fireEvent.input(shadow, { target: { value: '68' } })
      await fireEvent.keyDown(shadow, { key: 'Enter' })
      expect(execute).toHaveBeenCalledTimes(beforeDraft + 1)
      expect(session.snapshot.core.document.presentation.composition?.shadow).toBe(0.68)
      session.undo()
      expect(session.snapshot.core.document.presentation.composition?.shadow).toBe(0.45)
      session.redo()
      expect(session.snapshot.core.document.presentation.composition?.shadow).toBe(0.68)
      const size = controls.getByRole('spinbutton', { name: 'Shadow size' })
      await fireEvent.input(size, { target: { value: '400' } })
      expect(session.snapshot.core.document.presentation.composition?.shadowOptions?.size).toBe(1)
      await fireEvent.keyDown(size, { key: 'Escape' })
      expect(size).toHaveValue('100')
      await fireEvent.input(size, { target: { value: '400' } })
      await fireEvent.keyDown(size, { key: 'Enter' })
      expect(session.snapshot.core.document.presentation.composition?.shadowOptions?.size).toBe(4)
      expect(session.snapshot.core.document.presentation.composition?.shadow).toBe(0.68)
      session.undo()
      expect(session.snapshot.core.document.presentation.composition?.shadowOptions?.size).toBe(1)
      session.redo()
      const spread = controls.getByRole('spinbutton', { name: 'Spread px' })
      await fireEvent.input(spread, { target: { value: '24' } })
      await fireEvent.keyDown(spread, { key: 'Enter' })
      expect(session.snapshot.core.document.presentation.composition?.shadowOptions)
        .toMatchObject({ size: 4, spread: 24 })
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('maps full card display to source coordinates without moving source layers', () => {
    const document = initial()
    const props = shallowReactive<CanvasViewportProps>({ documentState: { kind: 'ready', title: 'Card', dimensions: '4K' },
      document: { ...document, presentation: { ...document.presentation, composition: createComposition('browser') } },
      compositionSpace: 'content', canvas: document.canvas, zoom: 100, t: (key) => key })
    const emit = vi.fn()
    const view = compositionViewport(props, emit as CanvasViewportEmit)
    const layout = resolveCompositionLayout(props.document!)
    const p = contentToCard({ x: 300, y: 400 }, layout)
    const b = view.props.compositionBounds!
    expect(b.x + p.x / layout.scale).toBeCloseTo(300)
    expect(b.y + p.y / layout.scale).toBeCloseTo(400)
    expect(view.props.document!.presentation.composition).toBeUndefined()
    props.compositionSpace = 'card'
    expect(view.props.document!.layers).toHaveLength(0)
    expect(view.props.canvas).toEqual({ width: layout.width, height: layout.height })
    expect(mergeCompositionView(props.document, view.props.document, 'card')!.layers).toEqual(document.layers)
    props.activeTool = 'crop'
    expect(view.props.document!.presentation.composition).toBeUndefined()
    expect(view.props.exportDocument!.presentation.composition).toEqual(props.document!.presentation.composition)
    const cardLayer = { ...createRulerLayer({ id: '019c1f62-058e-7000-8000-000000000009',
      start: { x: 10, y: 10 }, end: { x: 300, y: 10 }, canvas: document.canvas }), space: 'card' as const }
    props.document = { ...document, layers: [...document.layers, cardLayer] }
    expect(view.props.document!.layers).toEqual(document.layers)
    expect(mergeCompositionView(props.document, view.props.document, 'content')!.layers)
      .toEqual(props.document.layers)
  })
})
