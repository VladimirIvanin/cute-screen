import { fireEvent, screen } from '@testing-library/vue'
import type { RenderResult } from '@testing-library/vue'

export async function selectLayerFromPanel(
  view: RenderResult,
  options: { activateSelect?: boolean } = {},
): Promise<void> {
  if (options.activateSelect !== false) {
    await fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  }
  await fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
  const layerSelect = view.container.querySelector(
    '.cs-layer-select',
  ) as HTMLElement | null
  if (!layerSelect) throw new Error('layer row missing')
  layerSelect.focus()
  await fireEvent.keyDown(layerSelect, { key: 'Enter' })
}
