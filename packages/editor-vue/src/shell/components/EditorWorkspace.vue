<script setup lang="ts">
import {
  NButton,
  NConfigProvider,
} from 'naive-ui'
import { UiIcon } from '../icon'
import ActionFeedback from './ActionFeedback.vue'
import SelectionFormattingToolbar from './SelectionFormattingToolbar.vue'
import CanvasViewport from './CanvasViewport.vue'
import CanvasContextMenu from './CanvasContextMenu.vue'
import ContextToolbar from './ContextToolbar.vue'
import ToolConfigurePopover from './ToolConfigurePopover.vue'
import LayersPanel from './LayersPanel.vue'
import SeriesFilmstrip from './SeriesFilmstrip.vue'
import ToolRail from './ToolRail.vue'
import TopBar from './TopBar.vue'
import ZoomControls from './ZoomControls.vue'
import { cuteScreenThemeOverrides } from '../ui/theme'
import {
  editorShellRuntimeEmits,
  editorShellRuntimeProps,
} from '../contracts'
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
  closeToolConfigure,
  activeDocument,
  displayDocument,
  spotlightEditing,
  canvasMenu,
  canvasMenuItems,
  canvasMenuAction,
  openCanvasMenu,
  contextSchema,
  selectionSchema,
  toolConfigureSchema,
  drawingPreferences,
  onContextAction,
  onContextChange,
  onColorChange,
  startEyedropper,
  canvasViewport,
  textureImages,
  baseImageLayer,
  sceneTexturesReady,
  highlighterAnalysis,
  onHighlighterFrameReady,
  samplingControl,
  drawingDefaults,
  precisionDefaults,
  textDefaults,
  calloutStroke,
  textFormatting,
  floatingTextToolbarSchema,
  markerShape,
  markerStyle,
  markerPreviewBlocked,
  nextMarkerSequence,
  selectLayer,
  moveLayer,
  transformLayer,
  updateLayerPayload,
  addLayer,
  executeDocumentCommand,
  setTextDraft,
  cancelTextDefaults,
  importContentImage,
  onColorSample,
  onColorSampleError,
  onColorSampleCancel,
  toolError,
  updateLayerProperty,
  onLayerOpacity,
  onLayerRotation,
  onLayerReorderTo,
  toolConfigure,
  onToolConfigureChange,
  eyedropperFeedback,
  eyedropperColor,
  undoDocument,
  redoDocument,
  retryDocumentSave,
  exportDocumentRecovery,
  fitCanvas,
} = useEditorWorkspace(props)

function onTextCancelled(): void {
  cancelTextDefaults()
  selectTool('select')
}
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
        :can-edit-canvas="
          Boolean(
            activeDocument &&
              props.documentSession &&
              !props.readOnlyDocument &&
              store.documentHistory.saveState !== 'readOnly' &&
              store.actionState.status !== 'pending'
          )
        "
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
        :capture-unavailable-reason="props.captureUnavailableReason ?? translate('captureUnavailable')"
        :open-image-available="props.openImageAvailable"
        :t="translate"
        @canvas-action="onContextAction"
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
          {{ fallbackCopied ? translate('captureFallbackCopied') : translate('copyCaptureFallback') }}
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
        <div v-if="props.quickMode && !props.quickSelectionMode" class="cs-quick-toolrail-group">
          <ToolRail
            :configured-tool-id="toolConfigure?.toolId"
            :configure-hint="translate('toolConfigureHint')"
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
              :configured-tool-id="toolConfigure?.toolId"
              :configure-hint="translate('toolConfigureHint')"
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
          :document="displayDocument"
          :selected-layer-id="store.selectedLayerId"
          :selected-layer-ids="store.selectedLayerIds"
          :active-tool="store.activeToolId ?? 'select'"
          :spotlight-editing="spotlightEditing"
          :read-only="props.readOnlyDocument"
          @spotlight-editing-change="spotlightEditing = $event"
          @spotlight-remove="onContextAction('spotlightRemove')"
          :sampling="Boolean(samplingControl || store.activeToolId === 'eyedropper')"
          :sampling-blocked="!sceneTexturesReady"
          :drawing-defaults="drawingDefaults"
          :precision-defaults="precisionDefaults"
          :text-defaults="textDefaults"
          :callout-stroke="calloutStroke"
          :text-formatting="textFormatting"
          :text-toolbar-schema="floatingTextToolbarSchema"
          :text-toolbar-locale="state.locale.value"
          :arrow-toolbar-schema="undefined"
          :arrow-toolbar-locale="state.locale.value"
          :next-marker-sequence="nextMarkerSequence"
          :marker-style="markerStyle"
          :marker-preview-blocked="markerPreviewBlocked"
          :marker-shape="markerShape"
          :open-image-available="props.openImageAvailable"
          :zoom="store.zoom"
          :fit-mode="store.zoomMode === 'fit'"
          :quick-frame-mode="props.quickMode"
          :quick-selection-mode="props.quickSelectionMode"
          :t="translate"
          :highlighter-effect="highlighterAnalysis.effect"
          @hosts-ready="emit('hostsReady', $event)"
          @frame-ready="onHighlighterFrameReady($event); emit('frameReady', $event)"
          @quick-frame-change="emit('quickFrameChange', $event)"
          @quick-selection-complete="emit('quickSelectionComplete', $event)"
          @context-menu="openCanvasMenu"
          @clear-selection="store.clearLayerSelection()"
          @select-layer="selectLayer"
          @move-layer="moveLayer"
          @transform-layer="transformLayer"
          @update-layer-payload="updateLayerPayload"
          @add-layer="addLayer"
          @document-command="executeDocumentCommand"
          @text-editing="setTextDraft"
          @text-editing-cancelled="onTextCancelled"
          @text-toolbar-change="onContextChange"
          @arrow-toolbar-change="onContextChange"
          @request-image-import="importContentImage"
          @open-image="store.runAction('openImage')"
          @select-tool="selectTool"
          @color-sample="onColorSample"
          @color-sample-error="onColorSampleError"
          @color-sample-cancel="onColorSampleCancel"
          @tool-error="toolError = $event"
          @zoom="store.setZoom"
          @fit-zoom="store.setFitZoom"
          @retry="emit('retryLoad')"
        />
        <SelectionFormattingToolbar
          :quick-mode="props.quickMode"
          :layers-open="store.layersOpen"
          :schema="selectionSchema"
          :document="activeDocument"
          :selected-ids="store.selectedLayerIds"
          :zoom="store.zoom"
          :locale="state.locale.value"
          :recent-colors="drawingPreferences.recentColors"
          @change="onColorChange"
          @action="onContextAction"
          @eyedropper="startEyedropper"
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
          class="cs-tool-defaults-toolbar"
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
        @retry="store.runAction(store.actionState.status === 'error' ? store.actionState.action : 'capture')"
      />
      <CanvasContextMenu
        :request="canvasMenu"
        :items="canvasMenuItems"
        @action="canvasMenuAction"
        @close="canvasMenu = undefined"
      />
      <div class="cs-overlay-root" aria-live="polite">
        <ToolConfigurePopover
          v-if="toolConfigureSchema && toolConfigure"
          :key="toolConfigure.toolId"
          :anchor="toolConfigure.anchor"
          :label="translate('toolSettings')"
          @keydown.esc.prevent.stop="closeToolConfigure"
          @pointerdown.stop
        >
          <ContextToolbar
            :schema="toolConfigureSchema"
            :defaults-tool="toolConfigure.toolId"
            :label="translate('toolSettings')"
            :recent-colors="drawingPreferences.recentColors"
            :picker-locale="state.locale.value"
            @change="onToolConfigureChange"
            @action="onContextAction"
            @eyedropper="startEyedropper"
          />
        </ToolConfigurePopover>
      </div>
      <p
        v-if="eyedropperFeedback"
        class="cs-eyedropper-feedback"
        role="status"
      >
        <span
          v-if="eyedropperColor"
          class="cs-eyedropper-swatch"
          :style="{ backgroundColor: eyedropperColor }"
          :aria-label="
            state.locale.value === 'ru' ? `Образец цвета ${eyedropperColor}` : `Colour swatch ${eyedropperColor}`
          "
        />
        <span>{{ eyedropperFeedback }}</span>
      </p>
      <p
        v-if="toolError"
        class="cs-tool-error"
        role="alert"
      >
        {{ toolError }}
      </p>
    </div>
  </NConfigProvider>
</template>
