export function textFormattingLabel(
  locale: 'en' | 'ru' | undefined,
  key:
    | 'color'
    | 'font'
    | 'size'
    | 'bold'
    | 'italic'
    | 'strike'
    | 'list'
    | 'alignment'
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
        color: 'Цвет текста',
        font: 'Шрифт',
        size: 'Размер шрифта',
        bold: 'Полужирный',
        italic: 'Курсив',
        strike: 'Зачёркнутый',
        list: 'Маркированный список',
        alignment: 'Выравнивание текста',
        background: 'Фон',
        none: 'Нет',
        padding: 'Отступ',
        radius: 'Скругление',
        apply: 'Применить',
        cancel: 'Отмена',
        mixed: 'смешанное',
      }
    : {
        color: 'Text color',
        font: 'Font family',
        size: 'Font size',
        bold: 'Bold',
        italic: 'Italic',
        strike: 'Strikethrough',
        list: 'Bullet list',
        alignment: 'Text alignment',
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
