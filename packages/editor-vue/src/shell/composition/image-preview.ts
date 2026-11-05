import type {
  InjectionKey,
  Ref,
} from 'vue'
import type { TextureFillBridge } from '../../texture-fill'

export const compositionImagesKey: InjectionKey<{
  images: Readonly<Ref<ReadonlyMap<string, HTMLImageElement>>>
  error: Readonly<Ref<string | undefined>>
  bridge?: () => TextureFillBridge | undefined
}> = Symbol('composition-images')
