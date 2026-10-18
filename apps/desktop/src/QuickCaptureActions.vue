<script setup lang="ts">
import { computed } from 'vue'
import { UiIcon } from '@cute-screen/editor-vue'

const props = defineProps<{
  locale: 'ru' | 'en'
  pending: boolean
}>()
const emit = defineEmits<{
  (event: 'editor' | 'copy' | 'save' | 'history' | 'close'): void
}>()
const labels = computed(() => props.locale === 'ru'
  ? ['Открыть редактор', 'Копировать', 'Сохранить PNG', 'Сохранить в историю и закрыть', 'Закрыть']
  : ['Open editor', 'Copy', 'Save PNG', 'Save to history and close', 'Close'])
const actions = ['editor', 'copy', 'save', 'history', 'close'] as const
const icons = ['edit', 'copy', 'export', 'history', 'close'] as const
</script>

<template>
  <nav
    class="cs-quick-actions"
    :aria-label="locale === 'ru' ? 'Действия со снимком' : 'Quick capture actions'"
    :aria-busy="pending"
  >
    <template v-for="(action, index) in actions" :key="action">
      <div
        v-if="action === 'close'"
        class="cs-quick-action-separator"
        role="separator"
      />
      <button
        type="button"
        :data-quick-action="action"
        :aria-label="labels[index]"
        :disabled="pending"
        @click="emit(action)"
      >
        <UiIcon :name="icons[index]!" />
        <span class="cs-quick-action-tooltip" aria-hidden="true">{{ labels[index] }}</span>
      </button>
    </template>
  </nav>
</template>
