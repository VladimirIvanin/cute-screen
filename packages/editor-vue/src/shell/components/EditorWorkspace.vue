<script setup lang="ts">
import { NButton, NConfigProvider } from 'naive-ui'
import { nextNumberedMarkerSequence } from '@cute-screen/editor-renderer'
import { UiIcon } from '../icon'
import ActionFeedback from './ActionFeedback.vue'
import ArrowFormattingToolbar from './ArrowFormattingToolbar.vue'
import CanvasViewport from './CanvasViewport.vue'
import ContextToolbar from './ContextToolbar.vue'
import LayersPanel from './LayersPanel.vue'
import SeriesFilmstrip from './SeriesFilmstrip.vue'
import ToolRail from './ToolRail.vue'
import TopBar from './TopBar.vue'
import ZoomControls from './ZoomControls.vue'
import { cuteScreenThemeOverrides } from '../ui/theme'
import { editorShellRuntimeEmits, editorShellRuntimeProps } from '../contracts'
import { useEditorWorkspace } from '../workspace/use-editor-workspace'

const props = defineProps(editorShellRuntimeProps)
const emit = defineEmits(editorShellRuntimeEmits)
const {
  naiveTheme,
  naiveLocale,
  naiveDateLocale,
  store,
  state,
  translate,
  fallbackCopied,
  fallbackVisible,
  copyCaptureFallback,
  dismissCaptureFallback,
  tools,
  selectTool,
  openToolConfigure,
  activeDocument,
  contextSchema,
  drawingPreferences,
  onContextAction,
  onContextChange,
  onColorChange,
  startEyedropper,
  canvasViewport,
  textureImages,
  baseImageLayer,
  sceneTexturesReady,
  samplingControl,
  drawingDefaults,
  precisionDefaults,
  textDefaults,
  textFormatting,
  floatingTextToolbarSchema,
  floatingArrowToolbarSchema,
  markerShape,
  selectLayer,
  moveLayer,
  transformLayer,
  updateLayerPayload,
  addLayer,
  executeDocumentCommand,
  setTextDraft,
  importContentImage,
  onColorSample,
  onColorSampleError,
  onColorSampleCancel,
  toolError,
  updateLayerProperty,
  onLayerOpacity,
  onLayerRotation,
  onLayerReorderTo,
  toolConfigureArrowSchema,
  toolConfigureLayout,
  onToolConfigureChange,
  eyedropperFeedback,
  eyedropperColor,
  undoDocument,
  redoDocument,
  retryDocumentSave,
  exportDocumentRecovery,
  fitCanvas,
} = useEditorWorkspace(props)
</script>

<template>
  <NConfigProvider
    :theme="naiveTheme"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    :theme-overrides="cuteScreenThemeOverrides"
    :abstract="false"
  >
    <div class="cs-editor-shell" :class="{ 'is-quick-mode': props.quickMode }">
      <TopBar
        v-if="!props.quickMode"
        :locale="store.locale"
        :theme="store.preferences.theme"
        :can-copy-or-export="store.canCopyOrExport"
        :can-undo="store.documentHistory.canUndo"
        :can-redo="store.documentHistory.canRedo"
        :save-state="store.documentHistory.saveState"
        :save-error="store.documentHistory.error"
        :pending="store.actionState.status === 'pending'"
        :capture-available="props.captureAvailable"
        :capture-window-available="props.captureWindowAvailable"
        :capture-unavailable-reason="
          props.captureUnavailableReason ?? translate('captureUnavailable')
        "
        :open-image-available="props.openImageAvailable"
        :t="translate"
        @action="store.runAction"
        @undo="undoDocument"
        @redo="redoDocument"
        @retry-save="retryDocumentSave"
        @export-recovery="exportDocumentRecovery"
        @locale="store.setLocale"
        @theme="store.setTheme"
      />
      <div
        v-if="props.captureFallbackCommand && fallbackVisible"
        class="cs-capture-fallback"
        role="status"
        aria-live="polite"
        data-placement="overlay"
      >
        <span>{{ translate('captureFallback') }}</span>
        <code>{{ props.captureFallbackCommand }}</code>
        <button
          type="button"
          :aria-label="translate('copyCaptureFallback')"
          @click="copyCaptureFallback"
        >
          {{
            fallbackCopied
              ? translate('captureFallbackCopied')
              : translate('copyCaptureFallback')
          }}
        </button>
        <button
          class="cs-capture-fallback-dismiss"
          type="button"
          :aria-label="translate('dismissCaptureFallback')"
          :title="translate('dismissCaptureFallback')"
          @click="dismissCaptureFallback"
        >
          <UiIcon name="close" />
        </button>
      </div>
      <div class="cs-workbench">
        <div
          v-if="props.quickMode && !props.quickSelectionMode"
          class="cs-quick-toolrail-group"
        >
          <ToolRail
            :tools="tools"
            :active-tool-id="store.activeToolId"
            :t="translate"
            @select="selectTool"
            @configure="openToolConfigure"
          />
          <div
            class="cs-quick-history"
            role="group"
            :aria-label="translate('undo')"
          >
            <NButton
              quaternary
              circle
              class="cs-tool-button"
              :disabled="!store.documentHistory.canUndo"
              :aria-label="translate('undo')"
              @click="undoDocument"
            >
              <UiIcon name="undo" />
            </NButton>
            <NButton
              quaternary
              circle
              class="cs-tool-button"
              :disabled="!store.documentHistory.canRedo"
              :aria-label="translate('redo')"
              @click="redoDocument"
            >
              <UiIcon name="redo" />
            </NButton>
          </div>
        </div>
        <div v-else-if="!props.quickMode" class="cs-bottom-chrome">
          <SeriesFilmstrip
            :frames="store.frames"
            :active-frame-id="store.activeFrameId"
            :t="translate"
            @select="store.selectFrame"
          />
          <div class="cs-bottom-chrome-center">
            <ContextToolbar
              :schema="contextSchema"
              :label="translate('toolSettings')"
              :recent-colors="drawingPreferences.recentColors"
              :picker-locale="state.locale.value"
              @action="onContextAction"
              @change="onColorChange"
              @eyedropper="startEyedropper"
            />
            <ToolRail
              :tools="tools"
              :active-tool-id="store.activeToolId"
              :t="translate"
              @select="selectTool"
              @configure="openToolConfigure"
            />
          </div>
          <ZoomControls
            :zoom="store.zoom"
            :t="translate"
            @zoom="store.setZoom"
            @fit="fitCanvas"
          />
        </div>
        <CanvasViewport
          ref="canvasViewport"
          :document-state="store.documentState"
          :canvas="activeDocument?.canvas"
          :image="props.sourceImage"
          :texture-images="textureImages"
          :image-layer="baseImageLayer"
          :document="activeDocument"
          :selected-layer-id="store.selectedLayerId"
          :selected-layer-ids="store.selectedLayerIds"
          :active-tool="store.activeToolId"
          :sampling="
            Boolean(samplingControl || store.activeToolId === 'eyedropper')
          "
          :sampling-blocked="!sceneTexturesReady"
          :drawing-defaults="drawingDefaults"
          :precision-defaults="precisionDefaults"
          :text-defaults="textDefaults"
          :text-formatting="textFormatting"
          :text-toolbar-schema="floatingTextToolbarSchema"
          :text-toolbar-locale="state.locale.value"
          :arrow-toolbar-schema="floatingArrowToolbarSchema"
          :arrow-toolbar-locale="state.locale.value"
          :next-marker-sequence="
            activeDocument
              ? nextNumberedMarkerSequence(activeDocument.layers)
              : undefined
          "
          :marker-shape="markerShape"
          :open-image-available="props.openImageAvailable"
          :zoom="store.zoom"
          :fit-mode="store.zoomMode === 'fit'"
          :quick-frame-mode="props.quickMode"
          :quick-selection-mode="props.quickSelectionMode"
          :t="translate"
          @hosts-ready="emit('hostsReady', $event)"
          @frame-ready="emit('frameReady', $event)"
          @quick-frame-change="emit('quickFrameChange', $event)"
          @quick-selection-complete="emit('quickSelectionComplete', $event)"
          @select-layer="selectLayer"
          @move-layer="moveLayer"
          @transform-layer="transformLayer"
          @update-layer-payload="updateLayerPayload"
          @add-layer="addLayer"
          @document-command="executeDocumentCommand"
          @text-editing="setTextDraft"
          @text-toolbar-change="onContextChange"
          @arrow-toolbar-change="onContextChange"
          @request-image-import="importContentImage"
          @open-image="store.runAction('openImage')"
          @select-tool="store.selectTool"
          @color-sample="onColorSample"
          @color-sample-error="onColorSampleError"
          @color-sample-cancel="onColorSampleCancel"
          @tool-error="toolError = $event"
          @zoom="store.setZoom"
          @fit-zoom="store.setFitZoom"
          @retry="emit('retryLoad')"
        />
        <LayersPanel
          v-if="!props.quickMode"
          :layers="store.layers"
          :open="store.layersOpen"
          :selected-layer-id="store.selectedLayerId"
          :selected-layer-ids="store.selectedLayerIds"
          :t="translate"
          @select="selectLayer"
          @toggle="store.toggleLayers"
          @visibility="updateLayerProperty($event, 'visible')"
          @lock="updateLayerProperty($event, 'locked')"
          @opacity="onLayerOpacity"
          @rotation="onLayerRotation"
          @reorder-to="onLayerReorderTo"
        />
        <ContextToolbar
          v-if="props.quickMode && !props.quickSelectionMode"
          :schema="contextSchema"
          :label="translate('toolSettings')"
          :recent-colors="drawingPreferences.recentColors"
          :picker-locale="state.locale.value"
          @action="onContextAction"
          @change="onColorChange"
          @eyedropper="startEyedropper"
        />
      </div>
      <ActionFeedback
        :state="store.actionState"
        :t="translate"
        @cancel="store.cancelAction"
        @retry="
          store.runAction(
            store.actionState.status === 'error'
              ? store.actionState.action
              : 'capture',
          )
        "
      />
      <div class="cs-overlay-root" aria-live="polite">
        <div
          v-if="toolConfigureArrowSchema && toolConfigureLayout"
          class="cs-tool-configure-popover-host"
          :style="{
            left: `${toolConfigureLayout.left}px`,
            top: `${toolConfigureLayout.top}px`,
          }"
          @pointerdown.stop
        >
          <ArrowFormattingToolbar
            variant="popover"
            :controls="toolConfigureArrowSchema.controls"
            :recent-colors="drawingPreferences.recentColors"
            :picker-locale="state.locale.value"
            @change="onToolConfigureChange"
            @eyedropper="startEyedropper"
          />
        </div>
      </div>
      <p v-if="eyedropperFeedback" class="cs-eyedropper-feedback" role="status">
        <span
          v-if="eyedropperColor"
          class="cs-eyedropper-swatch"
          :style="{ backgroundColor: eyedropperColor }"
          :aria-label="
            state.locale.value === 'ru'
              ? `Образец цвета ${eyedropperColor}`
              : `Colour swatch ${eyedropperColor}`
          "
        />
        <span>{{ eyedropperFeedback }}</span>
      </p>
      <p v-if="toolError" class="cs-tool-error" role="alert">
        {{ toolError }}
      </p>
    </div>
  </NConfigProvider>
</template>
