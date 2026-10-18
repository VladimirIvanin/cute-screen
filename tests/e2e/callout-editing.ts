import { selectionDocument } from './selection-interactions'
import { exerciseCalloutRevision } from './callout-revision'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { waitForStableCanvas } from './canvas-ready'
import { setNumericInput } from './numeric-input'
import {
  versionToken,
} from './specs/browser-v7-rich-text-test-kit'

type Point = { x: number; y: number }
type CalloutInputTrust = { keydown: boolean[]; contextmenu: boolean[]; pointer: boolean[] }
type Payload = {
  target: Point
  label: Point
  route: { path: string; points?: Point[] }
  attachment: string
  frame: { kind: string }
  labelMarker: string
  targetMarker: string
}
async function drag(
  start: Point,
  end: Point,
): Promise<void> {
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(start.x),
    y: Math.round(start.y) }).down({ button: 'left' }).move({ origin: 'viewport', x: Math.round(end.x),
    y: Math.round(end.y), duration: 200 }).up({ button: 'left' }).perform()
}
async function last() {
  return (await selectionDocument()).layers.filter((layer) => layer.kind === 'callout').at(-1)!
}
async function cancelTargetDrag(layer: Awaited<ReturnType<typeof last>>): Promise<void> {
  const target = await screen(world(layer, 'target'))
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(target.x), y: Math.round(target.y) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(target.x + 50), y: Math.round(target.y + 30), duration: 200 })
    .perform(true)
  await browser.keys('Escape')
  await browser.action('pointer').up({ button: 'left' }).perform()
  expect(await last()).toEqual(layer)
}
async function screen(point: Point): Promise<Point> {
  const document = await selectionDocument()
  return browser.execute(({ p, doc }) => {
    const canvas = window.document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const r = canvas.getBoundingClientRect()
    const full = { x: 0, y: 0, ...doc.canvas }
    const output = window.document.querySelector('.cs-quick-actions') ? full : doc.crop ?? full
    return {
      x: r.left + (p.x - output.x) * r.width / output.width,
      y: r.top + (p.y - output.y) * r.height / output.height,
    }
  }, { p: point, doc: document })
}
function world(
  layer: Awaited<ReturnType<typeof last>>,
  key: 'target' | 'label',
): Point {
  const p = (layer.payload as unknown as Payload)[key]
  return { x: layer.transform.translateX + p.x, y: layer.transform.translateY + p.y }
}
async function exerciseCalloutWidth(artifacts: string): Promise<void> {
  const editor = $('[aria-label="Callout editor"]')
  const widthTrigger = $('.cs-callout-width-control > button')
  await expect(widthTrigger).toHaveText(expect.stringContaining('Fit text'))
  await expect($('.cs-callout-width-popover')).not.toExist()
  await widthTrigger.click()
  const widthPanel = $('.cs-callout-width-popover')
  await expect(widthPanel).toBeDisplayed()
  await expect(widthPanel.$('button')).toHaveAttribute('aria-pressed', 'true')
  await browser.saveScreenshot(path.resolve(artifacts, 'callout-width-auto.png'))
  const widthInput = widthPanel.$('input')
  await setNumericInput(widthInput, '300')
  await browser.keys('Enter')
  await expect(widthTrigger).toHaveText(expect.stringContaining('300 px'))
  await setNumericInput(widthInput, '720')
  await browser.keys('Escape')
  await expect(widthPanel).not.toExist()
  await expect(editor).toBeDisplayed()
  await expect(widthTrigger).toBeFocused()
  await expect(widthTrigger).toHaveText(expect.stringContaining('300 px'))
  await widthTrigger.click()
  await widthPanel.$('button').click()
  await expect(widthTrigger).toHaveText(expect.stringContaining('Fit text'))
  await browser.keys('Escape')
  await editor.click()
}
export async function exerciseCalloutEditing(
  artifacts: string,
  native = false,
): Promise<void> {
  if (!native) await browser.setWindowSize(1440, 900)
  if (native) await browser.execute(() => {
    const state = window as typeof window & { __calloutInputTrust?: CalloutInputTrust }
    state.__calloutInputTrust = { keydown: [], contextmenu: [], pointer: [] }
    document.addEventListener('keydown', (event) => state.__calloutInputTrust!.keydown.push(event.isTrusted), true)
    document.addEventListener('contextmenu', (event) => state.__calloutInputTrust!.contextmenu.push(event.isTrusted), true)
    document.addEventListener('pointerdown', (event) => state.__calloutInputTrust!.pointer.push(event.isTrusted), true)
    document.addEventListener('pointerup', (event) => state.__calloutInputTrust!.pointer.push(event.isTrusted), true)
  })
  await $('button[aria-label="Callout"]').click()
  await waitForStableCanvas()
  const doc = await selectionDocument()
  const area = doc.crop ?? { x: 0, y: 0, ...doc.canvas }
  const start = await screen({ x: area.x + area.width * .25, y: area.y + area.height * .65 })
  const end = await screen({ x: area.x + area.width * .65, y: area.y + area.height * .30 })
  await drag(start, end)
  const editor = $('[aria-label="Callout editor"]')
  await expect(editor).toBeDisplayed()
  await browser.keys('Product title\nПояснение')
  await exerciseCalloutWidth(artifacts)
  const editorRect = await browser.execute(() => {
    const r = document.querySelector<HTMLElement>('[aria-label="Callout editor"]')!.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  await browser.keys(['Control', 'Enter'])
  await expect(editor).not.toExist()
  const created = await last()
  expect(created.payload).toMatchObject({ route: { path: 'corner' }, labelMarker: 'none', frame: { kind: 'card' } })
  await expect($('.cs-callout-toolbar')).toBeDisplayed()
  const token = native ? 0 : await versionToken()
  await cancelTargetDrag(created)
  await drag({ x: editorRect.x + editorRect.width / 2, y: editorRect.y + 12 },
    { x: editorRect.x + editorRect.width / 2 - 140, y: editorRect.y + 80 })
  const moved = await last()
  expect(world(moved, 'target')).toEqual(world(created, 'target'))
  expect(world(moved, 'label')).not.toEqual(world(created, 'label'))
  if (!native) expect(await versionToken()).toBe(token + 1)
  await browser.keys(['Control', 'z'])
  expect(await last()).toEqual(created)
  await browser.keys(['Control', 'Shift', 'z'])
  expect(await last()).toEqual(moved)
  await $('button[aria-label="Route"]').click()
  await $('.cs-callout-popover').$('button=Add step').click()
  const p = moved.payload as unknown as Payload
  const a = await screen(world(moved, 'target')), b = await screen({ x: world(moved, 'target').x,
    y: world(moved, 'label').y })
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  await drag(mid, { x: mid.x + 45, y: mid.y })
  const stepped = await last()
  expect((stepped.payload as unknown as Payload).route.path).toBe('orthogonal')
  expect(world(stepped, 'target')).toEqual(world(moved, 'target'))
  expect(world(stepped, 'label')).toEqual(world(moved, 'label'))
  expect((stepped.payload as unknown as Payload).attachment).toBe(p.attachment)
  await $('button[aria-label="Endpoints"]').click()
  await $('.cs-callout-endpoint').$('button[aria-label="Ring"]').click()
  await browser.keys('Escape')
  expect((await last()).payload.targetMarker).toBe('ring')
  await $('button[aria-label="Label"]').click()
  await $('.cs-callout-popover').$('button=Plain text').click()
  await browser.keys('Escape')
  expect((await last()).payload.frame).toMatchObject({ kind: 'text' })
  await browser.waitUntil(async () => !await $('.cs-callout-popover').isExisting())
  await browser.saveScreenshot(path.resolve(artifacts, 'callout-editing.png'))
  await $('button[aria-label="Route"]').click()
  await $('.cs-callout-popover').$('button=Reset route').click()
  await browser.keys('Escape')
  expect((await last()).payload.route).toMatchObject({ path: 'corner' })
  await browser.keys(['Control', 'z'])
  expect((await last()).payload.route).toMatchObject({ path: 'orthogonal' })
  const target = await screen(world(await last(), 'target'))
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(target.x), y: Math.round(target.y) }).down({ button: 'left' }).up({ button: 'left' }).perform()
  await expect($('.cs-callout-toolbar')).toBeDisplayed()
  await $('button[aria-label="Label"]').click()
  await $('.cs-callout-popover').$('button=Card').click()
  await browser.keys('Escape')
  await browser.waitUntil(async () => !await $('.cs-callout-popover').isExisting())
  await browser.saveScreenshot(path.resolve(artifacts, 'callout-card.png'))
  await exerciseCalloutRevision(artifacts, { last, screen, world, drag })
  if (native) {
    await browser.action('pointer').move({ origin: 'viewport', x: Math.round(target.x), y: Math.round(target.y) })
      .down({ button: 'right' }).up({ button: 'right' }).perform()
    await expect($('.cs-canvas-context-menu').$('button=Add step')).toBeDisplayed()
    await browser.keys('Escape')
    const trust = await browser.execute(() => {
      const state = window as typeof window & {
        __calloutInputTrust: CalloutInputTrust
      }
      return state.__calloutInputTrust
    })
    expect(trust.keydown.length).toBeGreaterThan(0)
    expect(trust.contextmenu.length).toBeGreaterThan(0)
    expect(trust.pointer.length).toBeGreaterThan(0)
    expect([...trust.keydown, ...trust.contextmenu, ...trust.pointer].every(Boolean)).toBe(true)
    await writeFile(path.resolve(artifacts, 'callout-input-trust.json'), JSON.stringify(trust, null, 2))
  }
}
