<script setup lang="ts">
import { UiIcon } from '../icon'
import type { ContextToolbarSchema } from '../types'
defineProps<{
  schema?: ContextToolbarSchema | undefined
  label: string
}>()
const emit = defineEmits<{ action: [id: string] }>()
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
        <span v-else class="cs-context-control">{{ control.label }}</span>
      </template>
    </div>
  </section>
</template>
