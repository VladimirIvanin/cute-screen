import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import { openDrawingHarness } from './browser-m06-test-kit'

async function modifiedWheel(selector: string): Promise<void> {
  await browser.execute(() => {
    delete document.documentElement.dataset.zoomWheelTrace
    window.addEventListener('wheel', (event) => {
      document.documentElement.dataset.zoomWheelTrace = JSON.stringify({
        trusted: event.isTrusted,
        ctrl: event.ctrlKey,
        cancelled: event.defaultPrevented,
      })
    }, { once: true })
  })
  await browser.action('key', { id: 'zoom-modifier' }).down(Key.Control).perform(true)
  try {
    await browser.action('wheel').scroll({
      origin: await $(selector).getElement(),
      x: 0,
      y: 0,
      deltaY: -240,
      deltaX: 0,
      duration: 200,
    }).perform(true)
  } finally {
    await browser.releaseActions()
  }
  const trace = await browser.execute(() => document.documentElement.dataset.zoomWheelTrace)
  expect(JSON.parse(trace!)).toEqual({ trusted: true, ctrl: true, cancelled: true })
}

async function pageMetrics(selector: string) {
  return browser.execute((target) => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    scale: visualViewport?.scale,
    control: {
      width: document.querySelector(target)!.getBoundingClientRect().width,
      height: document.querySelector(target)!.getBoundingClientRect().height,
    },
  }), selector)
}

async function expectWebKitGesturesCancelled(selector: string): Promise<void> {
  const cancelled = await browser.execute((target) => ['gesturestart', 'gesturechange', 'gestureend'].map((type) => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    document.querySelector(target)!.dispatchEvent(event)
    return event.defaultPrevented
  }), selector)
  expect(cancelled).toEqual([true, true, true])
}

describe('interface zoom isolation', () => {
  it('keeps chrome fixed while modified wheel still zooms the canvas', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    const before = await pageMetrics('.cs-toolrail')
    const zoom = Number(await $('.cs-zoom-controls').getAttribute('data-zoom'))
    await modifiedWheel('.cs-toolrail')
    await expectWebKitGesturesCancelled('.cs-toolrail')
    expect(await pageMetrics('.cs-toolrail')).toEqual(before)
    await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', String(zoom))
    await modifiedWheel('.cs-canvas-scroll')
    await browser.waitUntil(async () => Number(await $('.cs-zoom-controls').getAttribute('data-zoom')) > zoom)
    expect(await pageMetrics('.cs-toolrail')).toEqual(before)
  })

  it('keeps settings fixed and allows ordinary panel scrolling', async () => {
    await browser.url('/?settings=shortcuts&settingsHarness=1')
    await browser.setWindowSize(820, 560)
    await expect($('.cs-shortcut-list')).toBeDisplayed()
    const before = await pageMetrics('.cs-settings-sidebar')
    await modifiedWheel('.cs-settings-sidebar')
    await expectWebKitGesturesCancelled('.cs-settings-sidebar')
    expect(await pageMetrics('.cs-settings-sidebar')).toEqual(before)
    await browser.action('wheel').scroll({
      origin: await $('.cs-settings-scroll').getElement(),
      x: 0,
      y: 0,
      deltaY: 360,
      deltaX: 0,
      duration: 200,
    }).perform()
    await browser.waitUntil(() => browser.execute(() => document.querySelector('.cs-settings-scroll')!.scrollTop > 0))
    expect(await pageMetrics('.cs-settings-sidebar')).toEqual(before)
  })
})
