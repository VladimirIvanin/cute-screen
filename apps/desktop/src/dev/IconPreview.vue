<script setup lang="ts">
import { UiIcon } from '../../../../packages/editor-vue/src/shell/icon'
import type { IconName } from '../../../../packages/editor-vue/src/shell/types'
import { createCustomIcon } from '../../../../packages/editor-vue/src/shell/icons/create-custom-icon'
import {
  dropEyedropperGeometry,
  filledEyedropperGeometry,
  outlineEyedropperGeometry,
} from '../../../../packages/editor-vue/src/shell/icons/geometry'
import '../../../../packages/editor-vue/src/shell/shell.css'
import { spotlightCandidates } from './spotlight-candidates'
import { censorCandidates } from './censor-selected'

const sizes = [16, 18, 20, 24, 32] as const
const names = [
  'callout',
  'loupe',
  'marker',
  'pencil',
  'eyedropper',
  'spotlight',
  'privacy',
  'select',
  'arrow',
  'text',
  'crop',
  'camera',
  'shape',
] satisfies IconName[]
const states = ['rest', 'hover', 'active', 'disabled', 'focus'] as const
const eyedroppers = [
  { name: 'Наполненная', component: createCustomIcon('eyedropper-filled', filledEyedropperGeometry) },
  { name: 'С каплей', component: createCustomIcon('eyedropper-drop', dropEyedropperGeometry) },
  { name: 'Предыдущая', component: createCustomIcon('eyedropper-outline', outlineEyedropperGeometry) },
]
</script>

<template>
  <main class="icon-workbench">
    <h1>Cute Screen · Icon workbench</h1>
    <p>Live UiIcon · 24-unit grid · currentColor · stroke 1.8 · round caps and joins</p>
    <section class="loupe-preview">
      <h2>Лупа · принятый B1: область и увеличение</h2>
      <div class="icon-themes">
        <section
          v-for="theme in ['light', 'dark']"
          :key="theme"
          :data-theme="theme"
          class="icon-theme"
        >
          <div class="icon-row icon-heading">
            <span>{{ theme }}</span>
            <span v-for="size in sizes" :key="size">{{ size }} px</span>
          </div>
          <div class="icon-row">
            <span>B1</span>
            <span
              v-for="size in sizes"
              :key="size"
              class="icon-cell"
            >
              <UiIcon name="loupe" :style="{ width: `${size}px`, height: `${size}px` }" />
            </span>
          </div>
          <div class="icon-states">
            <button
              v-for="state in states"
              :key="state"
              :class="['icon-state', `is-${state}`]"
              :aria-label="`${theme} loupe ${state}`"
              :aria-pressed="state === 'active'"
              :disabled="state === 'disabled'"
            >
              <UiIcon name="loupe" />
            </button>
            <span>18 px</span>
          </div>
          <p class="icon-legend">rest · hover · active · disabled · focus</p>
        </section>
      </div>
    </section>
    <section class="censor-proposals">
      <h2>Скрыть данные · шахматная мозаика</h2>
      <div class="icon-themes icon-candidates">
        <section
          v-for="theme in ['light', 'dark']"
          :key="theme"
          :data-theme="theme"
          class="icon-theme"
        >
          <div class="icon-row icon-heading">
            <span>{{ theme }}</span>
            <span
              v-for="size in [18, 24, 32, 48]"
              :key="size"
            >{{ size }} px</span>
          </div>
          <div
            v-for="candidate in censorCandidates"
            :key="candidate.id"
            :data-censor-candidate="candidate.id"
            :title="candidate.description"
            class="icon-row"
          >
            <span>{{ candidate.name }}</span>
            <span
              v-for="size in [18, 24, 32, 48]"
              :key="size"
              class="icon-cell"
            >
              <component
                :is="candidate.component"
                :style="{ width: `${size}px`, height: `${size}px` }"
              />
            </span>
          </div>
          <div class="censor-neighbors">
            <span>Сейчас <UiIcon name="privacy" /></span>
            <span>Фонарь <UiIcon name="spotlight" /></span>
            <span>18 px</span>
          </div>
        </section>
      </div>
      <p class="spotlight-descriptions">
        <span
          v-for="candidate in censorCandidates"
          :key="candidate.id"
        >
          <strong>{{ candidate.name }}</strong> — {{ candidate.description }}
        </span>
      </p>
    </section>
    <details>
      <summary>Фонарь · принятый вариант и сравнение</summary>
      <section class="spotlight-proposals">
        <h2>Фонарь · единая штрихованная подложка</h2>
        <div class="icon-themes icon-candidates">
          <section
            v-for="theme in ['light', 'dark']"
            :key="theme"
            :data-theme="theme"
            class="icon-theme"
          >
            <div class="icon-row icon-heading">
              <span>{{ theme }}</span>
              <span v-for="size in [18, 24, 32, 48]" :key="size">{{ size }} px</span>
            </div>
            <div
              v-for="candidate in spotlightCandidates"
              :key="candidate.id"
              :data-spotlight-candidate="candidate.id"
              :title="candidate.description"
              class="icon-row"
            >
              <span>{{ candidate.name }}</span>
              <span
                v-for="size in [18, 24, 32, 48]"
                :key="size"
                class="icon-cell"
              >
                <component :is="candidate.component" :style="{ width: `${size}px`, height: `${size}px` }" />
              </span>
            </div>
          </section>
        </div>
        <p class="spotlight-descriptions">
          <span v-for="candidate in spotlightCandidates" :key="candidate.id">
            <strong>{{ candidate.name }}</strong> — {{ candidate.description }}
          </span>
        </p>
      </section>
    </details>
    <details>
      <summary>Пипетка · предыдущие варианты</summary>
      <div class="icon-themes icon-candidates">
        <section
          v-for="theme in ['light', 'dark']"
          :key="theme"
          :data-theme="theme"
          class="icon-theme"
        >
          <div class="icon-row icon-heading"><span>{{ theme }}</span><span v-for="size in [18, 24, 32, 48]" :key="size">{{ size }} px</span></div>
          <div
            v-for="candidate in eyedroppers"
            :key="candidate.name"
            class="icon-row"
          >
            <span>{{ candidate.name }}</span>
            <span
              v-for="size in [18, 24, 32, 48]"
              :key="size"
              class="icon-cell"
            >
              <component :is="candidate.component" :style="{ width: `${size}px`, height: `${size}px` }" />
            </span>
          </div>
        </section>
      </div>
      <p>В интерфейсе сейчас «Наполненная». Ниже — весь набор с соседними Tabler.</p>
    </details>
    <div class="icon-themes">
      <section
        v-for="theme in ['light', 'dark']"
        :key="theme"
        :data-theme="theme"
        class="icon-theme"
      >
        <h2>{{ theme }}</h2>
        <div class="icon-row icon-heading"><span>Semantic name</span><span v-for="size in sizes" :key="size">{{ size }} px</span></div>
        <div
          v-for="name in names"
          :key="name"
          class="icon-row"
          :data-icon-name="name"
        >
          <code>{{ name }}</code>
          <span
            v-for="size in sizes"
            :key="size"
            :data-size="size"
            class="icon-cell"
          >
            <UiIcon :name="name" :style="{ width: `${size}px`, height: `${size}px` }" />
          </span>
        </div>
        <h3>18 px · button states</h3>
        <div
          v-for="name in ['callout', 'marker', 'pencil', 'eyedropper'] as const"
          :key="name"
          class="icon-states"
        >
          <button
            v-for="state in states"
            :key="state"
            :class="['icon-state', `is-${state}`]"
            :aria-label="`${theme} ${name} ${state}`"
            :aria-pressed="state === 'active'"
            :disabled="state === 'disabled'"
          >
            <UiIcon :name="name" />
          </button>
          <code>{{ name }}</code>
        </div>
        <p class="icon-legend">rest · hover sample · active · disabled · focus sample</p>
      </section>
    </div>
    <p>Review silhouettes at 18 px before zooming. Hover and Tab also exercise the real button states.</p>
  </main>
</template>

<style>
body { margin: 0; background: #e9e9ec; color: #202124; font: 14px/1.5 system-ui, sans-serif; }
.icon-workbench { max-width: 1160px; margin: auto; padding: 24px; }
.icon-workbench h1 { font-size: 24px; margin: 0; }
.spotlight-descriptions { display: grid; gap: 4px; }
.censor-neighbors { display: flex; align-items: center; gap: 24px; margin-top: 16px; font-size: 12px; }
.censor-neighbors span { display: inline-flex; align-items: center; gap: 8px; }
.censor-neighbors svg { width: 18px; height: 18px; }
.icon-workbench details { margin: 20px 0; }
.icon-workbench summary { cursor: pointer; margin-bottom: 12px; }
.icon-themes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.icon-theme { padding: 20px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 12px; }
.icon-theme h2 { margin: 0 0 12px; font-size: 18px; }
.icon-row { display: grid; grid-template-columns: 110px repeat(5, 1fr); gap: 8px; align-items: center; min-height: 46px; border-bottom: 1px solid var(--border); }
.icon-heading { font-size: 11px; color: var(--text-muted); min-height: 28px; }
.icon-candidates .icon-row { grid-template-columns: 110px repeat(4, 1fr); min-height: 60px; }
.icon-cell { display: flex; align-items: center; justify-content: center; }
.icon-heading span:not(:first-child) { text-align: center; }
.icon-states { display: flex; align-items: center; gap: 14px; margin: 12px 0; }
.icon-state { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 32px; height: 32px; padding: 0; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 8px; }
.icon-state svg { width: 18px; height: 18px; }
.icon-state:hover, .icon-state.is-hover { background: var(--surface-raised); border-color: var(--border); }
.icon-state[aria-pressed='true'] { color: var(--accent); background: var(--accent-soft); border-color: var(--accent); }
.icon-state:disabled { opacity: 0.35; }
.icon-state:focus-visible, .icon-state.is-focus { outline: 2px solid var(--accent); outline-offset: 3px; }
.icon-legend { font-size: 11px; color: var(--text-muted); }
@media (max-width: 900px) { .icon-themes { grid-template-columns: 1fr; } }
</style>
