import {
  computed,
  ref,
} from 'vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { arrowDocument } from './app-test-kit'
import { shortcutLetter } from '../../../packages/editor-vue/src/keyboard-shortcuts'
import {
  createKeyboardController,
  type KeyboardControllerContext,
} from '../../../packages/editor-vue/src/shell/workspace/keyboard-controller'

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
}

function createContext() {
  const undo = vi.fn()
  const redo = vi.fn()
  const runAction = vi.fn().mockResolvedValue(undefined)
  const duplicateSelection = vi.fn()
  const copySelectedTextLayer = vi.fn().mockResolvedValue(undefined)
  const pasteNativeClipboard = vi.fn().mockResolvedValue(undefined)
  const copyStyle = vi.fn()
  const pasteStyle = vi.fn()
  const context = {
    selectTool: vi.fn(),
    selectionActions: {
      copyStyle,
      pasteStyle,
      duplicateSelection,
      deleteSelection: vi.fn(),
      reorderSelection: vi.fn(),
    },
    props: {
      openImageAvailable: true,
      clipboardBridge: { writeClipboardText: vi.fn() },
      documentSession: {} as never,
    } as unknown as KeyboardControllerContext['props'],
    activeDocument: ref(arrowDocument()),
    tools: computed(() => []),
    store: {
      selectedLayerId: arrowDocument().layers[0]!.id,
      selectedLayerIds: [arrowDocument().layers[0]!.id],
      activeToolId: 'select',
      zoom: 100,
      selectTool: vi.fn(),
      runAction,
      clearFeedback: vi.fn(),
      setLayersOpen: vi.fn(),
      clearLayerSelection: vi.fn(),
    },
    undo,
    redo,
    copySelectedTextLayer,
    pasteNativeClipboard,
    reorderLayer: vi.fn(),
    moveLayer: vi.fn(),
  } as unknown as KeyboardControllerContext
  return {
    context,
    undo,
    redo,
    runAction,
    duplicateSelection,
    copySelectedTextLayer,
    pasteNativeClipboard,
    copyStyle,
    pasteStyle,
  }
}

describe('physical letter shortcuts', () => {
  it('prefers the physical code and retains an ASCII fallback only without one', () => {
    expect(shortcutLetter(keydown({ code: 'KeyZ', key: 'я' }))).toBe('z')
    expect(shortcutLetter(keydown({ code: 'KeyV', key: 'م' }))).toBe('v')
    expect(shortcutLetter(keydown({ key: 'z' }))).toBe('z')
    expect(shortcutLetter(keydown({ code: 'Unidentified', key: 'Z' }))).toBe('z')
    expect(shortcutLetter(keydown({ code: 'Digit1', key: 'z' }))).toBeUndefined()
    expect(shortcutLetter(keydown({ key: 'я' }))).toBeUndefined()
  })

  it('routes Ctrl and Cmd editor commands by physical letter across layouts', () => {
    const app = createContext()
    const controller = createKeyboardController(app.context)

    controller.onKeydown(keydown({ code: 'KeyZ', key: 'я', ctrlKey: true }))
    controller.onKeydown(keydown({ code: 'KeyZ', key: 'Я', metaKey: true, shiftKey: true }))
    controller.onKeydown(keydown({ code: 'KeyO', key: 'щ', ctrlKey: true }))
    controller.onKeydown(keydown({ code: 'KeyD', key: 'в', metaKey: true }))
    controller.onKeydown(keydown({ code: 'KeyC', key: 'с', ctrlKey: true }))
    controller.onKeydown(keydown({ code: 'KeyX', key: 'ч', metaKey: true }))
    controller.onKeydown(keydown({ code: 'KeyV', key: 'м', ctrlKey: true }))
    controller.onKeydown(keydown({ code: 'KeyC', key: 'с', ctrlKey: true, altKey: true }))
    controller.onKeydown(keydown({ code: 'KeyV', key: 'м', metaKey: true, altKey: true }))

    expect(app.undo).toHaveBeenCalledOnce()
    expect(app.redo).toHaveBeenCalledOnce()
    expect(app.runAction).toHaveBeenCalledWith('openImage')
    expect(app.duplicateSelection).toHaveBeenCalledOnce()
    expect(app.copySelectedTextLayer).toHaveBeenNthCalledWith(1, false)
    expect(app.copySelectedTextLayer).toHaveBeenNthCalledWith(2, true)
    expect(app.pasteNativeClipboard).toHaveBeenCalledOnce()
    expect(app.copyStyle).toHaveBeenCalledOnce()
    expect(app.pasteStyle).toHaveBeenCalledOnce()
  })

  it('leaves editable, composing, and handled events alone', () => {
    const app = createContext()
    const controller = createKeyboardController(app.context)
    const input = document.createElement('input')
    input.addEventListener('keydown', (event) => controller.onKeydown(event))
    input.dispatchEvent(keydown({ code: 'KeyZ', key: 'я', ctrlKey: true }))
    controller.onKeydown(keydown({ code: 'KeyZ', key: 'я', ctrlKey: true, isComposing: true }))
    const handled = keydown({ code: 'KeyZ', key: 'я', ctrlKey: true })
    handled.preventDefault()
    controller.onKeydown(handled)

    expect(app.undo).not.toHaveBeenCalled()
  })
})
