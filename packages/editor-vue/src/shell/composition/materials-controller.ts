import {
  onBeforeUnmount,
  shallowRef,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue'
import {
  parseComposition,
  compositionPreset,
  createComposition,
  resolveBrandingYear,
  type CompositionSettings,
  type CardImage,
} from '@cute-screen/editor-renderer'
import { describeError } from '../../document-session'
import type { MaterialRecord } from '../../materials'
import type { ResolvedEditorShellProps } from '../contracts'
import type { createWorkspaceState } from '../workspace/workspace-state'
interface MaterialContext {
  props: ResolvedEditorShellProps
  workspace: ReturnType<typeof createWorkspaceState>
  settings: ComputedRef<CompositionSettings | undefined>
  selectedBrand: Ref<string | undefined>
  disabled: ComputedRef<boolean>
  pending: Ref<boolean>
  commit: (value: CompositionSettings) => void
  t: (ru: string, en: string) => string
}
export function useCompositionMaterials(context: MaterialContext) {
  const { props, workspace, settings, selectedBrand, disabled, pending, commit, t } = context
  const materials = shallowRef<readonly MaterialRecord[]>([])
  const error = ref('')
  let generation = 0, disposed = false
  async function load(): Promise<void> {
    if (!props.materialBridge) return
    const current = ++generation
    try {
      const list = await props.materialBridge.list()
      if (!disposed && current === generation) materials.value = list
    } catch (e) {
      if (!disposed) error.value = describeError(e, t('Не удалось загрузить материалы', 'Could not load materials'))
    }
  }
  async function perform(action: () => Promise<void>): Promise<void> {
    if (pending.value || disabled.value) return
    pending.value = true
    error.value = ''
    try {
      await action()
    } catch (e) {
      error.value = describeError(e, t('Не удалось сохранить материал', 'Could not save material'))
    } finally {
      pending.value = false
    }
  }
  async function saveMaterial(
    kind: MaterialRecord['kind'],
    title: string,
  ): Promise<void> {
    const value = settings.value
    if (
      !value ||
      !props.materialBridge ||
      !title.trim()
    ) return
    await perform(async () => {
      await props.materialBridge!.put({ id: crypto.randomUUID(), title: title.trim(), kind,
        valueJson: JSON.stringify(kind === 'preset' ? compositionPreset(value) : value.background) })
      await load()
    })
  }
  async function removeMaterial(id: string): Promise<void> {
    await perform(async () => {
      await props.materialBridge?.remove(id)
      await load()
    })
  }
  function applyMaterial(record: MaterialRecord): void {
    try {
      const current = settings.value ?? createComposition()
      const next = materialValue(record, current, selectedBrand.value)
      commit(parseComposition(next))
    } catch (e) {
      error.value = describeError(e, t('Материал повреждён', 'Material is invalid'))
    }
  }
  async function importImage(
    kind: 'background' | 'logo',
    target: 'background' | 'header' | 'footer' = 'background',
  ): Promise<void> {
    if (!props.textureBridge || !props.materialBridge) return
    let image: CardImage | undefined
    const documentId = workspace.activeDocument.value?.id
    await perform(async () => {
      const result = kind === 'logo' && props.contentImageBridge
        ? await props.contentImageBridge.importContentImage(crypto.randomUUID())
        : await props.textureBridge!.importTexture(crypto.randomUUID())
      if (result.kind === 'cancelled') return
      const imported: CardImage = {
        blobHash: result.blobHash,
        width: result.width,
        height: result.height,
        format: result.format,
      }
      await props.materialBridge!.put({ id: crypto.randomUUID(), title: kind === 'logo'
        ? t('Мой логотип', 'My logo')
        : t('Мой фон', 'My background'),
      kind, valueJson: JSON.stringify(imported) })
      image = imported
      await load()
    })
    if (
      !image ||
      disposed ||
      workspace.activeDocument.value?.id !== documentId
    ) return
    const current = settings.value ?? createComposition()
    if (kind === 'background') {
      const bg = target === 'background' ? current.background : current[target].fill
      const fill = { ...bg, kind: 'image' as const, image }
      commit(target === 'background' ? { ...current, background: fill } : { ...current, [target]: { ...current[target], fill } })
    } else if (selectedBrand.value) commit(withLogo(current, selectedBrand.value, image))
  }
  onBeforeUnmount(() => {
    disposed = true
    generation++
  })
  return { materials, error, load, saveMaterial, removeMaterial, applyMaterial, importImage }
}

function withLogo(
  current: CompositionSettings,
  id: string,
  image: CardImage,
): CompositionSettings {
  return { ...current, branding: current.branding.map((block) => block.id === id ? { ...block, image } : block) }
}

function materialValue(
  record: MaterialRecord,
  current: CompositionSettings,
  selected: string | undefined,
): CompositionSettings {
  const value: unknown = JSON.parse(record.valueJson)
  if (record.kind === 'preset') {
    const preset = parseComposition(value)
    return { ...preset, frame: { ...preset.frame, title: current.frame.title, url: current.frame.url },
      branding: preset.branding.map((block) => resolveBrandingYear(block, new Date().getFullYear())) }
  }
  if (record.kind === 'gradient') return { ...current, background: value as CompositionSettings['background'] }
  if (record.kind === 'background') return { ...current, background: { ...current.background, kind: 'image', image: value as CardImage } }
  return selected ? withLogo(current, selected, value as CardImage) : current
}
