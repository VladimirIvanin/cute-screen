<script setup lang="ts">
import { NButton } from 'naive-ui'
defineProps<{
  error?: string | undefined
  pending: boolean
  message?: string | undefined
  locale: 'ru' | 'en'
}>()
const emit = defineEmits<{ cancel: [] }>()
</script>

<template>
  <p
    v-if="error"
    class="cs-tool-error"
    role="alert"
  >
    {{ error }}
  </p>
  <p
    v-else-if="pending || message"
    class="cs-tool-error cs-image-feedback"
    role="status"
    :aria-busy="pending"
  >
    {{ pending ? (locale === 'ru' ? 'Добавление изображения…' : 'Adding image…') : message }}
    <NButton
      v-if="pending"
      text
      @click="emit('cancel')"
    >
      {{ locale === 'ru' ? 'Отмена' : 'Cancel' }}
    </NButton>
  </p>
</template>
