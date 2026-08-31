<script setup lang="ts">
import { UiIcon } from '../icon'
import TextFormattingToolbar from './TextFormattingToolbar.vue'
import ArrowFormattingToolbar from './ArrowFormattingToolbar.vue'
import type { CanvasViewportEmit } from '../canvas/contracts'
import {
  canvasViewportRuntimeEmits,
  canvasViewportRuntimeProps,
} from '../canvas/contracts'
import { useCanvasWorkspace } from '../canvas/use-canvas-workspace'

const props = defineProps(canvasViewportRuntimeProps)
const emit = defineEmits(canvasViewportRuntimeEmits) as CanvasViewportEmit
const {
  viewportRoot,
  scrollContainer,
  viewportOutputBounds,
  scene,
  isPanning,
  onPointerDown,
  onPointerMove,
  finishGesture,
  cancelGesture,
  onDoubleClick,
  onWheel,
  editingText,
  textFloatingToolbar,
  floatingToolbarLayout,
  arrowFloatingToolbar,
  floatingArrowToolbarLayout,
  textEditor,
  editorTextStyle,
  cssTextColor,
  cssTextBackground,
  onTextEditorCompositionStart,
  onTextEditorCompositionEnd,
  onTextEditorBeforeInput,
  onTextEditorInput,
  onTextEditorCopy,
  onTextEditorCut,
  onTextEditorPaste,
  onTextEditorKeydown,
  onTextEditorBlur,
  overlay,
  rendererError,
  retryRender,
  eyedropperLoupe,
  eyedropperPreview,
  EYEDROPPER_GRID_SIZE,
  eyedropperSwatch,
  eyedropperHex,
  eyedropperHint,
  applyCropDraft,
  cancelCropDraft,
  resetCropDraft,
  setCropPresetValue,
  refitCanvas,
} = useCanvasWorkspace(props, emit)
defineExpose({
  applyCropDraft,
  cancelCropDraft,
  resetCropDraft,
  setCropPresetValue,
  refitCanvas,
})
</script>

<template>
  <main
    ref="viewportRoot"
    class="cs-viewport"
    :aria-label="t('canvasViewport')"
  >
    <div ref="scrollContainer" class="cs-canvas-scroll">
      <div class="cs-canvas-stage">
        <div
          class="cs-canvas-surface"
          :style="
            viewportOutputBounds
              ? {
                  width: `${viewportOutputBounds.width * ((zoom ?? 100) / 100)}px`,
                  height: `${viewportOutputBounds.height * ((zoom ?? 100) / 100)}px`,
                }
              : undefined
          "
        >
          <canvas
            ref="scene"
            class="cs-canvas"
            :class="{ 'cs-canvas-eyedropper-cursor': sampling }"
            :style="{
              cursor: isPanning
                ? 'grabbing'
                : quickSelectionMode
                  ? 'crosshair'
                  : activeTool === 'hand'
                    ? 'grab'
                    : undefined,
            }"
            :aria-label="t('sceneCanvas')"
            :tabindex="
              sampling ||
              quickSelectionMode ||
              activeTool === 'crop' ||
              activeTool === 'censor' ||
              activeTool === 'spotlight' ||
              activeTool === 'ruler' ||
              activeTool === 'loupe'
                ? 0
                : -1
            "
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="finishGesture"
            @pointercancel="cancelGesture"
            @lostpointercapture="cancelGesture"
            @dblclick="onDoubleClick"
            @wheel="onWheel"
          ></canvas>
          <div
            v-if="editingText && textToolbarSchema"
            ref="textFloatingToolbar"
            class="cs-text-floating-toolbar-host"
            :style="
              floatingToolbarLayout
                ? {
                    left: `${floatingToolbarLayout.left}px`,
                    top: `${floatingToolbarLayout.top}px`,
                    transform: 'translateX(-50%)',
                  }
                : { visibility: 'hidden' }
            "
            :data-placement="floatingToolbarLayout?.placement"
            @pointerdown.stop
          >
            <TextFormattingToolbar
              :text="textToolbarSchema.text"
              :title="textToolbarSchema.title"
              :picker-locale="textToolbarLocale ?? 'en'"
              variant="floating"
              @change="(id, value) => emit('textToolbarChange', id, value)"
            />
          </div>
          <div
            v-if="arrowToolbarSchema"
            ref="arrowFloatingToolbar"
            class="cs-arrow-floating-toolbar-host"
            :style="
              floatingArrowToolbarLayout
                ? {
                    left: `${floatingArrowToolbarLayout.left}px`,
                    top: `${floatingArrowToolbarLayout.top}px`,
                    transform: 'translateX(-50%)',
                  }
                : { visibility: 'hidden' }
            "
            :data-placement="floatingArrowToolbarLayout?.placement"
            @pointerdown.stop
          >
            <ArrowFormattingToolbar
              class="cs-arrow-floating-toolbar"
              variant="floating"
              :controls="arrowToolbarSchema.controls"
              :picker-locale="arrowToolbarLocale ?? 'en'"
              @change="(id, value) => emit('arrowToolbarChange', id, value)"
            />
          </div>
          <div
            v-if="editingText"
            ref="textEditor"
            class="cs-text-editor"
            contenteditable="true"
            spellcheck="true"
            role="textbox"
            aria-multiline="true"
            :style="{
              left: `${(editingText.origin.x - (viewportOutputBounds?.x ?? 0)) * ((zoom ?? 100) / 100)}px`,
              top: `${(editingText.origin.y - (viewportOutputBounds?.y ?? 0)) * ((zoom ?? 100) / 100)}px`,
              width: `${editingText.width * ((zoom ?? 100) / 100)}px`,
              fontSize: `${editorTextStyle.fontSize * ((zoom ?? 100) / 100)}px`,
              lineHeight: '1.25',
              fontFamily: editorTextStyle.fontFamily,
              fontWeight: String(editorTextStyle.weight),
              fontStyle: editorTextStyle.italic ? 'italic' : 'normal',
              textDecoration: editorTextStyle.strikethrough
                ? 'line-through'
                : 'none',
              color: cssTextColor(editorTextStyle.color),
              backgroundColor: cssTextBackground(editingText.background),
              borderRadius: editingText.background
                ? `${editingText.background.radius * ((zoom ?? 100) / 100)}px`
                : undefined,
            }"
            :aria-label="
              editingText.kind === 'callout'
                ? 'Callout editor'
                : editingText.kind === 'numberedMarker'
                  ? 'Numbered marker editor'
                  : 'Text editor'
            "
            @compositionstart="onTextEditorCompositionStart"
            @compositionend="onTextEditorCompositionEnd"
            @beforeinput="onTextEditorBeforeInput"
            @input="onTextEditorInput"
            @copy="onTextEditorCopy"
            @cut="onTextEditorCut"
            @paste="onTextEditorPaste"
            @keydown="onTextEditorKeydown"
            @blur="onTextEditorBlur"
          ></div>
          <canvas
            ref="overlay"
            class="cs-canvas cs-canvas-overlay"
            :aria-label="t('interactionOverlay')"
          ></canvas>
          <section v-if="rendererError" class="cs-empty-state" role="alert">
            <h1>{{ rendererError }}</h1>
            <button type="button" class="cs-button" @click="retryRender">
              {{ t('retry') }}
            </button>
          </section>
          <section
            v-else-if="documentState.kind === 'empty'"
            class="cs-empty-state"
            aria-labelledby="cs-empty-title"
          >
            <UiIcon name="camera" />
            <h1 id="cs-empty-title">{{ t('emptyTitle') }}</h1>
            <p>{{ t('emptyDescription') }}</p>
            <button
              v-if="openImageAvailable"
              type="button"
              class="cs-button"
              @click="emit('openImage')"
            >
              <UiIcon name="image" />{{ t('openImage') }}
            </button>
          </section>
          <p
            v-else-if="documentState.kind === 'loading'"
            class="cs-loading"
            role="status"
          >
            {{ t('loadingEditor') }}
          </p>
          <section
            v-else-if="documentState.kind === 'error'"
            class="cs-empty-state"
            role="alert"
          >
            <h1>{{ documentState.message }}</h1>
            <button type="button" class="cs-button" @click="emit('retry')">
              {{ t('retry') }}
            </button>
          </section>
          <p v-else class="cs-canvas-ready" aria-live="polite">
            {{ documentState.title }} · {{ documentState.dimensions }}
          </p>
        </div>
      </div>
    </div>
    <section
      v-show="sampling"
      ref="eyedropperLoupe"
      class="cs-eyedropper-loupe"
      data-state="loading"
      :aria-label="t('eyedropperMagnifier')"
    >
      <span class="cs-eyedropper-loupe-preview" aria-hidden="true">
        <canvas
          ref="eyedropperPreview"
          :width="EYEDROPPER_GRID_SIZE"
          :height="EYEDROPPER_GRID_SIZE"
        ></canvas>
        <span class="cs-eyedropper-loupe-grid"></span>
        <span class="cs-eyedropper-loupe-target"></span>
      </span>
      <span class="cs-eyedropper-loupe-details">
        <span class="cs-eyedropper-loupe-value">
          <span
            ref="eyedropperSwatch"
            class="cs-eyedropper-loupe-swatch"
          ></span>
          <span ref="eyedropperHex" class="cs-eyedropper-loupe-hex">—</span>
        </span>
        <span ref="eyedropperHint" class="cs-eyedropper-loupe-hint">
          {{ t('eyedropperClickToSample') }}
        </span>
      </span>
    </section>
  </main>
</template>
