import {
  $,
  browser,
  expect,
} from '@wdio/globals'

describe('public web editor', () => {
  it('mounts the real editor from a clean profile and edits its example', async () => {
    await browser.url('demo/?lang=en')
    await expect($('.cs-editor-shell')).toBeDisplayed()
    await expect($('[data-tool-id="arrow"]')).toBeDisplayed()
    await expect($('.demo-message')).not.toExist()
    await $('[data-tool-id="arrow"]').click()
    await expect($('[data-tool-id="arrow"]')).toHaveAttribute('aria-pressed', 'true')
    const canvas = await browser.$('.cs-canvas-overlay')
    const rect = await canvas.getLocation()
    await browser.performActions([{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', duration: 0, x: Math.round(rect.x + 120), y: Math.round(rect.y + 120) },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', duration: 400, x: Math.round(rect.x + 260), y: Math.round(rect.y + 200) },
      { type: 'pointerUp', button: 0 },
    ] }])
    await browser.releaseActions()
    await browser.waitUntil(async () => browser.execute(async () => {
      return new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('cute-screen-web-demo', 1)
        request.onsuccess = () => {
          const db = request.result
          const get = db.transaction('work').objectStore('work').get('last')
          get.onsuccess = () => {
            resolve(Boolean(get.result))
            db.close()
          }
          get.onerror = () => {
            reject(get.error)
            db.close()
          }
        }
        request.onerror = () => reject(request.error)
      })
    }))
    await browser.refresh()
    await expect($('.cs-editor-shell')).toBeDisplayed()
    await browser.execute(() => {
      const original = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function () {
        if (!this.download) {
          original.call(this)
          return
        }
        void fetch(this.href).then((response) => response.blob()).then(async (blob) => {
          const bitmap = await createImageBitmap(blob)
          document.body.dataset.exportSize = `${bitmap.width}x${bitmap.height}`
          bitmap.close()
        })
      }
    })
    await $('.demo-nav button:nth-of-type(3)').click()
    await browser.waitUntil(async () => (await $('body').getAttribute('data-export-size')) === '1600x1000')
    await browser.setViewport({ width: 390, height: 844, devicePixelRatio: 1 })
    await browser.saveScreenshot('artifacts/landing-e2e/demo-mobile.png')
  })
  it('keeps mobile tools, zoom and More inside separate dock areas', async () => {
    await browser.url('demo/?lang=en')
    await expect($('.cs-editor-shell')).toBeDisplayed()
    const capacities: number[] = []
    for (const width of [360, 390, 600]) {
      await browser.setViewport({ width, height: 844, devicePixelRatio: 1 })
      for (const expanded of [false, true]) {
        const more = $('.demo-more')
        if ((await more.getAttribute('aria-expanded')) !== String(expanded)) await more.click()
        if (!expanded) {
          await browser.waitUntil(async () => browser.execute(() => {
            const rail = document.querySelector<HTMLElement>('.cs-toolrail')!
            return rail.scrollWidth <= rail.clientWidth
          }))
          const visibleCount = () => browser.execute(() => [...document.querySelectorAll('[data-tool-id]')]
            .filter((button) => button.getBoundingClientRect().width > 0).length)
          if (capacities.length) {
            // ResizeObserver updates capacity on the next rendering frame.
            await browser.waitUntil(async () => await visibleCount() > capacities.at(-1)!)
          }
          capacities.push(await visibleCount())
        }
        const geometry = await browser.execute(() => {
          const rail = document.querySelector('.cs-toolrail')!.getBoundingClientRect()
          const select = document.querySelector('[data-tool-id="select"]')!.getBoundingClientRect()
          const hand = document.querySelector('[data-tool-id="hand"]')!.getBoundingClientRect()
          const zoom = document.querySelector('.cs-zoom-controls')!.getBoundingClientRect()
          const more = document.querySelector('.demo-more')!.getBoundingClientRect()
          return {
            railFits: rail.left >= 0 && rail.right <= innerWidth,
            selectFits: select.left >= rail.left && select.right <= rail.right,
            handFits: hand.width > 0 && hand.left >= rail.left && hand.right <= rail.right,
            moreSeparate: more.left >= rail.left && more.right <= rail.right,
            zoomSeparate: zoom.bottom <= rail.top,
          }
        })
        expect(geometry).toEqual({
          railFits: true,
          selectFits: true,
          handFits: true,
          moreSeparate: true,
          zoomSeparate: true,
        })
        await browser.saveScreenshot(`artifacts/landing-e2e/demo-dock-${width}-${expanded}.png`)
      }
    }
    expect(capacities[1]).toBeGreaterThan(capacities[0]!)
    expect(capacities[2]).toBeGreaterThan(capacities[1]!)
    await $('[data-tool-id="ruler"]').click()
    await expect($('.demo-more')).toHaveAttribute('aria-expanded', 'false')
    await browser.setViewport({ width: 360, height: 844, devicePixelRatio: 1 })
    await expect($('[data-tool-id="ruler"]')).toBeDisplayed()
    await expect($('[data-tool-id="ruler"]')).toHaveAttribute('aria-pressed', 'true')
    await browser.setViewport({ width: 320, height: 844, devicePixelRatio: 1 })
    await expect($('[data-tool-id="select"]')).toBeDisplayed()
    await expect($('[data-tool-id="hand"]')).toBeDisplayed()
    await expect($('[data-tool-id="ruler"]')).toBeDisplayed()
    await $('[data-tool-id="hand"]').click()
    await expect($('[data-tool-id="hand"]')).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the PNG action on one line in narrow RU and EN headers', async () => {
    for (const locale of ['ru', 'en']) {
      await browser.url(`demo/?lang=${locale}`)
      await expect($('.cs-editor-shell')).toBeDisplayed()
      for (const width of [320, 360, 390]) {
        await browser.setViewport({ width, height: 844, devicePixelRatio: 1 })
        const header = await browser.execute(() => {
          const buttons = [...document.querySelectorAll<HTMLElement>('.demo-nav button')]
          const rectangles = buttons.map((button) => button.getBoundingClientRect())
          return {
            fits: rectangles.every((rect) => rect.left >= 0 && rect.right <= innerWidth),
            sameHeight: rectangles.every((rect) => Math.abs(rect.height - rectangles[0]!.height) < 1),
            singleRow: rectangles.every((rect) => Math.abs(rect.top - rectangles[0]!.top) < 1),
            contentsFit: buttons.every((button) => button.scrollWidth <= button.clientWidth),
          }
        })
        expect(header).toEqual({ fits: true, sameHeight: true, singleRow: true, contentsFit: true })
        await browser.saveScreenshot(`artifacts/landing-e2e/demo-header-${locale}-${width}.png`)
      }
    }
  })

})
