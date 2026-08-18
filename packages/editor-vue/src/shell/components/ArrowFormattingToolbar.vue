<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { NPopover } from 'naive-ui'
import type { ContextControl } from '../types'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import DeferredColorPicker from '../ui/DeferredColorPicker.vue'

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

function setTrigger(id: string, element: HTMLButtonElement | null): void {
  triggers.value[id] = element ?? undefined
}

function setPopoverRoot(id: string, element: HTMLElement | null): void {
  popoverRoots.value[id] = element ?? undefined
}

function onPopoverShown(id: string, shown: boolean): void {
  openPopover.value = { ...openPopover.value, [id]: shown }
  if (!shown) {
    void nextTick(() => triggers.value[id]?.focus({ preventScroll: true }))
  }
}

function closePopover(id: string): void {
  onPopoverShown(id, false)
}

function togglePopover(event: KeyboardEvent, id: string): void {
  event.preventDefault()
  onPopoverShown(id, !(openPopover.value[id] ?? false))
}

function choose(id: string, value: string): void {
  emit('change', id, value)
  closePopover(id)
}

function arrowStrokeStyles(
  control: Extract<ContextControl, { readonly kind: 'arrowStroke' }>,
): readonly ('solid' | 'dashed' | 'dotted')[] {
  return control.style === 'dotted'
    ? (['solid', 'dashed', 'dotted'] as const)
    : (['solid', 'dashed'] as const)
}

function popoverKeydown(event: KeyboardEvent, id: string): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  closePopover(id)
}

function closeOnOutsidePointer(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  for (const [id, shown] of Object.entries(openPopover.value)) {
    if (!shown) continue
    if (
      triggers.value[id]?.contains(target) ||
      popoverRoots.value[id]?.contains(target)
    ) {
      continue
    }
    closePopover(id)
  }
}

onMounted(() =>
  document.addEventListener('pointerdown', closeOnOutsidePointer, true),
)
onBeforeUnmount(() =>
  document.removeEventListener('pointerdown', closeOnOutsidePointer, true),
)
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
      <label
        v-if="control.kind === 'color'"
        class="cs-context-control cs-arrow-toolbar-control"
        :data-control="control.compact ? control.id : undefined"
      >
        <span v-if="!control.compact">{{ control.label }}</span>
        <DeferredColorPicker
          :model-value="control.value"
          :recent-colors="recentColors ?? []"
          :disabled="control.disabled ?? false"
          :eyedropper="control.eyedropper ?? true"
          :compact="control.compact ?? false"
          :locale="pickerLocale ?? 'en'"
          v-bind="{ ariaLabel: control.label }"
          @commit="emit('change', control.id, $event)"
          @eyedropper="emit('eyedropper', control.id)"
        />
      </label>
      <div
        v-else-if="control.kind === 'arrowStroke'"
        class="cs-arrow-toolbar-control"
        data-control="stroke"
      >
        <NPopover
          :show="openPopover[control.id] ?? false"
          trigger="click"
          placement="top"
          :show-arrow="false"
          raw
          to=".cs-overlay-root"
          @update:show="onPopoverShown(control.id, $event)"
        >
          <template #trigger>
            <button
              :ref="
                (element) =>
                  setTrigger(control.id, element as HTMLButtonElement | null)
              "
              class="cs-arrow-toolbar-trigger"
              type="button"
              :disabled="control.disabled ?? false"
              :aria-label="`${control.label}: ${control.width} px`"
              :title="control.label"
              :aria-expanded="openPopover[control.id] ?? false"
              aria-haspopup="dialog"
              @keydown.enter.space="togglePopover($event, control.id)"
            >
              <svg viewBox="0 0 36 18" aria-hidden="true" focusable="false">
                <path
                  d="M3 9h30"
                  fill="none"
                  stroke="currentColor"
                  :stroke-width="Math.min(control.width, 7)"
                  stroke-linecap="round"
                  :stroke-dasharray="
                    control.style === 'dashed'
                      ? '7 4'
                      : control.style === 'dotted'
                        ? '1 4'
                        : undefined
                  "
                />
              </svg>
              <span>{{ control.width }} px</span>
            </button>
          </template>
          <section
            :ref="
              (element) =>
                setPopoverRoot(control.id, element as HTMLElement | null)
            "
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
                @click="choose('strokeStyle', style)"
              >
                <svg viewBox="0 0 42 16" aria-hidden="true" focusable="false">
                  <path
                    d="M3 8h36"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    :stroke-dasharray="
                      style === 'dashed'
                        ? '7 4'
                        : style === 'dotted'
                          ? '1 4'
                          : undefined
                    "
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
            <div
              class="cs-arrow-toolbar-options"
              role="group"
              aria-label="Width presets"
            >
              <span
                v-if="![2, 4, 6, 8, 10].includes(control.width)"
                class="cs-arrow-legacy-width"
              >
                {{ control.width }} px
              </span>
              <button
                v-for="width in [2, 4, 6, 8, 10]"
                :key="width"
                type="button"
                :aria-label="`${width} px`"
                :aria-pressed="control.width === width"
                @click="choose('width', String(width))"
              >
                <svg viewBox="0 0 24 22" aria-hidden="true" focusable="false">
                  <path
                    d="M3 11h18"
                    fill="none"
                    stroke="currentColor"
                    :stroke-width="width"
                    stroke-linecap="round"
                  />
                </svg>
                <span>{{ width }} px</span>
              </button>
            </div>
          </section>
        </NPopover>
      </div>
      <div
        v-else-if="control.kind === 'arrowCap'"
        class="cs-arrow-toolbar-control"
        :data-control="control.id"
      >
        <NPopover
          :show="openPopover[control.id] ?? false"
          trigger="click"
          placement="top"
          :show-arrow="false"
          raw
          to=".cs-overlay-root"
          @update:show="onPopoverShown(control.id, $event)"
        >
          <template #trigger>
            <button
              :ref="
                (element) =>
                  setTrigger(control.id, element as HTMLButtonElement | null)
              "
              class="cs-arrow-toolbar-trigger"
              type="button"
              :disabled="control.disabled ?? false"
              :aria-label="`${control.label}: ${control.options.find((option) => option.value === control.value)?.label ?? control.value}`"
              :title="control.label"
              :aria-expanded="openPopover[control.id] ?? false"
              aria-haspopup="dialog"
              @keydown.enter.space="togglePopover($event, control.id)"
            >
              <svg viewBox="0 0 36 22" aria-hidden="true" focusable="false">
                <path
                  d="M4 11h18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
                <path
                  v-if="control.value === 'lineArrow'"
                  d="m18 5 7 6-7 6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  v-else-if="control.value === 'solidArrow'"
                  d="m17 4 10 7-10 7z"
                  fill="currentColor"
                />
                <path
                  v-else-if="control.value === 'triangle'"
                  d="m17 4 10 7-10 7z"
                  fill="var(--surface-raised)"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
                <circle
                  v-else-if="control.value === 'circle'"
                  cx="24"
                  cy="11"
                  r="5"
                  fill="var(--surface-raised)"
                  stroke="currentColor"
                  stroke-width="2"
                />
                <path
                  v-else-if="control.value === 'diamond'"
                  d="m24 4 6 7-6 7-6-7z"
                  fill="var(--surface-raised)"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </template>
          <section
            :ref="
              (element) =>
                setPopoverRoot(control.id, element as HTMLElement | null)
            "
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
                :aria-pressed="control.value === option.value"
                @click="choose(control.id, option.value)"
              >
                <span>{{ option.label }}</span>
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
        <NPopover
          :show="openPopover[control.id] ?? false"
          trigger="click"
          placement="top"
          :show-arrow="false"
          raw
          to=".cs-overlay-root"
          @update:show="onPopoverShown(control.id, $event)"
        >
          <template #trigger>
            <button
              :ref="
                (element) =>
                  setTrigger(control.id, element as HTMLButtonElement | null)
              "
              class="cs-arrow-toolbar-trigger"
              type="button"
              :disabled="control.disabled ?? false"
              :aria-label="`${control.label}: ${control.options.find((option) => option.value === control.value)?.label ?? control.value}`"
              :title="control.label"
              :aria-expanded="openPopover[control.id] ?? false"
              aria-haspopup="dialog"
              @keydown.enter.space="togglePopover($event, control.id)"
            >
              <svg viewBox="0 0 38 22" aria-hidden="true" focusable="false">
                <path
                  v-if="control.value === 'straight'"
                  d="M4 17 30 5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
                <path
                  v-else-if="control.value === 'elbow'"
                  d="M4 17h14V5h12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  v-else
                  d="M4 17C13 17 18 5 30 5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </template>
          <section
            :ref="
              (element) =>
                setPopoverRoot(control.id, element as HTMLElement | null)
            "
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
                v-for="option in control.options"
                :key="option.value"
                type="button"
                :aria-label="option.label"
                :aria-pressed="control.value === option.value"
                @click="choose(control.id, option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </section>
        </NPopover>
      </div>
    </template>
  </div>
</template>
