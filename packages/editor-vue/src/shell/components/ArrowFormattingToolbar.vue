<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import { NPopover } from 'naive-ui'
import { usePreviewPopover } from '../ui/use-preview-popover'
import type { ContextControl } from '../types'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import { UiIcon } from '../icon'
import ArrowStylePreview from './ArrowStylePreview.vue'
import UiSeparator from '../ui/UiSeparator.vue'
import NumericControl from '../ui/NumericControl.vue'

defineProps<{
  controls: readonly ContextControl[]
  recentColors?: readonly SrgbColor[]
  pickerLocale?: 'en' | 'ru'
  variant?: 'floating' | 'popover'
}>()
const emit = defineEmits<{
  change: [id: string, value: string]
  eyedropper: [id: string]
}>()

const openPopover = ref<Record<string, boolean>>({})
const triggers = ref<Record<string, HTMLButtonElement | undefined>>({})
const popoverRoots = ref<Record<string, HTMLElement | undefined>>({})
const activePopover = () => Object.keys(openPopover.value).find((id) => openPopover.value[id])
const popoverPosition = usePreviewPopover(
  () => triggers.value[activePopover() ?? ''],
  () => popoverRoots.value[activePopover() ?? ''],
)

function setTrigger(
  id: string,
  element: HTMLButtonElement | null,
): void {
  triggers.value[id] = element ?? undefined
}

function setPopoverRoot(
  id: string,
  element: HTMLElement | null,
): void {
  popoverRoots.value[id] = element ?? undefined
}

function onPopoverShown(
  id: string,
  shown: boolean,
  restoreFocus = true,
): void {
  openPopover.value = shown ? { [id]: true } : { ...openPopover.value, [id]: false }
  if (shown)
    void nextTick(() =>
      popoverRoots.value[id]?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }))
  if (!shown && restoreFocus) {
    void nextTick(() => triggers.value[id]?.focus({ preventScroll: true }))
  }
}

function closePopover(id: string): void {
  onPopoverShown(id, false)
}

function togglePopover(
  event: KeyboardEvent,
  id: string,
): void {
  event.preventDefault()
  onPopoverShown(id, !(openPopover.value[id] ?? false))
}

function choose(
  id: string,
  value: string,
): void {
  emit('change', id, value)
  closePopover(id === 'width' || id === 'strokeStyle' ? 'stroke' : id)
}

function arrowStrokeStyles(
  control: Extract<ContextControl, { readonly kind: 'arrowStroke' }>,
): readonly ('solid' | 'dashed' | 'dotted')[] {
  return control.style === 'dotted' ? (['solid', 'dashed', 'dotted'] as const) : (['solid', 'dashed'] as const)
}

function popoverKeydown(
  event: KeyboardEvent,
  id: string,
): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  closePopover(id)
}

function closeOnOutsidePointer(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  for (const [id, shown] of Object.entries(openPopover.value)) {
    if (!shown) continue
    if (triggers.value[id]?.contains(target) || popoverRoots.value[id]?.contains(target)) {
      continue
    }
    onPopoverShown(id, false, false)
  }
}

onMounted(() => document.addEventListener('pointerdown', closeOnOutsidePointer, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutsidePointer, true))
</script>

<template>
  <div
    class="cs-arrow-formatting-toolbar"
    :class="{
      'cs-arrow-formatting-toolbar--floating': variant === 'floating',
      'cs-arrow-formatting-toolbar--popover': variant === 'popover',
    }"
  >
    <template v-for="control in controls" :key="control.id">
      <template v-if="control.kind === 'color'">
        <label
          class="cs-context-control cs-arrow-toolbar-control"
          :data-control="control.compact ? control.id : undefined"
        >
          <span v-if="!control.compact">{{ control.label }}</span>
          <SimpleColorPicker
            :model-value="control.value"
            :recent-colors="recentColors ?? []"
            :disabled="control.disabled ?? false"
            :eyedropper="control.eyedropper ?? true"
            :mixed="control.mixed ?? false"
            :locale="pickerLocale ?? 'en'"
            v-bind="{ ariaLabel: control.label }"
            @opened="openPopover = {}"
            @commit="emit('change', control.id, $event)"
            @eyedropper="emit('eyedropper', control.id)"
          />
        </label>
        <UiSeparator :length="21"/>
      </template>
      <div
        v-else-if="control.kind === 'arrowStroke'"
        class="cs-arrow-toolbar-control"
        data-control="stroke"
      >
        <button
          @click="onPopoverShown(control.id, !(openPopover[control.id] ?? false))"
          :ref="(element) => setTrigger(control.id, element as HTMLButtonElement | null)"
          class="cs-arrow-toolbar-trigger"
          type="button"
          :disabled="control.disabled ?? false"
          :aria-label="`${control.label}: ${control.width} px`"
          :title="control.label"
          :aria-expanded="openPopover[control.id] ?? false"
          aria-haspopup="dialog"
          @keydown.enter.space="togglePopover($event, control.id)"
        >
          <svg
            viewBox="0 0 36 18"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M3 9h30"
              fill="none"
              stroke="currentColor"
              :stroke-width="Math.min(control.width, 7)"
              stroke-linecap="round"
              :stroke-dasharray="
                control.style === 'dashed' ? '7 4' : control.style === 'dotted' ? '1 4' : undefined
              "
            />
          </svg>
          <span class="sr-only">{{ control.width }} px</span>
          <UiIcon name="chevronDown" class="cs-arrow-toolbar-chevron"/>
        </button>
        <NPopover
          :show="openPopover[control.id] ?? false"
          trigger="manual"
          placement="top-start"
          :x="popoverPosition?.left ?? 0"
          :y="popoverPosition?.top ?? 0"
          overlap
          :flip="false"
          :show-arrow="false"
          raw
          to=".cs-overlay-root"
          @update:show="onPopoverShown(control.id, $event, false)"
        >
          <section
            :ref="(element) => setPopoverRoot(control.id, element as HTMLElement | null)"
            class="cs-arrow-toolbar-popover"
            role="dialog"
            :aria-label="control.label"
            @keydown="popoverKeydown($event, control.id)"
          >
            <div
              class="cs-arrow-toolbar-options"
              role="group"
              :aria-label="control.label"
            >
              <button
                v-for="style in arrowStrokeStyles(control)"
                :key="style"
                type="button"
                :aria-label="
                  style === 'solid'
                    ? control.solidLabel
                    : style === 'dashed'
                      ? control.dashedLabel
                      : control.dottedLabel
                "
                :aria-pressed="control.style === style"
                :disabled="control.disabled ?? false"
                @click="choose('strokeStyle', style)"
              >
                <svg
                  viewBox="0 0 42 16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M3 8h36"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    :stroke-dasharray="style === 'dashed' ? '7 4' : style === 'dotted' ? '1 4' : undefined"
                  />
                </svg>
                <span>{{
                  style === 'solid'
                    ? control.solidLabel
                    : style === 'dashed'
                      ? control.dashedLabel
                      : control.dottedLabel
                }}</span>
              </button>
            </div>
            <NumericControl
              :label="pickerLocale === 'ru' ? 'Толщина' : 'Thickness'"
              :locale="pickerLocale"
              control-id="width"
              :value="control.width"
              :min="0.01"
              :step="0.01"
              unit="px"
              :presets="[2, 4, 6, 8, 10]"
              :disabled="control.disabled"
              @commit="emit('change', 'width', String($event))"
            >
              <template #preset="preset">
                <svg viewBox="0 0 24 16" aria-hidden="true"><path
                  d="M3 8h18"
                  stroke="currentColor"
                  :stroke-width="preset.value"
                  stroke-linecap="round"
                /></svg>
                <span>{{ preset.value }}</span>
              </template>
            </NumericControl>
          </section>
        </NPopover>
      </div>
      <div
        v-else-if="control.kind === 'arrowCap'"
        class="cs-arrow-toolbar-control"
        :data-control="control.id"
      >
        <button
          @click="onPopoverShown(control.id, !(openPopover[control.id] ?? false))"
          :ref="(element) => setTrigger(control.id, element as HTMLButtonElement | null)"
          class="cs-arrow-toolbar-trigger"
          type="button"
          :disabled="control.disabled ?? false"
          :aria-label="`${control.label}: ${control.options.find((option) => option.value === control.value)?.label ?? control.value}`"
          :title="control.label"
          :aria-expanded="openPopover[control.id] ?? false"
          aria-haspopup="dialog"
          @keydown.enter.space="togglePopover($event, control.id)"
        >
          <ArrowStylePreview
            kind="cap"
            :value="control.value"
            :start="control.id === 'startCap'"
          />
          <UiIcon name="chevronDown" class="cs-arrow-toolbar-chevron"/>
        </button>
        <NPopover
          :show="openPopover[control.id] ?? false"
          trigger="manual"
          placement="top-start"
          :x="popoverPosition?.left ?? 0"
          :y="popoverPosition?.top ?? 0"
          overlap
          :flip="false"
          :show-arrow="false"
          raw
          to=".cs-overlay-root"
          @update:show="onPopoverShown(control.id, $event, false)"
        >
          <section
            :ref="(element) => setPopoverRoot(control.id, element as HTMLElement | null)"
            class="cs-arrow-toolbar-popover"
            role="dialog"
            :aria-label="control.label"
            @keydown="popoverKeydown($event, control.id)"
          >
            <div
              class="cs-arrow-toolbar-options cs-arrow-toolbar-options--caps"
              role="group"
              :aria-label="control.label"
            >
              <button
                v-for="option in control.options"
                :key="option.value"
                type="button"
                :aria-label="option.label"
                :title="option.label"
                :disabled="control.disabled ?? false"
                :aria-pressed="control.value === option.value"
                @click="choose(control.id, option.value)"
              >
                <ArrowStylePreview
                  kind="cap"
                  :value="option.value"
                  :start="control.id === 'startCap'"
                />
              </button>
            </div>
          </section>
        </NPopover>
      </div>
      <div
        v-else-if="control.kind === 'arrowPath'"
        class="cs-arrow-toolbar-control"
        data-control="arrowPath"
      >
        <button
          @click="onPopoverShown(control.id, !(openPopover[control.id] ?? false))"
          :ref="(element) => setTrigger(control.id, element as HTMLButtonElement | null)"
          class="cs-arrow-toolbar-trigger"
          type="button"
          :disabled="control.disabled ?? false"
          :aria-label="`${control.label}: ${control.options.find((option) => option.value === control.value)?.label ?? control.value}`"
          :title="control.label"
          :aria-expanded="openPopover[control.id] ?? false"
          aria-haspopup="dialog"
          @keydown.enter.space="togglePopover($event, control.id)"
        >
          <ArrowStylePreview kind="path" :value="control.value"/>
          <UiIcon name="chevronDown" class="cs-arrow-toolbar-chevron"/>
        </button>
        <NPopover
          :show="openPopover[control.id] ?? false"
          trigger="manual"
          placement="top-start"
          :x="popoverPosition?.left ?? 0"
          :y="popoverPosition?.top ?? 0"
          overlap
          :flip="false"
          :show-arrow="false"
          raw
          to=".cs-overlay-root"
          @update:show="onPopoverShown(control.id, $event, false)"
        >
          <section
            :ref="(element) => setPopoverRoot(control.id, element as HTMLElement | null)"
            class="cs-arrow-toolbar-popover"
            role="dialog"
            :aria-label="control.label"
            @keydown="popoverKeydown($event, control.id)"
          >
            <div
              class="cs-arrow-toolbar-options cs-arrow-toolbar-options--paths"
              role="group"
              :aria-label="control.label"
            >
              <button
                v-for="option in control.options"
                :key="option.value"
                type="button"
                :aria-label="option.label"
                :title="option.label"
                :disabled="control.disabled ?? false"
                :aria-pressed="control.value === option.value"
                @click="choose(control.id, option.value)"
              >
                <ArrowStylePreview kind="path" :value="option.value"/>
              </button>
            </div>
          </section>
        </NPopover>
      </div>
    </template>
  </div>
</template>
