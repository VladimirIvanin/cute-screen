<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import {
  EMOJI_CATEGORIES,
  QUICK_EMOJI_IDS,
  findEmoji,
  searchEmoji,
  type EmojiEntry,
} from '@cute-screen/editor-renderer'
import {
  emojiUrl,
  EMOJI_LICENSE_URL,
  EMOJI_NOTICE_URL,
} from '../../emoji/resources'
import type { ContextToolbarSchema } from '../types'
import { UiIcon } from '../icon'
import NumericControl from '../ui/NumericControl.vue'
import { usePreviewPopover } from '../ui/use-preview-popover'
import { focusPopoverControl } from '../ui/focus-popover-control'

const props = defineProps<{ schema: ContextToolbarSchema; locale: 'ru' | 'en' }>()
const emit = defineEmits<{ change: [id: string, value: string] }>()
const settings = computed(() => props.schema.emoji!)
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const label = (entry: EmojiEntry) => entry[props.locale]
const open = ref<'palette' | 'size'>()
const panel = ref<HTMLElement>()
const paletteButton = ref<HTMLButtonElement>()
const sizeButton = ref<HTMLButtonElement>()
const query = ref('')
const category = ref('')
const focused = ref(0)
const blocked = computed(() => Boolean(props.schema.disabled || settings.value.pending))
const quick = QUICK_EMOJI_IDS.map((id) => findEmoji(id)!)
const results = computed(() => category.value === 'recent' && !query.value.trim()
  ? settings.value.recentIds.map((id) => findEmoji(id)).filter((entry): entry is EmojiEntry => Boolean(entry))
  : searchEmoji(query.value, query.value.trim() || category.value === 'recent' ? undefined : category.value))
const position = usePreviewPopover(
  () => open.value === 'palette' ? paletteButton.value : open.value === 'size' ? sizeButton.value : undefined,
  () => open.value ? panel.value : undefined,
)
const rows = computed(() => Array.from({ length: Math.ceil(results.value.length / 7) },
  (_, index) => results.value.slice(index * 7, index * 7 + 7)))
function show(
  menu: 'palette' | 'size' | undefined,
  restore = true,
): void {
  const previous = open.value
  open.value = menu
  if (menu === 'palette') {
    query.value = ''
    category.value = ''
    focused.value = 0
  }
  void nextTick(() => {
    if (menu) focusPopoverControl(panel.value)
    else if (restore) (previous === 'palette' ? paletteButton.value : sizeButton.value)?.focus({ preventScroll: true })
  })
}
function choose(id: string): void {
  if (blocked.value) return
  emit('change', 'emojiAsset', id)
  if (open.value) show(undefined)
}
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    show(undefined)
    return
  }
  if (!(event.target instanceof HTMLElement) || !event.target.matches('[data-emoji-cell]')) return
  const grid = panel.value?.querySelector<HTMLElement>('[role="grid"]')
  const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length || 7 : 7
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key]
  if (
    delta === undefined &&
    event.key !== 'Home' &&
    event.key !== 'End'
  ) return
  event.preventDefault()
  focused.value = event.key === 'Home' ? 0 : event.key === 'End' ? results.value.length - 1 : Math.max(0, Math.min(results.value.length - 1, focused.value + (delta ?? 0)))
  panel.value?.querySelectorAll<HTMLButtonElement>('[data-emoji-cell]')[focused.value]?.focus()
}
watch(results, () => {
  focused.value = 0
})
watch(() => props.schema.disabled, (value) => {
  if (value) show(undefined, false)
})
</script>

<template>
  <div
    class="cs-emoji-toolbar"
    data-tool-settings="emoji"
    :aria-busy="settings.pending"
  >
    <button
      ref="sizeButton"
      type="button"
      class="cs-emoji-size"
      :disabled="blocked"
      :aria-label="text('Emoji size', 'Размер эмоджи')"
      :aria-expanded="open === 'size'"
      aria-haspopup="dialog"
      @click="show(open === 'size' ? undefined : 'size')"
    >
      {{ Math.round(settings.size) }} px <UiIcon name="chevronDown"/>
    </button>
    <div
      class="cs-emoji-quick"
      role="group"
      :aria-label="text('Quick emoji', 'Быстрые эмоджи')"
    >
      <button
        v-for="entry in quick"
        :key="entry.id"
        type="button"
        :data-emoji-id="entry.id"
        :aria-label="label(entry)"
        :title="label(entry)"
        :aria-pressed="settings.assetId === entry.id"
        :disabled="blocked"
        @click="choose(entry.id)"
      >
        <img
          :src="emojiUrl(entry.id)"
          alt=""
          width="24"
          height="24"
          draggable="false"
        />
      </button>
    </div>
    <button
      ref="paletteButton"
      type="button"
      :aria-label="text('All emoji', 'Все эмоджи')"
      :title="text('All emoji', 'Все эмоджи')"
      :aria-expanded="open === 'palette'"
      aria-haspopup="dialog"
      :disabled="blocked"
      @click="show(open === 'palette' ? undefined : 'palette')"
    >
      <UiIcon name="emoji"/><UiIcon name="chevronDown"/>
    </button>
    <span v-if="settings.pending" role="status">{{ text('Loading…', 'Загрузка…') }}</span>
    <span
      v-if="settings.error"
      class="cs-emoji-error"
      role="alert"
    >{{ settings.error }} <button type="button" @click="emit('change', 'emojiRetry', '')">{{ text('Retry', 'Повторить') }}</button></span>
    <NPopover
      :show="Boolean(open)"
      trigger="manual"
      placement="top-start"
      :x="position?.left ?? 0"
      :y="position?.top ?? 0"
      overlap
      :flip="false"
      :show-arrow="false"
      raw
      to=".cs-overlay-root"
      @clickoutside="show(undefined, false)"
    >
      <div
        v-if="open"
        ref="panel"
        class="cs-emoji-popover cs-shape-popover"
        role="dialog"
        :aria-label="open === 'palette' ? text('All emoji', 'Все эмоджи') : text('Emoji size', 'Размер эмоджи')"
        @keydown="keydown"
        @pointerdown.stop
      >
        <NumericControl
          v-if="open === 'size'"
          :value="settings.size"
          :label="text('Size', 'Размер')"
          :min="16"
          :max="settings.selection ? 32768 : 256"
          :step="1"
          unit="px"
          :locale="locale"
          control-id="emojiSize"
          :disabled="blocked"
          slider
          stepper
          @commit="emit('change', 'emojiSize', String($event))"
        />
        <template v-else>
          <input
            v-model="query"
            type="search"
            :placeholder="text('Search emoji', 'Найти эмоджи')"
            :aria-label="text('Search emoji', 'Найти эмоджи')"
          />
          <div
            class="cs-emoji-categories"
            role="group"
            :aria-label="text('Categories', 'Категории')"
          >
            <button
              type="button"
              :aria-pressed="category === ''"
              @click="category = ''"
            >
              {{ text('All', 'Все') }}
            </button>
            <button
              type="button"
              :aria-pressed="category === 'recent'"
              @click="category = 'recent'"
            >
              {{ text('Recent', 'Недавние') }}
            </button>
            <button
              v-for="item in EMOJI_CATEGORIES"
              :key="item.id"
              type="button"
              :aria-pressed="category === item.id"
              @click="category = item.id"
            >
              {{ item[locale] }}
            </button>
          </div>
          <div
            v-if="results.length"
            class="cs-emoji-grid"
            role="grid"
            :aria-label="text('Emoji', 'Эмоджи')"
          >
            <div
              v-for="(row, rowIndex) in rows"
              :key="rowIndex"
              role="row"
              class="cs-emoji-grid-row"
            >
              <button
                v-for="(entry, index) in row"
                :key="entry.id"
                type="button"
                role="gridcell"
                data-emoji-cell
                :data-emoji-id="entry.id"
                :tabindex="rowIndex * 7 + index === focused ? 0 : -1"
                :aria-label="label(entry)"
                :title="label(entry)"
                :aria-pressed="entry.id === settings.assetId"
                :disabled="blocked"
                @focus="focused = rowIndex * 7 + index"
                @click="choose(entry.id)"
              >
                <img
                  :src="emojiUrl(entry.id)"
                  alt=""
                  width="24"
                  height="24"
                  draggable="false"
                />
              </button>
            </div>
          </div>
          <p
            v-else
            class="cs-emoji-empty"
            role="status"
          >
            {{ query ? text('No emoji found', 'Ничего не найдено') : text('No recent emoji yet', 'Недавних эмоджи пока нет') }}
          </p>
          <small
            class="cs-emoji-attribution"
            :data-notice-url="EMOJI_NOTICE_URL"
            :data-license-url="EMOJI_LICENSE_URL"
          ><a
            href="https://github.com/googlefonts/noto-emoji"
            target="_blank"
            rel="noreferrer"
          >Noto Emoji</a> · Apache 2.0</small>
        </template>
      </div>
    </NPopover>
  </div>
</template>

<style scoped>
.cs-emoji-toolbar, .cs-emoji-quick { display: flex; align-items: center; gap: 2px; }
.cs-emoji-toolbar { flex-wrap: wrap; max-width: min(620px, calc(100vw - 40px)); gap: 6px; }
.cs-emoji-quick { flex-wrap: wrap; }
.cs-emoji-quick button { width: 32px; padding: 0; flex: 0 0 32px; }
.cs-emoji-toolbar button, .cs-emoji-popover button { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; min-height: 32px; border: 1px solid transparent; border-radius: 6px; color: inherit; background: transparent; cursor: pointer; }
.cs-emoji-toolbar button:hover, .cs-emoji-popover button:hover { background: var(--cs-hover, #8882); }
.cs-emoji-toolbar button[aria-pressed='true'], .cs-emoji-popover button[aria-pressed='true'] { background: var(--cs-hover, #8883); border-color: currentColor; }
.cs-emoji-toolbar button:focus-visible, .cs-emoji-popover button:focus-visible, .cs-emoji-popover input:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.cs-emoji-toolbar button:disabled, .cs-emoji-popover button:disabled { opacity: .45; cursor: default; }
.cs-emoji-size { gap: 4px; white-space: nowrap; }
.cs-emoji-popover { box-sizing: border-box; width: min(304px, calc(100vw - 32px)); max-height: min(420px, calc(100vh - 40px)); overflow: auto; padding: 12px; }
.cs-emoji-popover input { box-sizing: border-box; width: 100%; padding: 7px; font: inherit; color: inherit; background: transparent; border: 1px solid #8888; border-radius: 6px; }
.cs-emoji-categories { display: flex; flex-wrap: wrap; gap: 2px; margin: 8px 0; }
.cs-emoji-categories button { padding: 2px 7px; font-size: 12px; }
.cs-emoji-grid, .cs-emoji-empty { height: 252px; box-sizing: border-box; }
.cs-emoji-grid { display: grid; grid-template-columns: repeat(7, 32px); align-content: start; gap: 4px; overflow-y: auto; scrollbar-gutter: stable; }
.cs-emoji-empty { display: flex; align-items: center; justify-content: center; margin: 0; }
.cs-emoji-grid-row { display: contents; }
.cs-emoji-error { max-width: 300px; font-size: 12px; }
.cs-emoji-attribution { display: block; margin-top: 8px; opacity: .7; font-size: 10px; }
.cs-emoji-attribution a { color: inherit; }
</style>
