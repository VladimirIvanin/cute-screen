import { browser, expect, $ } from '@wdio/globals'

describe('foundation shell in browser mode', () => {
  it('mounts from clean state and completes mocked typed IPC', async () => {
    await browser.url('/')
    const ping = await browser.tauri.mock('ping')
    await ping.mockResolvedValue({ message: 'pong', protocolVersion: 1 })

    await expect($('h1')).toHaveText('Cute Screen workspace is ready')
    await $('button=Check desktop bridge').click()
    await expect($('[role="status"]')).toHaveText(
      'Desktop bridge ready · protocol 1',
    )

    await ping.update()
    expect(ping).toHaveBeenCalledTimes(1)
  })
})
