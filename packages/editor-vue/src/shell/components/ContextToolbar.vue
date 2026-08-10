<script setup lang="ts">
import { UiIcon } from '../icon'
import type { ContextToolbarSchema } from '../types'
defineProps<{
  schema?: ContextToolbarSchema | undefined
  label: string
}>()
const emit = defineEmits<{
  action: [id: string]
  change: [id: string, value: string]
}>()
</script>

<template>
  <section v-if="schema" class="cs-context-toolbar" :aria-label="label">
    <span class="cs-context-icon"><UiIcon :name="schema.icon" /></span>
    <div>
      <strong>{{ schema.title }}</strong
      ><small>{{ schema.hint }}</small>
    </div>
    <div class="cs-context-controls">
      <template v-for="control in schema.controls" :key="control.id">
        <button
          v-if="control.kind === 'action'"
          type="button"
          class="cs-context-control"
          @click="emit('action', control.id)"
        >
          {{ control.label }}
        </button>
        <label v-else-if="control.kind === 'color'" class="cs-context-control">
          <span>{{ control.label }}</span>
          <input
            type="color"
            :value="control.value"
            :aria-label="control.label"
            @input="
              emit(
                'change',
                control.id,
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
        <label v-else-if="control.kind === 'range'" class="cs-context-control">
          <span>{{ control.label }}</span>
          <input
            type="range"
            :value="control.value"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            :aria-label="control.label"
            @change="
              emit(
                'change',
                control.id,
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
        <label v-else-if="control.kind === 'select'" class="cs-context-control">
          <span>{{ control.label }}</span>
          <select
            :value="control.value"
            :aria-label="control.label"
            @change="
              emit(
                'change',
                control.id,
                ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option
              v-for="option in control.options"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
      </template>
    </div>
  </section>
</template>
