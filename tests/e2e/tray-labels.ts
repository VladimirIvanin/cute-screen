// macOS offers only Area and Screen capture in the tray (ADR-164).
export const russianTrayLabels = [
  'Снимок области',
  'Снимок экрана',
  'Снимок окна',
  'Снимок активного окна',
  'Повторить область',
  'Открыть редактор',
  'Настройки…',
  'Выход',
].filter((label) => process.platform !== 'darwin' || ![
  'Снимок окна', 'Снимок активного окна', 'Повторить область',
].includes(label))
