import type { ShellStoreState } from './store-state'

export function createSelectionActions(state: ShellStoreState) {
  function selectTool(id: string): void {
    state.activeToolId.value = id
  }
  function selectLayer(id: string, toggle = false, range = false): void {
    const anchor = state.selectedLayerId.value
    const anchorIndex = anchor
      ? state.layers.value.findIndex((layer) => layer.id === anchor)
      : -1
    const targetIndex = state.layers.value.findIndex((layer) => layer.id === id)
    const selected =
      range && anchorIndex >= 0 && targetIndex >= 0
        ? state.layers.value
            .slice(
              Math.min(anchorIndex, targetIndex),
              Math.max(anchorIndex, targetIndex) + 1,
            )
            .map((layer) => layer.id)
        : toggle
          ? state.selectedLayerIds.value.includes(id)
            ? state.selectedLayerIds.value.filter((value) => value !== id)
            : [...state.selectedLayerIds.value, id]
          : [id]
    state.selectedLayerIds.value = selected
    state.selectedLayerId.value = range && anchor ? anchor : selected[0]
  }
  function clearLayerSelection(): void {
    state.selectedLayerId.value = undefined
    state.selectedLayerIds.value = []
  }
  return { clearLayerSelection, selectLayer, selectTool }
}

export function createViewportActions(state: ShellStoreState) {
  function rememberActiveFrame(): void {
    if (!state.activeFrameId.value) return
    state.frameViewports.set(state.activeFrameId.value, {
      zoom: state.zoom.value,
      mode: state.zoomMode.value,
    })
  }
  function selectFrame(id: string): void {
    rememberActiveFrame()
    state.activeFrameId.value = id
    const preserved = state.frameViewports.get(id)
    if (!preserved) return
    state.zoom.value = preserved.zoom
    state.zoomMode.value = preserved.mode
  }
  function setZoomState(value: number, mode: 'fit' | 'custom'): void {
    state.zoom.value = Math.max(10, Math.min(1600, value))
    state.zoomMode.value = mode
    rememberActiveFrame()
  }
  function setZoom(value: number): void {
    setZoomState(value, 'custom')
  }
  function setFitZoom(value: number): void {
    setZoomState(value, 'fit')
  }
  function enableFit(): void {
    state.zoomMode.value = 'fit'
    rememberActiveFrame()
  }
  return { enableFit, selectFrame, setFitZoom, setZoom }
}
