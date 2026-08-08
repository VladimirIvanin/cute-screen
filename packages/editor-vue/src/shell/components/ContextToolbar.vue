<script setup lang="ts">
import { UiIcon } from '../icon'
import type { ContextToolbarSchema } from '../types'
defineProps<{
  schema?: ContextToolbarSchema | undefined
  label: string
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
      <span
        v-for="control in schema.controls"
        :key="control.id"
        class="cs-context-control"
        >{{ control.label }}</span
      >
    </div>
  </section>
</template>
