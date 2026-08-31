import {
  materializeQuickCaptureDocument,
  type CanvasViewportHosts,
  type DocumentSessionController,
  type QuickCaptureDraftV1,
} from '@cute-screen/editor-vue'
import type { Ref, ShallowRef } from 'vue'
import { tauriDesktopBridge } from './desktop-bridge'
import { normalizeQuickCaptureSelection } from './quick-capture-actions'
import type { QuickRect } from './quick-capture-layout'
import type { useQuickCaptureCoordinator } from './use-quick-capture-coordinator'

type Coordinator = ReturnType<typeof useQuickCaptureCoordinator>

export interface QuickCaptureCommitPorts {
  readonly draft: ShallowRef<QuickCaptureDraftV1 | undefined>
  readonly session: ShallowRef<DocumentSessionController | undefined>
  readonly hosts: ShallowRef<CanvasViewportHosts | undefined>
  readonly currentCrop: Ref<QuickRect>
  readonly materialized: Ref<boolean>
  readonly selectionPending: Ref<boolean>
  readonly coordinator: Coordinator
}

export class QuickCaptureCommitController {
  readonly #ports: QuickCaptureCommitPorts

  constructor(ports: QuickCaptureCommitPorts) {
    this.#ports = ports
  }

  physicalSelection(): QuickRect {
    const draft = this.#ports.draft.value
    if (!draft) throw new Error('Quick capture draft is not ready')
    if (this.#ports.selectionPending.value) {
      throw new Error('Quick capture selection is not confirmed')
    }
    return normalizeQuickCaptureSelection(this.#ports.currentCrop.value, {
      width: draft.width,
      height: draft.height,
    })
  }

  async commit(
    completion: 'copied' | 'saved' | 'editor',
    preparedPng?: Uint8Array,
    preparedSelection?: QuickRect,
  ): Promise<void> {
    const { draft, session, coordinator, materialized } = this.#ports
    if (materialized.value || !draft.value || !session.value) return
    const selection = preparedSelection ?? this.physicalSelection()
    const png = preparedPng ?? (await this.resultPng(selection))
    const sourceHash = hexDigest(
      await crypto.subtle.digest('SHA-256', Uint8Array.from(png).buffer),
    )
    const document = materializeQuickCaptureDocument(
      { ...session.value.snapshot.core.document, crop: selection },
      {
        source: {
          blobHash: sourceHash,
          format: 'png',
          mimeType: 'image/png',
          width: selection.width,
          height: selection.height,
          orientationApplied: true,
          provenance: 'capture',
          color: { colorSpace: 'srgb', hasIccProfile: false },
        },
        updatedAt: new Date().toISOString(),
      },
    )
    await coordinator.commit(
      draft.value.draftId,
      png,
      JSON.stringify(document),
      completion,
      selection,
    )
    materialized.value = true
  }

  async detectMaterializedAfterError(): Promise<void> {
    const { draft, materialized } = this.#ports
    if (!draft.value || materialized.value) return
    try {
      materialized.value =
        (await tauriDesktopBridge.quickCaptureGetActive()) === null
    } catch (diagnosticError) {
      console.warn('Quick capture materialization probe failed', {
        draftId: draft.value.draftId,
        diagnosticError,
      })
    }
  }

  async resultPng(
    selection: QuickRect = this.physicalSelection(),
  ): Promise<Uint8Array> {
    const hosts = this.#ports.hosts.value
    if (!hosts) throw new Error('Rendered capture is not ready')
    const output = document.createElement('canvas')
    output.width = selection.width
    output.height = selection.height
    const context = output.getContext('2d')
    if (!context) throw new Error('PNG canvas is unavailable')
    context.drawImage(
      hosts.scene,
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      0,
      0,
      selection.width,
      selection.height,
    )
    const blob = await encodePng(output)
    return new Uint8Array(await blob.arrayBuffer())
  }
}

function hexDigest(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
}

function encodePng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error('PNG encoding failed')),
      'image/png',
    ),
  )
}
