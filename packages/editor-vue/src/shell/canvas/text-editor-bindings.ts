import type { TextEditorController } from './text-editor-controller'

/** DOM event adapter kept separate from the canvas controller's rendering lifecycle. */
export function textEditorBindings(editor: TextEditorController) {
  return {
    onTextEditorCompositionStart: () => editor.compositionStart(),
    onTextEditorCompositionEnd: () => editor.compositionEnd(),
    onTextEditorBeforeInput: (event: InputEvent) => editor.beforeInput(event),
    onTextEditorInput: () => editor.input(),
    onTextEditorCopy: (event: ClipboardEvent) => editor.copy(event),
    onTextEditorCut: (event: ClipboardEvent) => editor.cut(event),
    onTextEditorPaste: (event: ClipboardEvent) => editor.paste(event),
    onTextEditorKeydown: (event: KeyboardEvent) => editor.keydown(event),
    onTextEditorBlur: (event: FocusEvent) => editor.blur(event),
  }
}
