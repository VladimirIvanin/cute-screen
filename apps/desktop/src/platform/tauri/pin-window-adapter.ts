import { getCurrentWindow } from '@tauri-apps/api/window'

export const closeCurrentPinWindow = () => getCurrentWindow().close()
export const startPinDrag = () => getCurrentWindow().startDragging()
export const startPinResize = () =>
  getCurrentWindow().startResizeDragging('SouthEast')
