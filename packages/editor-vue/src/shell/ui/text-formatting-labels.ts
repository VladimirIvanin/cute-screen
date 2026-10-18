export function textFormattingLabel(
  locale: 'en' | 'ru' | undefined,
  key:
    | 'width'
    | 'auto'
    | 'color'
    | 'font'
    | 'size'
    | 'bold'
    | 'italic'
    | 'strike'
    | 'list'
    | 'alignment'
    | 'alignStart'
    | 'alignCenter'
    | 'alignEnd'
    | 'background'
    | 'none'
    | 'padding'
    | 'radius'
    | 'apply'
    | 'cancel'
    | 'mixed',
): string {
  const ru = locale === 'ru'
  const labels = ru
    ? {
        width: 'Ширина текста',
        auto: 'Авто',
        color: 'Цвет текста',
        font: 'Шрифт',
        size: 'Размер шрифта',
        bold: 'Полужирный',
        italic: 'Курсив',
        strike: 'Зачёркнутый',
        list: 'Маркированный список',
        alignment: 'Выравнивание текста',
        alignStart: 'По левому краю',
        alignCenter: 'По центру',
        alignEnd: 'По правому краю',
        background: 'Фон',
        none: 'Нет',
        padding: 'Отступ',
        radius: 'Скругление',
        apply: 'Применить',
        cancel: 'Отмена',
        mixed: 'смешанное',
      }
    : {
        width: 'Text width',
        auto: 'Auto',
        color: 'Text color',
        font: 'Font family',
        size: 'Font size',
        bold: 'Bold',
        italic: 'Italic',
        strike: 'Strikethrough',
        list: 'Bullet list',
        alignment: 'Text alignment',
        alignStart: 'Align left',
        alignCenter: 'Align center',
        alignEnd: 'Align right',
        background: 'Background',
        none: 'None',
        padding: 'Padding',
        radius: 'Radius',
        apply: 'Apply',
        cancel: 'Cancel',
        mixed: 'mixed',
      }
  return labels[key]
}
