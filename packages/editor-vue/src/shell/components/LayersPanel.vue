<script setup lang="ts">
import { ref } from 'vue'
import { NButton } from 'naive-ui'

import { UiIcon } from '../icon'
import type { LayerSummary } from '../types'
import DeferredNumberInput from '../ui/DeferredNumberInput.vue'
import DeferredSlider from '../ui/DeferredSlider.vue'
defineProps<{
  layers: readonly LayerSummary[]
  open: boolean
  selectedLayerId?: string | undefined
  selectedLayerIds?: readonly string[] | undefined
  t: (
    key:
      | 'layers'
      | 'layersEmpty'
      | 'hideLayers'
      | 'showLayers'
      | 'opacity'
      | 'rotation'
      | 'moveLayerUp'
      | 'moveLayerDown'
      | 'lockLayer'
      | 'unlockLayer',
  ) => string
}>()
const dragLayerId = ref<string>()
function startReorder(id: string): void {
  dragLayerId.value = id
}
function dropReorder(targetId: string): void {
  const sourceId = dragLayerId.value
  dragLayerId.value = undefined
  if (sourceId && sourceId !== targetId) emit('reorderTo', sourceId, targetId)
}
function clearReorder(): void {
  dragLayerId.value = undefined
}
const emit = defineEmits<{
  select: [id: string, toggle: boolean, range: boolean]
  toggle: []
  visibility: [id: string]
  lock: [id: string]
  opacity: [id: string, opacity: number]
  rotation: [id: string, rotation: number]
  reorder: [id: string, direction: 'up' | 'down']
  reorderTo: [id: string, targetId: string]
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
      <strong>{{ t('layers') }}</strong
      ><NButton
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
    <p v-if="layers.length === 0" class="cs-layers-empty">
      {{ t('layersEmpty') }}
    </p>
    <div v-else class="cs-layers-list" role="listbox" :aria-label="t('layers')">
      <div
        v-for="layer in layers"
        :key="layer.id"
        class="cs-layer-row"
        :data-layer-id="layer.id"
        :draggable="!layer.transient"
        :class="{
          'is-selected':
            selectedLayerIds?.includes(layer.id) ??
            layer.id === selectedLayerId,
        }"
        role="option"
        :aria-selected="
          selectedLayerIds?.includes(layer.id) ?? layer.id === selectedLayerId
        "
        @dragstart="startReorder(layer.id)"
        @dragover.prevent
        @drop="dropReorder(layer.id)"
        @dragend="clearReorder"
      >
        <NButton
          quaternary
          class="cs-layer-select"
          :disabled="Boolean(layer.transient)"
          @click="
            emit(
              'select',
              layer.id,
              $event.metaKey || $event.ctrlKey,
              $event.shiftKey,
            )
          "
        >
          <UiIcon :name="layer.icon" /><span>{{ layer.name }}</span>
        </NButton>
        <NButton
          quaternary
          circle
          class="cs-layer-action"
          :disabled="Boolean(layer.transient)"
          :aria-label="layer.visible ? t('hideLayers') : t('showLayers')"
          @click.stop="emit('visibility', layer.id)"
        >
          <UiIcon :name="layer.visible ? 'eye' : 'eyeOff'" />
        </NButton>
        <NButton
          quaternary
          circle
          class="cs-layer-action"
          :disabled="Boolean(layer.transient)"
          :aria-label="layer.locked ? t('unlockLayer') : t('lockLayer')"
          @click.stop="emit('lock', layer.id)"
        >
          <UiIcon :name="layer.locked ? 'lock' : 'unlock'" />
        </NButton>
        <div class="cs-layer-properties">
          <label>
            <span>{{ t('opacity') }}</span>
            <DeferredSlider
              :min="0"
              :max="100"
              :model-value="Math.round(layer.opacity * 100)"
              :step="1"
              v-bind="{ ariaLabel: t('opacity') }"
              :disabled="Boolean(layer.locked || layer.transient)"
              @commit="emit('opacity', layer.id, Number($event) / 100)"
            />
          </label>
          <label>
            <span>{{ t('rotation') }}</span>
            <DeferredNumberInput
              :min="-360"
              :max="360"
              :step="1"
              :model-value="Math.round(layer.rotation)"
              v-bind="{ ariaLabel: t('rotation') }"
              :disabled="Boolean(layer.locked || layer.transient)"
              @commit="emit('rotation', layer.id, Number($event))"
            />
          </label>
          <NButton
            quaternary
            circle
            class="cs-layer-order"
            :aria-label="t('moveLayerUp')"
            :title="t('moveLayerUp')"
            :disabled="Boolean(layer.locked || layer.transient)"
            @click="emit('reorder', layer.id, 'up')"
          >
            ↑
          </NButton>
          <NButton
            quaternary
            circle
            class="cs-layer-order"
            :aria-label="t('moveLayerDown')"
            :title="t('moveLayerDown')"
            :disabled="Boolean(layer.locked || layer.transient)"
            @click="emit('reorder', layer.id, 'down')"
          >
            ↓
          </NButton>
        </div>
      </div>
    </div>
  </aside>
</template>
