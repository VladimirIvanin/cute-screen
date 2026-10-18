interface Offset {
  x: number
  y: number
}

type Phase = 'idle' | 'greeting' | 'tracking' | 'returning'

const ease = (value: number): number => value * value * (3 - 2 * value)
const clamp = (value: number): number => Math.max(-1, Math.min(1, value))

function greeting(elapsed: number): number {
  const times = [0, 420, 1020, 1500]
  const offsets = [0, -1.3, 1.3, 0]
  const index = elapsed < 420 ? 0 : elapsed < 1020 ? 1 : 2
  const progress = Math.min(1, (elapsed - times[index]!) / (times[index + 1]! - times[index]!))
  return offsets[index]! + (offsets[index + 1]! - offsets[index]!) * ease(progress)
}

class BrandEyes {
  private phase: Phase = 'idle'
  private position: Offset = { x: 0, y: 0 }
  private target: Offset = { x: 0, y: 0 }
  private returnFrom: Offset = { x: 0, y: 0 }
  private frame: number | undefined
  private started = 0
  private previous = 0
  private readonly motion: MediaQueryList
  private readonly document: Document
  private readonly view: Window

  constructor(
    private readonly host: HTMLElement,
    private readonly mark: SVGSVGElement,
    private readonly eyes: SVGGElement,
  ) {
    this.document = host.ownerDocument
    this.view = this.document.defaultView!
    this.motion = this.view.matchMedia('(prefers-reduced-motion: reduce)')
    host.addEventListener('pointerenter', this.enter)
    host.addEventListener('pointermove', this.move)
    host.addEventListener('pointerleave', this.leave)
    host.addEventListener('pointercancel', this.reset)
    this.view.addEventListener('blur', this.reset)
    this.view.addEventListener('pagehide', this.reset)
    this.document.addEventListener('visibilitychange', this.visibility)
    if (this.motion.addEventListener) this.motion.addEventListener('change', this.reset)
    else this.motion.addListener(this.reset)
  }

  dispose = (): void => {
    this.reset()
    this.host.removeEventListener('pointerenter', this.enter)
    this.host.removeEventListener('pointermove', this.move)
    this.host.removeEventListener('pointerleave', this.leave)
    this.host.removeEventListener('pointercancel', this.reset)
    this.view.removeEventListener('blur', this.reset)
    this.view.removeEventListener('pagehide', this.reset)
    this.document.removeEventListener('visibilitychange', this.visibility)
    if (this.motion.removeEventListener) this.motion.removeEventListener('change', this.reset)
    else this.motion.removeListener(this.reset)
  }

  private enter = (event: PointerEvent): void => {
    this.reset()
    if (
      event.pointerType !== 'mouse' ||
      this.motion.matches ||
      this.document.hidden
    ) return
    this.phase = 'greeting'
    this.started = this.previous = this.view.performance.now()
    this.updateTarget(event)
    this.schedule()
  }

  private move = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.motion.matches) return
    if (this.phase !== 'greeting' && this.phase !== 'tracking') return
    this.updateTarget(event)
    this.schedule()
  }

  private updateTarget(event: PointerEvent): void {
    const bounds = this.mark.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    this.target = {
      x: 1.5 * clamp((event.clientX - bounds.left - bounds.width / 2) / bounds.width),
      y: 0.8 * clamp((event.clientY - bounds.top - bounds.height / 2) / bounds.height),
    }
  }

  private leave = (): void => {
    if (this.phase === 'idle' || this.phase === 'returning') return
    this.phase = 'returning'
    this.returnFrom = { ...this.position }
    this.started = this.previous = this.view.performance.now()
    this.schedule()
  }

  private visibility = (): void => {
    if (this.document.hidden) this.reset()
  }

  private reset = (): void => {
    if (this.frame !== undefined) this.view.cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.phase = 'idle'
    this.position = { x: 0, y: 0 }
    this.eyes.removeAttribute('transform')
  }

  private schedule(): void {
    if (this.frame !== undefined) return
    // A settled gaze wakes on movement, with no catch-up jump after idle.
    this.previous = this.view.performance.now()
    this.frame = this.view.requestAnimationFrame(this.tick)
  }

  private tick = (timestamp: number): void => {
    this.frame = undefined
    const elapsed = timestamp - this.started
    const delta = Math.min(64, Math.max(0, timestamp - this.previous))
    this.previous = timestamp
    if (this.phase === 'greeting' && elapsed < 1500) {
      this.position = { x: greeting(elapsed), y: 0 }
    } else if (this.phase === 'returning') {
      if (elapsed >= 500) return this.reset()
      const remaining = (1 - elapsed / 500) ** 3
      this.position = { x: this.returnFrom.x * remaining, y: this.returnFrom.y * remaining }
    } else if (this.phase !== 'idle') {
      this.phase = 'tracking'
      const amount = 1 - Math.exp(-delta / 300)
      this.position.x += (this.target.x - this.position.x) * amount
      this.position.y += (this.target.y - this.position.y) * amount
    }
    this.eyes.setAttribute('transform', `translate(${this.position.x.toFixed(4)} ${this.position.y.toFixed(4)})`)
    const settled = Math.hypot(this.target.x - this.position.x, this.target.y - this.position.y) < 0.001
    if (this.phase === 'tracking' && settled) return
    if (this.phase !== 'idle') this.frame = this.view.requestAnimationFrame(this.tick)
  }
}

/** Shared with the static landing; deliberately has no Vue or editor imports. */
export function attachBrandEyes(host: HTMLElement): () => void {
  const mark = host.querySelector<SVGSVGElement>('svg[data-brand-mark]')
  const eyes = mark?.querySelector<SVGGElement>('[data-brand-eyes]')
  if (
    !mark ||
    !eyes ||
    !host.ownerDocument.defaultView
  ) return () => undefined
  return new BrandEyes(host, mark, eyes).dispose
}
