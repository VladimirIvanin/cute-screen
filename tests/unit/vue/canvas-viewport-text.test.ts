import { fireEvent } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'
import {
  TEXT_TOOLBAR_SCHEMA,
  document,
  ARROW_TOOLBAR_SCHEMA,
  mountViewport,
} from './canvas-viewport-test-kit'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

describe('M05 CanvasViewport transforms', () => {
  it('commits entered text when the canvas is clicked', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000100'),
    })
    const { getByLabelText, scene, emitted } = mountViewport('text')

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 30, clientY: 40 })
    const editor = getByLabelText('Text editor') as HTMLDivElement
    editor.textContent = 'Click to commit'
    await fireEvent.input(editor)

    await fireEvent.pointerDown(scene, {
      pointerId: 2,
      clientX: 70,
      clientY: 80,
    })

    expect(emitted().documentCommand).toEqual([
      [
        expect.objectContaining({
          type: 'addLayer',
          layer: expect.objectContaining({
            kind: 'text',
            payload: expect.objectContaining({
              content: expect.objectContaining({ text: 'Click to commit' }),
            }),
          }),
        }),
      ],
    ])
    expect(() => getByLabelText('Text editor')).toThrow()
    vi.unstubAllGlobals()
  })

  it('uses a contenteditable editor, accepts plain-text paste and commits on blur', async () => {
    const { getByLabelText, scene, emitted } = mountViewport('text')
    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 30, clientY: 40 })
    const editor = getByLabelText('Text editor') as HTMLDivElement
    expect(editor).toHaveAttribute('contenteditable', 'true')
    expect(editor.tagName).toBe('DIV')
    await fireEvent.paste(editor, {
      clipboardData: { getData: () => 'Plain\ntext' },
    })
    await fireEvent.blur(editor)
    await vi.waitFor(() => expect(emitted().documentCommand).toHaveLength(1))
  })

  it('shows the selected portable text background in the DOM editor overlay', async () => {
    const background = {
      color: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
      padding: 6,
      radius: 4,
    }
    const { getByLabelText, scene } = mountViewport('text', document, 'shape', {
      fontFamily: 'Roboto',
      fontSize: 24,
      weight: 400,
      italic: false,
      strikethrough: false,
      alignment: 'start',
      listKind: 'none',
      color: { red: 0, green: 0, blue: 0, alpha: 1 },
      background,
    })

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 30, clientY: 40 })

    const editor = getByLabelText('Text editor') as HTMLDivElement
    expect(editor.style.backgroundColor).toBe('rgb(255, 204, 51)')
    expect(editor.style.borderRadius).toBe('4px')
  })

  it('uses the horizontal drag span as a fixed text width before opening the editor', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000099'),
    })
    const { getByLabelText, scene, emitted } = mountViewport('text')

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 20,
      clientY: 30,
    })
    expect(() => getByLabelText('Text editor')).toThrow()
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 80,
      clientY: 45,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 80, clientY: 45 })
    const editor = getByLabelText('Text editor') as HTMLDivElement
    editor.textContent = 'Fixed width'
    await fireEvent.input(editor)
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(emitted().documentCommand).toEqual([
      [
        expect.objectContaining({
          type: 'addLayer',
          layer: expect.objectContaining({
            localBounds: expect.objectContaining({ width: 60 }),
            payload: expect.objectContaining({
              content: expect.objectContaining({
                wrap: 'fixedWidth',
                fixedWidth: 60,
              }),
            }),
          }),
        }),
      ],
    ])
    vi.unstubAllGlobals()
  })

  it('shows the floating text toolbar only while editing with schema wiring', async () => {
    const { getByLabelText, scene, container, emitted } = mountViewport(
      'text',
      document,
      'shape',
      undefined,
      false,
      TEXT_TOOLBAR_SCHEMA,
    )

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 30, clientY: 40 })
    const editor = getByLabelText('Text editor') as HTMLDivElement
    expect(
      container.querySelector('.cs-text-floating-toolbar-host'),
    ).toBeTruthy()
    expect(container.querySelector('.cs-text-floating-toolbar')).toBeTruthy()

    editor.textContent = 'Toolbar focus'
    await fireEvent.input(editor)
    const bold = getByLabelText('Bold') as HTMLButtonElement
    await fireEvent.click(bold)
    expect(emitted().textToolbarChange).toContainEqual(['textBold', 'true'])

    await fireEvent.blur(editor, { relatedTarget: bold })
    await vi.waitFor(() =>
      expect(emitted().documentCommand ?? []).toHaveLength(0),
    )
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(emitted().documentCommand).toHaveLength(1)
    expect(container.querySelector('.cs-text-floating-toolbar-host')).toBeNull()
  })

  it('shows the floating arrow toolbar only for a selected arrow schema', () => {
    const arrowDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'arrow',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 20, height: 10 },
          transform: {
            translateX: 10,
            translateY: 10,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          opacity: 1,
          blendMode: 'normal',
          shadows: [],
          visible: true,
          locked: false,
          payload: {
            path: 'straight',
            start: { x: 0, y: 0 },
            end: { x: 20, y: 10 },
            startCap: 'none',
            endCap: 'solidArrow',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    }
    const withoutSchema = mountViewport(
      'select',
      arrowDocument,
      'arrow',
      undefined,
      false,
    )
    expect(
      withoutSchema.container.querySelector('.cs-arrow-floating-toolbar-host'),
    ).toBeNull()
    withoutSchema.unmount()

    const withSchema = mountViewport(
      'select',
      arrowDocument,
      'arrow',
      undefined,
      false,
      undefined,
      ARROW_TOOLBAR_SCHEMA,
    )
    expect(
      withSchema.container.querySelector('.cs-arrow-floating-toolbar-host'),
    ).toBeTruthy()
    expect(
      withSchema.container.querySelector('.cs-arrow-floating-toolbar'),
    ).toBeTruthy()
  })

  it('keeps a moving selected arrow, selection frame and floating toolbar on one transient geometry', async () => {
    const arrowDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'moving-arrow',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 20, height: 10 },
          transform: {
            translateX: 10,
            translateY: 10,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          opacity: 1,
          blendMode: 'normal',
          shadows: [],
          visible: true,
          locked: false,
          payload: {
            path: 'straight',
            start: { x: 0, y: 0 },
            end: { x: 20, y: 10 },
            startCap: 'none',
            endCap: 'solidArrow',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    }
    const { container, scene } = mountViewport(
      'select',
      arrowDocument,
      'moving-arrow',
      undefined,
      false,
      undefined,
      ARROW_TOOLBAR_SCHEMA,
    )
    const surface = container.querySelector('.cs-canvas-surface') as HTMLElement
    const toolbar = container.querySelector(
      '.cs-arrow-floating-toolbar-host',
    ) as HTMLDivElement
    Object.defineProperty(surface, 'clientWidth', {
      configurable: true,
      value: 1_000,
    })
    Object.defineProperty(toolbar, 'offsetWidth', {
      configurable: true,
      value: 200,
    })
    Object.defineProperty(toolbar, 'offsetHeight', {
      configurable: true,
      value: 40,
    })
    await vi.waitFor(() => expect(toolbar.style.left).not.toBe(''))
    const context = scene.getContext('2d') as CanvasRenderingContext2D
    vi.mocked(context.translate).mockClear()

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 20,
      clientY: 15,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 400,
      clientY: 200,
    })

    expect(toolbar.style.left).toBe('400px')
    expect(context.translate).toHaveBeenCalledWith(390, 195)
    expect(context.translate).not.toHaveBeenCalledWith(770, 380)
  })
})
