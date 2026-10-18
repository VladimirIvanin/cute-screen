// macOS offers only Area and Screen capture, so its tray omits Window (ADR-110).
export const russianTrayLabels = [
  'Снимок области',
  'Снимок экрана',
  'Снимок окна',
  'Снимок активного окна',
  'Повторить область',
  'Открыть редактор',
  'Настройки…',
  'Выход',
].filter((label) => process.platform !== 'darwin' || label !== 'Снимок окна')
