import path from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { openM08, setLocale } from './browser-m08-test-kit'

describe('M08 crop and precision acceptance in browser mode', () => {
  it('keeps every M08 contextual setting labelled and inside desktop and 1024px RU/EN layouts', async () => {
    const matrix = [
      { width: 1440, height: 900 },
      { width: 1024, height: 700 },
    ] as const
    const tools = {
      en: [
        ['Crop', ['Preset', 'Reset', 'Apply', 'Cancel']],
        ['Hide data', ['Region', 'Effect', 'Block size']],
        ['Spotlight', ['Shape', 'Dim color', 'Dim opacity', 'Feather']],
        [
          'Ruler',
          [
            'Colour',
            'Thickness',
            'Label size',
            'Unit',
            'Snapping',
            'Angle step',
          ],
        ],
        [
          'Loupe',
          ['Zoom', 'Size', 'Shape', 'Border color', 'Border width', 'Shadow'],
        ],
      ],
      ru: [
        ['Обрезка', ['Пропорции', 'Сбросить', 'Применить', 'Отмена']],
        ['Скрыть данные', ['Область', 'Эффект', 'Размер блока']],
        [
          'Фонарь',
          [
            'Форма',
            'Цвет затемнения',
            'Непрозрачность затемнения',
            'Растушёвка',
          ],
        ],
        [
          'Линейка',
          [
            'Цвет',
            'Толщина',
            'Размер подписи',
            'Единицы',
            'Привязка',
            'Шаг угла',
          ],
        ],
        [
          'Лупа',
          [
            'Увеличение',
            'Размер',
            'Форма',
            'Цвет рамки',
            'Толщина рамки',
            'Тень',
          ],
        ],
      ],
    } as const

    for (const size of matrix) {
      await browser.setWindowSize(size.width, size.height)
      await openM08()
      for (const locale of ['en', 'ru'] as const) {
        await setLocale(locale)
        for (const [tool, labels] of tools[locale]) {
          await $(`button[aria-label="${tool}"]`).click()
          const layout = await browser.execute((expectedLabels) => {
            const toolbar = document.querySelector<HTMLElement>(
              '.cs-context-toolbar',
            )
            const controls = document.querySelector<HTMLElement>(
              '.cs-context-controls',
            )
            if (!toolbar || !controls) throw new Error('M08 toolbar is missing')
            const toolbarBounds = toolbar.getBoundingClientRect()
            const text = toolbar.textContent ?? ''
            return {
              labelsVisible: expectedLabels.every((label) =>
                text.includes(label),
              ),
              toolbarFits:
                toolbarBounds.left >= 0 &&
                toolbarBounds.right <= window.innerWidth &&
                toolbarBounds.top >= 0 &&
                toolbarBounds.bottom <= window.innerHeight,
              controlsFit: controls.scrollWidth <= controls.clientWidth,
              documentFits:
                document.documentElement.scrollWidth <= window.innerWidth,
              activeElement: document.activeElement?.getAttribute('aria-label'),
            }
          }, labels)
          expect({ size, locale, tool, ...layout }).toEqual({
            size,
            locale,
            tool,
            labelsVisible: true,
            toolbarFits: true,
            controlsFit: true,
            documentFits: true,
            activeElement: locale === 'ru' ? 'Холст сцены' : 'Scene canvas',
          })
        }
        await browser.saveScreenshot(
          path.resolve(
            `artifacts/browser-e2e/m08-toolbar-${size.width}x${size.height}-${locale}.png`,
          ),
        )
      }
    }
  })
})
