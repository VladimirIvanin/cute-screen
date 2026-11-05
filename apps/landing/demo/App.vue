<script setup lang="ts">
import {
  createTextLayer,
  createDrawingLayer,
} from '@cute-screen/editor-vue'
import { installResponsiveTools } from './responsive-tools'
import { installDemoGestures } from './gestures'
import {
  onMounted,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  computed,
  watch,
} from 'vue'
import {
  EditorShell,
  UiIcon,
  DocumentSessionController,
  createEditorDocumentFromImage,
  parseEditorDocument,
  useEditorShellStore,
  type CanvasViewportHosts,
  type ShellActionAdapter,
  resolveCompositionLayout,
  createBrowserPreferencesStorage,
} from '@cute-screen/editor-vue'
import {
  DemoStorage,
  holdDemoStorage,
  type SavedWork,
} from './storage'
import {
  DemoImages,
  pickImage,
} from './images'

const storage = new DemoStorage()
const images = new DemoImages(storage)
const materials = {
  list: () => storage.materials.list(),
  put: async (record: Parameters<typeof storage.materials.put>[0]) => {
    await images.persist()
    await storage.materials.put(record)
  },
  remove: (id: string) => storage.materials.remove(id),
}
const store = useEditorShellStore()
const session = shallowRef<DocumentSessionController>()
const source = shallowRef<HTMLImageElement>()
const shell = ref<InstanceType<typeof EditorShell>>()
const hosts = shallowRef<CanvasViewportHosts>()
const message = ref('')
const busy = ref(true)
const confirm = window.confirm.bind(window)
const menu = ref(false)
const moreTools = ref(false)
const toolRail = shallowRef<HTMLElement>()
watch(() => store.activeToolId, () => {
  moreTools.value = false
})
const replacementDialog = ref<HTMLDialogElement>()
let resolveReplacement: ((choice: 'download' | 'replace' | 'cancel') => void) | undefined
function chooseReplacement(): Promise<'download' | 'replace' | 'cancel'> {
  replacementDialog.value?.showModal()
  return new Promise((resolve) => {
    resolveReplacement = resolve
  })
}
function finishReplacement(choice: 'download' | 'replace' | 'cancel'): void {
  replacementDialog.value?.close()
  resolveReplacement?.(choice)
  resolveReplacement = undefined
}
const ru = computed(() => store.locale === 'ru')
const text = (r: string, e: string) => ru.value ? r : e
let stopGestures: (() => void) | undefined
let stopResponsiveTools: (() => void) | undefined
function onHosts(value: CanvasViewportHosts): void {
  hosts.value = value
  stopResponsiveTools?.()
  toolRail.value = document.querySelector<HTMLElement>('.demo-app .cs-toolrail') ?? undefined
  if (toolRail.value) stopResponsiveTools = installResponsiveTools(toolRail.value)
  stopGestures?.()
  stopGestures = installDemoGestures(value, () => store.zoom, (zoom) => store.setZoom(zoom))
}
let releaseStorage: (() => void) | undefined
let expected: number | undefined
let changed = false
let stopSession: (() => void) | undefined
let disposed = false

async function guard(operation: () => Promise<void>): Promise<void> {
  try {
    await operation()
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  }
}
async function mount(work: SavedWork): Promise<void> {
  const parsed = parseEditorDocument(work.documentJson)
  if (parsed.kind !== 'editable') throw new Error('Unsupported document version')
  const document = parsed.document
  const record = await images.record(work.sourceHash)
  const url = URL.createObjectURL(record.blob)
  const image = new Image()
  try {
    image.src = url
    await image.decode()
  } finally {
    URL.revokeObjectURL(url)
  }
  if (disposed) return
  stopSession?.()
  session.value?.dispose()
  changed = false
  source.value = image
  session.value = new DocumentSessionController({ document,
    revision: work.revision,
    correlationId: () => crypto.randomUUID(),
    bridge: {
      saveDocument: async (value) => {
        await images.persist()
        const viewport = { zoom: store.zoom, mode: store.zoomMode }
        const revision = await storage.save({ ...value,
          revision: value.revision + 1,
          sourceHash: document.source.blobHash,
          ...(viewport ? { viewport } : {}) },
        expected)
        expected = revision
        return revision
      },
      exportRecoveryBundle: async () => {
        try {
          await download()
          return { kind: 'saved' }
        } catch (error) {
          return { kind: 'failed', error: String(error) }
        }
      },
    } })
  const initialToken = session.value.snapshot.core.versionToken
  stopSession = session.value.subscribe((snapshot) => {
    changed ||= snapshot.core.versionToken !== initialToken
  })
  await nextTick()
  if (work.viewport) shell.value?.restoreZoom(work.viewport)
  else store.enableFit()
}
async function replace(
  blob: Blob,
  confirm = true,
): Promise<void> {
  const record = await images.ingest(blob)
  if (confirm && changed) {
    const choice = await chooseReplacement()
    if (choice === 'cancel') return
    if (choice === 'download') await download()
  }
  const document = createEditorDocumentFromImage({ id: crypto.randomUUID(),
    baseLayerId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source: {
      blobHash: record.hash,
      format: record.format,
      mimeType: record.blob.type as 'image/png' | 'image/jpeg' | 'image/webp',
      width: record.width,
      height: record.height,
      orientationApplied: true,
      provenance: 'fileOpen',
      color: { colorSpace: 'srgb',
        hasIccProfile: false },

    } })
  await mount({ documentId: document.id, revision: 0, documentJson: JSON.stringify(document), sourceHash: record.hash })
  // Persist opened files even before their first edit; the built-in example remains ephemeral.
  if (confirm) {
    await images.persist()
    expected = await storage.save({ documentId: document.id,
      revision: 1,
      documentJson: JSON.stringify(document),
      sourceHash: record.hash },
    expected)
    await mount({ documentId: document.id,
      revision: 1,
      documentJson: JSON.stringify(document),
      sourceHash: record.hash })
  }
}
async function example(): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 1000
  const context = canvas.getContext('2d')!
  context.fillStyle = '#e9e6df'
  context.fillRect(0, 0, 1600, 1000)
  context.fillStyle = '#fff'
  context.fillRect(160, 130, 1280, 740)
  context.fillStyle = '#242a30'
  context.font = 'bold 58px sans-serif'
  context.fillText('Your next great idea', 240, 280)
  context.font = '30px sans-serif'
  context.fillText('Make it clear with Cute Screen', 240, 350)
  for (let i = 0; i < 3; i++) {
    context.fillStyle = ['#b8d9c8', '#e5c2a5', '#bacde0'][i]!
    context.fillRect(240 + i * 360, 440, 320, 300)
  }
  const blob = await new Promise<Blob>((resolve,
    reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Example unavailable')),
    'image/png'))
  await replace(blob, false)
  const label = createTextLayer({ id: crypto.randomUUID(), text: text('Попробуйте изменить эту подпись', 'Try editing this label'), origin: { x: 780, y: 200 }, fontSize: 30 })
  const arrow = createDrawingLayer({ id: crypto.randomUUID(), tool: 'arrow', start: { x: 1100, y: 300 }, end: { x: 1100, y: 440 } })
  if (session.value) {
    const document = session.value.snapshot.core.document
    const layers = [...document.layers, ...(label ? [label] : []), ...(arrow ? [arrow] : [])]
    const annotated = { ...document, layers }
    await mount({
      documentId: document.id, revision: 0, documentJson: JSON.stringify(annotated),
      sourceHash: document.source.blobHash,
    })
  }
}
async function png(): Promise<Blob> {
  await shell.value?.prepareNavigation()
  await hosts.value?.waitForRender?.()
  if (!hosts.value?.exportPng) throw new Error('Renderer is not ready')
  const current = session.value?.snapshot.core.document
  if (!current) throw new Error('No document')
  const size = resolveCompositionLayout(current)
  if (
    size.width > 8192 ||
    size.height > 8192 ||
    size.width * size.height > 16_000_000
  ) {
    throw new Error(text('Уменьшите размер холста в оформлении: экспорт ограничен 16 Мп.', 'Reduce canvas size in Appearance: export is limited to 16 MP.'))
  }
  const bytes = await hosts.value.exportPng()
  return new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' })
}
async function download(): Promise<void> {
  const url = URL.createObjectURL(await png())
  const link = document.createElement('a')
  link.href = url
  link.download = `cute-screen-${Date.now()}.png`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
const actions: ShellActionAdapter = { run: async (action) => {
  if (action === 'openImage') {
    const file = await pickImage()
    if (file) await replace(file)
    return ''
  }
  if (action === 'export') {
    await download()
    return text('PNG скачан', 'PNG downloaded')
  }
  if (action === 'copy') {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })])
    return text('Скопировано', 'Copied')
  }
  throw new Error('Unavailable in web demo')
} }
async function paste(): Promise<void> {
  const snapshotPromise = images.readClipboardSnapshot()
  await shell.value?.prepareNavigation()
  const snapshot = await snapshotPromise
  if (!snapshot.bitmap) throw new Error(text('В буфере нет изображения', 'No image in clipboard'))
  images.clipboardFile = (await images.record(snapshot.bitmap.blobHash)).blob
  await shell.value?.pasteImage()
}
function onClipboardKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') return
  if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable]')) return
  // Let the browser deliver its native paste event instead of requesting permission on keydown.
  event.stopImmediatePropagation()
}
function onPaste(event: ClipboardEvent): void {
  if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable]')) return
  const file = Array.from(event.clipboardData?.files ?? [])[0]
  if (!file) return
  event.preventDefault()
  images.clipboardFile = file
  void guard(paste)
}
function onDrop(event: DragEvent): void {
  event.preventDefault()
  const files = event.dataTransfer?.files
  if (files?.length !== 1) {
    message.value = text('Перетащите одно изображение', 'Drop one image')
    return
  }
  images.clipboardFile = files[0]
  void guard(paste)
}
function onDragOver(event: DragEvent): void {
  event.preventDefault()
}
async function share(): Promise<void> {
  const file = new File([await png()], 'cute-screen.png', { type: 'image/png' })
  if (!navigator.canShare?.({ files: [file] })) {
    await download()
    return
  }
  try {
    await navigator.share({ files: [file] })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
  }
}
function viewport(): void {
  document.documentElement.style.setProperty('--demo-height',
    `${window.visualViewport?.height ?? window.innerHeight}px`)
}
onMounted(() => {
  const locale = new URLSearchParams(location.search).get('lang')
  if (locale === 'ru' || locale === 'en') {
    const preferences = createBrowserPreferencesStorage(localStorage, navigator.languages)
    preferences.save({ schemaVersion: 1, theme: 'system', ...preferences.load(), locale })
    store.setLocale(locale)
  }
  document.addEventListener('keydown', onClipboardKeydown, true)
  document.addEventListener('paste', onPaste)
  document.addEventListener('drop', onDrop)
  document.addEventListener('dragover', onDragOver)
  window.visualViewport?.addEventListener('resize', viewport)
  viewport()
  void guard(async () => {
    let work: SavedWork | undefined
    try {
      releaseStorage = await holdDemoStorage(storage)
      if (disposed) {
        releaseStorage()
        return
      }
      work = await storage.get<SavedWork>('work', 'last')
      expected = work?.revision
    } catch (error) {
      message.value = String(error)
    }
    if (work) await mount(work)
    else await example()
  }).finally(() => {
    busy.value = false
  })
})
onBeforeUnmount(() => {
  finishReplacement('cancel')
  releaseStorage?.()
  stopResponsiveTools?.()
  stopGestures?.()
  disposed = true
  stopSession?.()
  session.value?.dispose()
  document.removeEventListener('keydown', onClipboardKeydown, true)
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('drop', onDrop)
  document.removeEventListener('dragover', onDragOver)
  window.visualViewport?.removeEventListener('resize', viewport)
})
</script>

<template>
  <main class="demo-app" :class="{ 'demo-more-tools': moreTools, 'demo-light': store.resolvedTheme === 'light' }">
    <dialog
      ref="replacementDialog"
      class="demo-confirm"
      role="dialog"
      aria-modal="true"
      :aria-label="text('Заменить работу?', 'Replace work?')"
      @cancel.prevent="finishReplacement('cancel')"
    >
      <p>{{ text('Перед открытием нового изображения можно скачать текущий результат.', 'You can download your current result before opening another image.') }}</p>
      <button @click="finishReplacement('download')">{{ text('Скачать и заменить', 'Download and replace') }}</button>
      <button @click="finishReplacement('replace')">{{ text('Заменить', 'Replace') }}</button>
      <button autofocus @click="finishReplacement('cancel')">{{ text('Отмена', 'Cancel') }}</button>
    </dialog>
    <nav class="demo-nav" :aria-label="text('Меню демо', 'Demo menu')">
      <a :href="ru ? '../' : '../en/'" aria-label="Cute Screen">
        <img
          src="../assets/logo.svg"
          width="24"
          height="24"
          alt=""
        />
        <span>Cute Screen</span>
      </a>
      <button
        class="demo-open"
        :disabled="busy"
        :aria-label="text('Открыть изображение', 'Open image')"
        :title="text('Открыть изображение', 'Open image')"
        @click="guard(async () => { const file = await pickImage(); if (file) await replace(file) })"
      >
        <UiIcon name="image" />
        <span>{{ text('Открыть', 'Open') }}</span>
      </button>
      <button :disabled="busy" @click="guard(paste)">{{ text('Вставить', 'Paste') }}</button>
      <button
        :disabled="busy"
        :aria-label="text('Скачать PNG', 'Download PNG')"
        @click="guard(download)"
      >
        PNG <span aria-hidden="true">↓</span>
      </button>
      <button :aria-expanded="menu" @click="menu = !menu">{{ text('Меню', 'Menu') }}</button>
    </nav>
    <div v-if="menu" class="demo-menu">
      <button @click="shell?.duplicateSelection()">{{ text('Дублировать выделение', 'Duplicate selection') }}</button>
      <button @click="shell?.deleteSelection()">{{ text('Удалить выделение', 'Delete selection') }}</button>
      <button @click="store.selectLayers(session?.snapshot.core.document.layers.filter(layer => !layer.locked).map(layer => layer.id) ?? [])">{{ text('Выделить все объекты', 'Select all objects') }}</button>
      <button @click="guard(async () => { if (!changed || confirm(text('Заменить текущую работу примером?', 'Replace your work with the example?'))) await example() })">{{ text('Открыть пример', 'Open example') }}</button>
      <button @click="guard(share)">{{ text('Поделиться PNG', 'Share PNG') }}</button>
      <button @click="guard(async () => { await storage.clear('work'); expected = undefined; message = text('Последняя работа удалена из браузера', 'Saved work cleared') })">{{ text('Удалить сохранённую работу', 'Clear saved work') }}</button>
      <button @click="guard(async () => { if (confirm(text('Удалить материалы?', 'Delete saved materials?'))) await storage.clear('materials') })">{{ text('Очистить материалы', 'Clear materials') }}</button>
      <a :href="ru ? '../#downloads' : '../en/#downloads'">{{ text('Скачать приложение', 'Get desktop app') }}</a>
      <p>{{ text('Изображения обрабатываются на устройстве. Последняя работа сохраняется в этом браузере.', 'Images stay on your device. Your latest work is saved in this browser.') }}</p>
    </div>
    <p
      v-if="message"
      role="alert"
      class="demo-message"
    >
      {{ message }} <button @click="message = ''">×</button>
    </p>
    <p v-if="busy" role="status">{{ text('Загрузка редактора…', 'Loading editor…') }}</p>
    <Teleport v-if="toolRail" :to="toolRail">
      <button
        class="demo-more"
        :class="{ 'is-expanded': moreTools }"
        :aria-expanded="moreTools"
        :aria-label="moreTools ? text('Свернуть инструменты', 'Collapse tools') : text('Все инструменты', 'All tools')"
        :title="moreTools ? text('Свернуть инструменты', 'Collapse tools') : text('Все инструменты', 'All tools')"
        @click="moreTools = !moreTools"
      >
        <UiIcon :name="moreTools ? 'close' : 'more'" />
      </button>
    </Teleport>
    <EditorShell
      v-if="session && source"
      ref="shell"
      :document-session="session"
      :source-image="source"
      :initial-document-state="{ kind: 'ready', title: 'Cute Screen', dimensions: `${source.naturalWidth} × ${source.naturalHeight}` }"
      :actions="actions"
      :capture-available="false"
      :open-image-available="true"
      :texture-bridge="images"
      :content-image-bridge="images"
      :clipboard-bridge="images"
      :material-bridge="materials"
      @hosts-ready="onHosts"
    />
  </main>
</template>
