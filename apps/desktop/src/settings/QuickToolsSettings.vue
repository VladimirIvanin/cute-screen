<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import {
  quickToolCatalog,
  orderQuickTools,
  t,
  UiIcon,
  UI_PREFERENCES_STORAGE_KEY,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import type { SettingsLocale } from './labels'
import './quick-tools.css'

const props = defineProps<{ locale: SettingsLocale }>()
const store = useEditorShellStore()
const dragged = ref<string>()
const over = ref<boolean>()
const insertion = ref<string>()
const error = ref('')
const announcement = ref('')
const text = computed(() => props.locale === 'ru' ? {
  title: 'Быстрый режим',
  help: 'Меняйте порядок инструментов и перетаскивайте их между группами. Панель в редакторе всегда содержит все инструменты.',
  active: 'На панели быстрого режима', hidden: 'Скрытые инструменты',
  empty: 'Все инструменты на панели. Перетащите сюда те, которые хотите скрыть.',
  pinned: 'Всегда на панели', hide: 'Скрыть', show: 'Вернуть на панель',
  keyboard: 'Enter/пробел — перенос между группами, Alt + стрелки — порядок. Изменения сохраняются сразу.',
  newTools: 'Новые инструменты автоматически появятся на панели.',
  failed: 'Не удалось сохранить настройку.', retry: 'Повторить сохранение',
} : {
  title: 'Quick mode',
  help: 'Reorder tools and drag them between groups. The editor toolbar always keeps every tool.',
  active: 'On the quick mode toolbar', hidden: 'Hidden tools',
  empty: 'Every tool is on the toolbar. Drag tools here to hide them.',
  pinned: 'Always on the toolbar', hide: 'Hide', show: 'Show on toolbar',
  keyboard: 'Enter/Space moves between groups; Alt + arrow keys changes the order. Changes are saved immediately.',
  newTools: 'New tools will automatically appear on the toolbar.',
  failed: 'Could not save this setting.', retry: 'Retry saving',
})
const hidden = computed(() => store.preferences.quickHiddenTools ?? [])
const orderedTools = computed(() => orderQuickTools(quickToolCatalog, store.preferences.quickToolOrder))
const groups = computed(() => [
  {
    hidden: false,
    title: text.value.active,
    tools: orderedTools.value.filter((tool) => tool.id === 'select' || !hidden.value.includes(tool.id)),
  },
  {
    hidden: true,
    title: text.value.hidden,
    tools: orderedTools.value.filter((tool) => tool.id !== 'select' && hidden.value.includes(tool.id)),
  },
])

function save(): void {
  try {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(store.preferences))
    error.value = ''
  } catch (cause) {
    error.value = `${text.value.failed} ${cause instanceof Error ? cause.message : String(cause)}`
  }
}

async function move(
  id: string,
  hide: boolean,
  before?: string,
): Promise<void> {
  if (id === 'select' || !quickToolCatalog.some((tool) => tool.id === id)) return
  if (before === id) return
  const activeIds = groups.value[0]!.tools.filter((tool) => tool.id !== id && tool.id !== 'select').map((tool) => tool.id)
  const hiddenIds = groups.value[1]!.tools.filter((tool) => tool.id !== id).map((tool) => tool.id)
  const target = hide ? hiddenIds : activeIds
  const index = before ? target.indexOf(before) : -1
  target.splice(index < 0 ? target.length : index, 0, id)
  const knownIds = new Set(quickToolCatalog.map((tool) => tool.id))
  const unknownOrder = (store.preferences.quickToolOrder ?? []).filter((item) => !knownIds.has(item))
  store.setQuickToolLayout(
    hide ? [...new Set([...hidden.value, id])] : hidden.value.filter((item) => item !== id),
    [...activeIds, ...hiddenIds, ...unknownOrder],
  )
  save()
  const tool = quickToolCatalog.find((item) => item.id === id)!
  announcement.value = `${t(props.locale, tool.labelKey)}: ${hide ? text.value.hidden : text.value.active}, ${target.indexOf(id) + 1}/${target.length}`
  await nextTick()
  document.querySelector<HTMLButtonElement>(`[data-quick-tool="${id}"]`)?.focus()
}

let gesture: { id: string; pointerId: number; x: number; y: number } | undefined
let suppressClick = false
const position = ref({ x: 0, y: 0 })
const dragLabel = computed(() => {
  const tool = quickToolCatalog.find((item) => item.id === dragged.value)
  return tool ? t(props.locale, tool.labelKey) : ''
})

function start(
  id: string,
  event: PointerEvent,
): void {
  if (id === 'select' || event.button !== 0) return
  suppressClick = false
  gesture = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  const button = event.currentTarget as HTMLElement
  button.setPointerCapture?.(event.pointerId)
}

function placement(event: PointerEvent): { hidden: boolean; before?: string } | undefined {
  const zone = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-quick-zone]')
  if (!zone) return undefined
  const buttons = zone.querySelectorAll<HTMLElement>('[data-quick-tool]:not(:disabled)')
  for (const button of buttons) {
    const bounds = button.getBoundingClientRect()
    if (
      event.clientY < bounds.bottom &&
      (event.clientY < bounds.top ||
        event.clientX < bounds.left + bounds.width / 2)
    ) {
      return { hidden: zone.dataset.quickZone === 'hidden', before: button.dataset.quickTool! }
    }
  }
  return { hidden: zone.dataset.quickZone === 'hidden' }
}

function pointerMove(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return
  if (!dragged.value && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5) return
  dragged.value = gesture.id
  suppressClick = true
  position.value = { x: event.clientX + 12, y: event.clientY + 12 }
  const target = placement(event)
  over.value = target?.hidden
  insertion.value = target?.before
}

function cancel(): void {
  gesture = undefined
  dragged.value = undefined
  over.value = undefined
  insertion.value = undefined
}

function pointerUp(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return
  const target = placement(event)
  if (dragged.value && target) void move(dragged.value, target.hidden, target.before)
  cancel()
}

function reorder(
  id: string,
  event: KeyboardEvent,
): void {
  if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const hide = hidden.value.includes(id)
  const ids = groups.value[hide ? 1 : 0]!.tools.filter((tool) => tool.id !== 'select').map((tool) => tool.id)
  const index = ids.indexOf(id)
  const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1
  const neighbor = index + direction
  if (neighbor < 0 || neighbor >= ids.length) return
  void move(id, hide, direction < 0 ? ids[neighbor] : ids[index + 2])
}

function activate(
  id: string,
  hide: boolean,
  event: MouseEvent,
): void {
  if (suppressClick && event.detail !== 0) return
  void move(id, hide)
}

onMounted(() => {
  window.addEventListener('pointermove', pointerMove)
  window.addEventListener('pointerup', pointerUp)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('blur', cancel)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', pointerMove)
  window.removeEventListener('pointerup', pointerUp)
  window.removeEventListener('pointercancel', cancel)
  window.removeEventListener('blur', cancel)
})
</script>

<template>
  <section
    class="cs-quick-tools-settings"
    :aria-label="text.title"
    @keydown.esc="cancel"
  >
    <h2 class="cs-settings-section-title">{{ text.title }}</h2>
    <p class="cs-settings-muted">{{ text.help }}</p>
    <div
      v-for="group in groups"
      :key="String(group.hidden)"
      class="cs-quick-tools-zone"
      :class="{ 'is-drop-target': dragged && over === group.hidden }"
      :data-quick-zone="group.hidden ? 'hidden' : 'active'"
      role="group"
      :aria-label="group.title"
    >
      <h3>{{ group.title }} <span class="cs-settings-muted">{{ group.tools.length }}</span></h3>
      <div class="cs-quick-tools-list">
        <button
          v-for="tool in group.tools"
          :key="tool.id"
          type="button"
          :data-quick-tool="tool.id"
          :draggable="false"
          :disabled="tool.id === 'select'"
          :class="{ 'is-dragging': dragged === tool.id, 'is-insertion-target': dragged && insertion === tool.id }"
          :aria-label="`${t(locale, tool.labelKey)}: ${tool.id === 'select' ? text.pinned : group.hidden ? text.show : text.hide}`"
          :title="tool.id === 'select' ? text.pinned : group.hidden ? text.show : text.hide"
          @pointerdown="start(tool.id, $event)"
          @keydown="reorder(tool.id, $event)"
          @click="activate(tool.id, !group.hidden, $event)"
        >
          <UiIcon :name="tool.icon" />
          <span>{{ t(locale, tool.labelKey) }}</span>
          <kbd v-if="tool.shortcut">{{ tool.shortcut }}</kbd>
          <small v-if="tool.id === 'select'">{{ text.pinned }}</small>
        </button>
      </div>
      <p v-if="!group.tools.length" class="cs-settings-muted">{{ text.empty }}</p>
    </div>
    <div
      v-if="dragged"
      class="cs-quick-tools-ghost"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      aria-hidden="true"
    >
      {{ dragLabel }}
    </div>
    <p class="cs-settings-muted">{{ text.keyboard }}</p>
    <p class="cs-settings-muted">{{ text.newTools }}</p>
    <p
      v-if="error"
      role="alert"
      class="cs-settings-error"
    >
      {{ error }} <button @click="save">{{ text.retry }}</button>
    </p>
    <span class="cs-quick-tools-announcement" role="status">{{ announcement }}</span>
  </section>
</template>
