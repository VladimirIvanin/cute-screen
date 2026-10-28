import { browser } from '@wdio/globals'

export async function notificationReadability() {
  return browser.execute(() => {
    const notice = document.querySelector<HTMLElement>('.cs-action-feedback')
    const message = notice?.querySelector<HTMLElement>('.cs-action-feedback-message')
    if (!notice || !message) throw new Error('Missing notification')
    const channels = (color: string) => {
      const values = color.match(/[\d.]+/gu)?.map(Number)
      if (!values || values.length < 3) throw new Error(`Unsupported color: ${color}`)
      return values
    }
    const luminance = (color: string) => {
      const linear = channels(color).slice(0, 3).map((value) => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
    }
    const background = getComputedStyle(notice).backgroundColor
    const contrast = (color: string) => {
      const foreground = luminance(color)
      const backdrop = luminance(background)
      return (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05)
    }
    const messageStyle = getComputedStyle(message)
    return {
      theme: document.documentElement.dataset.theme,
      foreground: messageStyle.color,
      background,
      backgroundAlpha: channels(background)[3] ?? 1,
      fontSize: Number.parseFloat(messageStyle.fontSize),
      lineHeight: Number.parseFloat(messageStyle.lineHeight),
      messageContrast: contrast(messageStyle.color),
      buttonContrasts: [...notice.querySelectorAll<HTMLElement>('button .n-button__content')]
        .map((element) => contrast(getComputedStyle(element).color)),
      horizontalOverflow: notice.scrollWidth > notice.clientWidth + 1,
    }
  })
}
