<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import { UiIcon } from '../../../../packages/editor-vue/src/shell/icon'
import type { SettingsStrings } from './labels'

defineProps<{ name: string; labels: SettingsStrings; busy: boolean; manual: boolean }>()
const emit = defineEmits<{ test: []; remove: [] }>()
const open = ref(false)
const root = ref<HTMLElement>()
const toggle = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()

async function show(last = false): Promise<void> {
  open.value = true
  await nextTick()
  const items = menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  items?.[last ? items.length - 1 : 0]?.focus()
  menu.value?.scrollIntoView?.({ block: 'nearest' })
}

function close(restore = false): void {
  open.value = false
  if (restore) toggle.value?.focus()
}

function outside(event: Event): void {
  if (!root.value?.contains(event.target as Node)) close()
}

function moveFocus(key: string): void {
  const items = Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  let index = key === 'ArrowDown' ? current + 1 : current - 1
  if (key === 'Home') index = 0
  if (key === 'End') index = items.length - 1
  items[(index + items.length) % items.length]?.focus()
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close(true)
    return
  }
  if (event.key === 'Tab') {
    close()
    return
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    moveFocus(event.key)
  }
}

function select(action: 'test' | 'remove'): void {
  close(true)
  if (action === 'test') emit('test')
  else emit('remove')
}

onMounted(() => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('focusin', outside)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('focusin', outside)
})
</script>

<template>
  <div ref="root" class="cs-shortcut-actions">
    <button
      ref="toggle"
      class="cs-shortcut-more"
      :disabled="busy"
      :aria-label="`${labels.actions}: ${name}`"
      :title="`${labels.actions}: ${name}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open ? close() : show()"
      @keydown.down.prevent="show()"
      @keydown.up.prevent="show(true)"
    >
      <UiIcon name="more" />
    </button>
    <div
      v-if="open"
      ref="menu"
      class="cs-shortcut-menu"
      role="menu"
      :aria-label="`${labels.actions}: ${name}`"
      @keydown="onKey"
    >
      <button role="menuitem" @click="select('test')">{{ labels.test }}</button>
      <button
        v-if="!manual"
        role="menuitem"
        @click="select('remove')"
      >
        {{ labels.remove }}
      </button>
    </div>
  </div>
</template>
