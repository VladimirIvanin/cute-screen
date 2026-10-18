import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import {
  calloutPathPoints,
  type CalloutLayer,
} from '../../packages/editor-core/src'
import { selectionDocument } from './selection-interactions'

type Point = { x: number; y: number }
export interface CalloutRevisionKit {
  last(): Promise<CalloutLayer>
  screen(point: Point): Promise<Point>
  world(layer: CalloutLayer, endpoint: 'target' | 'label'): Point
  drag(start: Point, end: Point): Promise<void>
}
const at = (p: Point) => ({ origin: 'viewport' as const, x: Math.round(p.x), y: Math.round(p.y) })

async function altRemoval(
  kit: CalloutRevisionKit,
  artifacts: string,
): Promise<void> {
  const before = await kit.last()
  const points = calloutPathPoints(before.payload)
  const a = points[1]!, b = points[2]!
  const position = await kit.screen({ x: before.transform.translateX + (a.x + b.x) / 2,
    y: before.transform.translateY + (a.y + b.y) / 2 })
  for (const cancel of ['escape', 'release', 'drag', 'none'] as const) {
    await browser.action('key', { id: 'callout-modifier' }).down(Key.Alt).perform(true)
    await browser.action('pointer', { id: 'callout-pointer' }).move(at(position)).perform(true)
    if (cancel === 'none') await browser.saveScreenshot(path.resolve(artifacts, 'callout-remove-step-preview.png'))
    await browser.action('pointer', { id: 'callout-pointer' }).down({ button: 'left' }).perform(true)
    expect(await kit.last()).toEqual(before)
    if (cancel === 'escape') await browser.keys(Key.Escape)
    if (cancel === 'release') await browser.action('key', { id: 'callout-modifier' }).up(Key.Alt).perform(true)
    if (cancel === 'drag') await browser.action('pointer', { id: 'callout-pointer' }).move(at({ x: position.x + 16, y: position.y + 12 })).perform(true)
    await browser.action('pointer', { id: 'callout-pointer' }).up({ button: 'left' }).perform(true)
    await browser.action('key', { id: 'callout-modifier' }).up(Key.Alt).perform()
    if (cancel !== 'none') {
      expect(await kit.last()).toEqual(before)
      await expect($('.cs-callout-toolbar')).toBeDisplayed()
      continue
    }
    const removed = await kit.last()
    expect(calloutPathPoints(removed.payload).length).toBe(points.length - 2)
    expect(kit.world(removed, 'target')).toEqual(kit.world(before, 'target'))
    expect(kit.world(removed, 'label')).toEqual(kit.world(before, 'label'))
    await browser.keys([Key.Control, 'z'])
    expect(await kit.last()).toEqual(before)
    await browser.keys([Key.Control, Key.Shift, 'z'])
    expect(await kit.last()).toEqual(removed)
    await browser.keys([Key.Control, 'z'])
  }
}

async function bendLine(
  kit: CalloutRevisionKit,
  artifacts: string,
): Promise<void> {
  const before = await kit.last()
  await $('button[aria-label="Route"]').click()
  await $('.cs-callout-popover').$('button=Line').click()
  await browser.keys(Key.Escape)
  const line = await kit.last()
  expect(line.payload.route.path).toBe('straight')
  const target = kit.world(line, 'target'), label = kit.world(line, 'label')
  const midpoint = await kit.screen({ x: (target.x + label.x) / 2, y: (target.y + label.y) / 2 })
  await kit.drag(midpoint, { x: midpoint.x + 65, y: midpoint.y - 70 })
  const curved = await kit.last()
  expect(curved.payload.route.path).toBe('quadratic')
  expect(kit.world(curved, 'target')).toEqual(kit.world(before, 'target'))
  expect(kit.world(curved, 'label')).toEqual(kit.world(before, 'label'))
  await browser.saveScreenshot(path.resolve(artifacts, 'callout-curved.png'))
  await $('button[aria-label="Route"]').click()
  await browser.saveScreenshot(path.resolve(artifacts, 'callout-route-controls.png'))
  await $('.cs-callout-popover').$('button=Straighten').click()
  await browser.keys(Key.Escape)
  expect((await kit.last()).payload.route.path).toBe('straight')
  await browser.keys([Key.Control, 'z'])
  expect(await kit.last()).toEqual(curved)
  await browser.keys([Key.Control, 'z'])
  expect(await kit.last()).toEqual(line)
  await browser.keys([Key.Control, 'z'])
  expect(await kit.last()).toEqual(before)
}

async function emptyLabel(
  kit: CalloutRevisionKit,
  artifacts: string,
): Promise<void> {
  const before = await kit.last()
  const count = (await selectionDocument()).layers.length
  const target = await kit.screen(kit.world(before, 'target'))
  await $('button[aria-label="Callout"]').click()
  await kit.drag({ x: target.x + 100, y: target.y + 25 }, { x: target.x + 245, y: target.y - 45 })
  const editor = '[aria-label="Callout editor"]'
  await expect($(editor)).toBeDisplayed()
  await browser.keys([Key.Control, Key.Enter])
  await expect($(editor)).not.toExist()
  const empty = await kit.last()
  expect((await selectionDocument()).layers.length).toBe(count + 1)
  expect(empty.payload.content).toMatchObject({ text: '', spans: [], paragraphs: [] })
  const points = calloutPathPoints(empty.payload)
  const a = points[0]!, b = points[1]!
  const p = await kit.screen({ x: empty.transform.translateX + (a.x + b.x) / 2,
    y: empty.transform.translateY + (a.y + b.y) / 2 })
  await browser.action('pointer').move(at(p)).down({ button: 'left' }).up({ button: 'left' })
    .down({ button: 'left' }).up({ button: 'left' }).perform()
  const editorState = await browser.execute(() => {
    const element = document.querySelector<HTMLElement>('[aria-label="Callout editor"]')
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top,
      display: getComputedStyle(element).display, visibility: getComputedStyle(element).visibility,
      focus: document.activeElement === element }
  })
  await writeFile(path.resolve(artifacts, 'callout-empty-editor.json'), JSON.stringify(editorState, null, 2))
  await expect($(editor)).toBeDisplayed()
  await browser.keys('Temporary caption')
  await browser.keys([Key.Control, Key.Enter])
  expect((await kit.last()).payload.content.text).toBe('Temporary caption')
  await browser.action('pointer').move(at(p)).down({ button: 'left' }).up({ button: 'left' })
    .down({ button: 'left' }).up({ button: 'left' }).perform()
  await expect($(editor)).toBeDisplayed()
  await browser.keys([Key.Control, 'a'])
  await browser.keys(Key.Backspace)
  await browser.keys([Key.Control, Key.Enter])
  expect((await kit.last()).payload.content.text).toBe('')
  expect((await selectionDocument()).layers.length).toBe(count + 1)
  await browser.keys([Key.Control, 'z'])
  expect((await kit.last()).payload.content.text).toBe('Temporary caption')
  await browser.keys([Key.Control, 'z'])
  expect(await kit.last()).toEqual(empty)
  await browser.saveScreenshot(path.resolve(artifacts, 'callout-empty.png'))
  await browser.keys([Key.Control, 'z'])
  expect((await selectionDocument()).layers.length).toBe(count)
  await browser.action('pointer').move(at(target)).down({ button: 'left' }).up({ button: 'left' }).perform()
}

export async function exerciseCalloutRevision(
  artifacts: string,
  kit: CalloutRevisionKit,
): Promise<void> {
  await $('button[aria-label="Endpoints"]').click()
  await browser.saveScreenshot(path.resolve(artifacts, 'callout-endpoints-controls.png'))
  await browser.keys(Key.Escape)
  await $('.cs-callout-toolbar button[aria-label="Line"]').click()
  await browser.saveScreenshot(path.resolve(artifacts, 'callout-line-controls.png'))
  await browser.keys(Key.Escape)
  await altRemoval(kit, artifacts)
  console.info('Callout revision: indexed Alt removal and cancellation passed')
  await bendLine(kit, artifacts)
  console.info('Callout revision: bend and straighten history passed')
  await emptyLabel(kit, artifacts)
  console.info('Callout revision: empty caption and re-editing passed')
}
