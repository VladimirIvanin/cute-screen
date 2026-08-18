<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton } from 'naive-ui'

import { UiIcon } from '../icon'
import type { LayerSummary } from '../types'
import DeferredNumberInput from '../ui/DeferredNumberInput.vue'
import DeferredSlider from '../ui/DeferredSlider.vue'

const props = defineProps<{
  layers: readonly LayerSummary[]
  open: boolean
  selectedLayerId?: string | undefined
  selectedLayerIds?: readonly string[] | undefined
  t: (
    key:
      | 'layers'
      | 'layersEmpty'
      | 'layersNoSelection'
      | 'hideLayers'
      | 'showLayers'
      | 'opacity'
      | 'rotation'
      | 'lockLayer'
      | 'unlockLayer',
  ) => string
}>()

type DropPlace = 'before' | 'after'

const DRAG_THRESHOLD_PX = 4

const dragLayerId = ref<string>()
const dropTarget = ref<{ readonly id: string; readonly place: DropPlace }>()
const pointerReorder = ref<{
  readonly layerId: string
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
  dragging: boolean
}>()

const selectedLayer = computed(() =>
  props.selectedLayerId
    ? props.layers.find((layer) => layer.id === props.selectedLayerId)
    : undefined,
)

const controlsDisabled = computed(() => {
  const layer = selectedLayer.value
  return !layer || Boolean(layer.transient) || layer.locked
})

function canReorderLayer(layer: LayerSummary): boolean {
  return !layer.transient && !layer.locked
}

function updateDropFromPointer(
  clientX: number,
  clientY: number,
  sourceId: string,
): void {
  const hit = document.elementFromPoint(clientX, clientY)
  const row = hit?.closest('[data-layer-id]')
  if (!(row instanceof HTMLElement)) {
    dropTarget.value = undefined
    return
  }
  const targetId = row.dataset.layerId
  if (!targetId || targetId === sourceId) {
    dropTarget.value = undefined
    return
  }
  const rect = row.getBoundingClientRect()
  const place: DropPlace =
    clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  dropTarget.value = { id: targetId, place }
}

function clearReorder(): void {
  dragLayerId.value = undefined
  dropTarget.value = undefined
}

function finishPointerReorder(): void {
  const state = pointerReorder.value
  if (!state?.dragging) return
  const target = dropTarget.value
  if (target && state.layerId !== target.id) {
    emit('reorderTo', state.layerId, target.id, target.place)
  }
  clearReorder()
}

function onLayerPointerDown(event: PointerEvent, layer: LayerSummary): void {
  if (!canReorderLayer(layer) || event.button !== 0) return
  const handle = event.currentTarget
  if (!(handle instanceof HTMLElement)) return
  pointerReorder.value = {
    layerId: layer.id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
  }
  handle.setPointerCapture?.(event.pointerId)
}

function onLayerPointerMove(event: PointerEvent): void {
  const state = pointerReorder.value
  if (!state || state.pointerId !== event.pointerId) return
  if (!state.dragging) {
    const distance = Math.hypot(
      event.clientX - state.startX,
      event.clientY - state.startY,
    )
    if (distance < DRAG_THRESHOLD_PX) return
    state.dragging = true
    dragLayerId.value = state.layerId
  }
  updateDropFromPointer(event.clientX, event.clientY, state.layerId)
}

function onLayerPointerUp(event: PointerEvent, layer: LayerSummary): void {
  const state = pointerReorder.value
  if (!state || state.pointerId !== event.pointerId) return
  const handle = event.currentTarget
  if (
    handle instanceof HTMLElement &&
    handle.hasPointerCapture?.(event.pointerId)
  ) {
    handle.releasePointerCapture(event.pointerId)
  }
  if (state.dragging) {
    finishPointerReorder()
  } else {
    selectLayer(layer.id, event)
  }
  pointerReorder.value = undefined
}

function onLayerPointerCancel(event: PointerEvent): void {
  const state = pointerReorder.value
  if (!state || state.pointerId !== event.pointerId) return
  pointerReorder.value = undefined
  clearReorder()
}

function isDropBefore(layerId: string): boolean {
  return dropTarget.value?.id === layerId && dropTarget.value.place === 'before'
}

function isDropAfter(layerId: string): boolean {
  return dropTarget.value?.id === layerId && dropTarget.value.place === 'after'
}

function selectLayer(layerId: string, event: MouseEvent | KeyboardEvent): void {
  emit('select', layerId, event.metaKey || event.ctrlKey, event.shiftKey)
}

const emit = defineEmits<{
  select: [id: string, toggle: boolean, range: boolean]
  toggle: []
  visibility: [id: string]
  lock: [id: string]
  opacity: [id: string, opacity: number]
  rotation: [id: string, rotation: number]
  reorderTo: [id: string, targetId: string, place: DropPlace]
}>()
</script>

<template>
  <NButton
    v-if="!open"
    quaternary
    circle
    class="cs-layers-peek cs-icon-button"
    :aria-label="t('showLayers')"
    :title="t('showLayers')"
    @click="emit('toggle')"
  >
    <UiIcon name="layers" />
  </NButton>
  <aside v-else class="cs-layers-panel" aria-label="Layers">
    <header>
      <strong>{{ t('layers') }}</strong>
      <NButton
        quaternary
        circle
        class="cs-icon-button"
        :aria-label="t('hideLayers')"
        :title="t('hideLayers')"
        @click="emit('toggle')"
      >
        <UiIcon name="close" />
      </NButton>
    </header>
    <div v-if="layers.length > 0" class="cs-layers-controls">
      <template v-if="selectedLayer">
        <label class="cs-layers-control cs-layers-control--opacity">
          <span class="cs-layers-control-label">{{ t('opacity') }}</span>
          <DeferredSlider
            :min="0"
            :max="100"
            :model-value="Math.round(selectedLayer.opacity * 100)"
            :step="1"
            v-bind="{ ariaLabel: t('opacity') }"
            :disabled="controlsDisabled || !selectedLayer.opacityEditable"
            @commit="emit('opacity', selectedLayer.id, Number($event) / 100)"
          />
        </label>
        <label class="cs-layers-control cs-layers-control--rotation">
          <span class="cs-layers-control-label">{{ t('rotation') }}</span>
          <DeferredNumberInput
            :min="-360"
            :max="360"
            :step="1"
            :model-value="Math.round(selectedLayer.rotation)"
            v-bind="{ ariaLabel: t('rotation') }"
            :disabled="controlsDisabled"
            @commit="emit('rotation', selectedLayer.id, Number($event))"
          />
        </label>
      </template>
      <p v-else class="cs-layers-controls-hint">
        {{ t('layersNoSelection') }}
      </p>
    </div>
    <p v-if="layers.length === 0" class="cs-layers-empty">
      {{ t('layersEmpty') }}
    </p>
    <div v-else class="cs-layers-list" role="listbox" :aria-label="t('layers')">
      <div
        v-for="layer in layers"
        :key="layer.id"
        class="cs-layer-row"
        :data-layer-id="layer.id"
        :class="{
          'is-selected':
            selectedLayerIds?.includes(layer.id) ??
            layer.id === selectedLayerId,
          'is-locked': layer.locked,
          'is-dragging': dragLayerId === layer.id,
          'is-drop-before': isDropBefore(layer.id),
          'is-drop-after': isDropAfter(layer.id),
        }"
        role="option"
        :aria-selected="
          selectedLayerIds?.includes(layer.id) ?? layer.id === selectedLayerId
        "
      >
        <NButton
          quaternary
          circle
          class="cs-layer-action"
          :disabled="Boolean(layer.transient)"
          :aria-label="layer.visible ? t('hideLayers') : t('showLayers')"
          :title="layer.visible ? t('hideLayers') : t('showLayers')"
          @click.stop="emit('visibility', layer.id)"
        >
          <UiIcon :name="layer.visible ? 'eye' : 'eyeOff'" />
        </NButton>
        <div
          class="cs-layer-select"
          :class="{ 'is-reorderable': canReorderLayer(layer) }"
          role="button"
          :tabindex="layer.transient ? -1 : 0"
          :aria-disabled="Boolean(layer.transient)"
          @pointerdown="onLayerPointerDown($event, layer)"
          @pointermove="onLayerPointerMove"
          @pointerup="onLayerPointerUp($event, layer)"
          @pointercancel="onLayerPointerCancel"
          @keydown.enter.prevent="selectLayer(layer.id, $event)"
          @keydown.space.prevent="selectLayer(layer.id, $event)"
        >
          <span class="cs-layer-name">{{ layer.name }}</span>
        </div>
        <button
          type="button"
          class="cs-layer-action cs-layer-lock"
          :class="{ 'is-locked': layer.locked }"
          :disabled="Boolean(layer.transient)"
          :aria-label="layer.locked ? t('unlockLayer') : t('lockLayer')"
          :title="layer.locked ? t('unlockLayer') : t('lockLayer')"
          @click.stop="emit('lock', layer.id)"
        >
          <UiIcon v-if="layer.locked" name="lock" />
          <UiIcon v-else name="unlock" class="cs-layer-lock-idle" />
        </button>
      </div>
    </div>
  </aside>
</template>
