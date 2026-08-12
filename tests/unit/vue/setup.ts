import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/vue'
import { afterEach, beforeEach, vi } from 'vitest'

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })),
  })
}

if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = () => undefined
}

beforeEach(() => {
  if (!document.querySelector('.cs-overlay-root')) {
    const overlayRoot = document.createElement('div')
    overlayRoot.className = 'cs-overlay-root'
    document.body.append(overlayRoot)
  }
})

afterEach(() => {
  cleanup()
})
