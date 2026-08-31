import type { Ref } from 'vue'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'
import type { DocumentSessionSnapshot } from '../../document-session'
import type { ResolvedEditorShellProps } from '../contracts'
import type { useEditorShellStore } from '../store'
import type { TextDraft } from '../tools/text-schema'

type ShellStore = ReturnType<typeof useEditorShellStore>

export interface SessionControllerContext {
  readonly props: ResolvedEditorShellProps
  readonly store: ShellStore
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly textDraft: Ref<TextDraft | undefined>
  readonly translate: (key: 'readyLoadError' | 'baseImage') => string
  readonly resolveDocumentTextures: (
    document: EditorDocumentV1,
  ) => Promise<void>
}

function loadFixture(context: SessionControllerContext): void {
  if (context.props.fixture === 'loading') {
    context.store.setDocumentState({ kind: 'loading' })
    return
  }
  if (context.props.fixture === 'error') {
    context.store.setDocumentState({
      kind: 'error',
      message: context.translate('readyLoadError'),
    })
    return
  }
  if (context.props.fixture !== 'ready') {
    context.store.setFixture({ document: { kind: 'empty' } })
    return
  }
  context.store.setFixture({
    document: {
      kind: 'ready',
      title: 'Landing-page redesign',
      dimensions: '1440 × 900',
    },
    activeToolId: 'arrow',
    selectedLayerId: 'arrow-1',
    layers: [
      {
        id: 'text-1',
        icon: 'text',
        name: 'CTA comment',
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        opacityEditable: false,
      },
      {
        id: 'arrow-1',
        icon: 'arrow',
        name: 'Arrow to button',
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        opacityEditable: true,
      },
      {
        id: 'marker-1',
        icon: 'marker',
        name: 'Title highlight',
        visible: true,
        locked: true,
        opacity: 1,
        rotation: 0,
        opacityEditable: true,
      },
    ],
    frames: [
      { id: 'frame-1', label: '1', selected: true },
      { id: 'frame-2', label: '2', selected: false },
      { id: 'frame-3', label: '3', selected: false },
    ],
  })
  context.store.setLayersOpen(true)
}

function syncLayerSummaries(
  context: SessionControllerContext,
  document: EditorDocumentV1,
): void {
  context.store.setLayers([
    ...(context.textDraft.value
      ? [
          {
            id: context.textDraft.value.id,
            icon: 'text' as const,
            name: 'Text · Editing…',
            visible: true,
            locked: true,
            opacity: 1,
            rotation: 0,
            opacityEditable: false,
            transient: true,
          },
        ]
      : []),
    ...[...document.layers].reverse().map((layer) => ({
      id: layer.id,
      icon: (layer.kind === 'image' ? 'image' : 'shape') as 'image' | 'shape',
      name:
        layer.kind === 'image' && layer.payload.role === 'base'
          ? context.translate('baseImage')
          : layer.kind,
      visible: layer.visible,
      locked: layer.locked,
      opacity: 'opacity' in layer ? layer.opacity : 1,
      rotation: layer.transform.rotation,
      opacityEditable:
        layer.kind !== 'text' &&
        layer.kind !== 'callout' &&
        layer.kind !== 'numberedMarker',
    })),
  ])
}

function applyDocumentSnapshot(
  context: SessionControllerContext,
  snapshot: DocumentSessionSnapshot,
): void {
  const document = snapshot.core.document
  context.activeDocument.value = document
  if (
    context.store.selectedLayerIds.some((id) => {
      const layer = document.layers.find((candidate) => candidate.id === id)
      return !layer || !layer.visible
    })
  ) {
    context.store.clearLayerSelection()
  }
  context.store.setDocumentState({
    kind: 'ready',
    title: `Document ${document.id.slice(0, 8)}`,
    dimensions: `${document.canvas.width} × ${document.canvas.height}`,
  })
  context.store.setDocumentHistory({
    canUndo: snapshot.core.canUndo,
    canRedo: snapshot.core.canRedo,
    saveState: snapshot.saveState,
    ...(snapshot.error ? { error: snapshot.error } : {}),
  })
  syncLayerSummaries(context, document)
  void context.resolveDocumentTextures(document)
}

export function createSessionController(context: SessionControllerContext) {
  return {
    loadFixture: () => loadFixture(context),
    applyDocumentSnapshot: (snapshot: DocumentSessionSnapshot) =>
      applyDocumentSnapshot(context, snapshot),
    setTextDraft: (draft: TextDraft | undefined) => {
      context.textDraft.value = draft
      if (context.activeDocument.value) {
        syncLayerSummaries(context, context.activeDocument.value)
      }
    },
    undoDocument: () => context.props.documentSession?.undo(),
    redoDocument: () => context.props.documentSession?.redo(),
    retryDocumentSave: () => void context.props.documentSession?.retry(),
    exportDocumentRecovery: async () => {
      const outcome =
        await context.props.documentSession?.exportRecoveryBundle()
      if (outcome?.kind === 'failed') {
        context.store.setDocumentHistory({
          ...context.store.documentHistory,
          saveState: 'error',
          error: outcome.error,
        })
      }
    },
  }
}
