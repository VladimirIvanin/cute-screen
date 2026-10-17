import type {
  ShortcutAction,
  ShortcutStatusV1,
  AutostartStateV1,
} from '../generated/desktop-ipc'

export const strings = {
  ru: {
    general: 'Общие', shortcuts: 'Горячие клавиши', navigation: 'Разделы настроек', language: 'Язык',
    generalHelp: 'Язык интерфейса и работа приложения в фоне.',
    assign: 'Назначить…', assignName: 'Назначить сочетание', editName: 'Изменить сочетание',
    actions: 'Действия', restart: 'Записать заново', escape: 'Esc — отменить',
    invalid: 'Используйте Ctrl, Alt или Command с буквой, цифрой, F1–F11 или пробелом. Print Screen можно нажать отдельно.',
    unchanged: 'Это сочетание уже назначено этому действию.',
    conflictWith: 'Уже назначено действию', help: 'О проверке сочетаний',
    systemEdit: 'Изменить в системе…', systemContinue: 'Продолжить в системе',
    localHelp: 'Сочетания работают из других приложений. Изменения сохраняются на этом компьютере.',
    pendingShortcut: 'Новое сочетание',

    title: 'Настройки', subtitle: 'Нажмите «Назначить…» или «Изменить…», затем нажмите клавиши одновременно.',
    loading: 'Загружаем настройки…', retry: 'Повторить', edit: 'Изменить…', remove: 'Убрать сочетание', test: 'Проверить сочетание',
    apply: 'Сохранить', cancel: 'Отмена', record: 'Запись приостановлена', recording: 'Нажмите клавиши одновременно',
    recordHelp: 'Используйте Ctrl, Alt или Command. Fn, медиа-клавиши и F12 не поддерживаются.',
    system: 'Открыть настройки клавиатуры', portal: 'Сочетаниями управляет система. Изменение и удаление выполняются в системном окне.',
    manual: 'Автоматическое назначение недоступно. Добавьте сочетание в настройках клавиатуры и скопируйте команду ниже.',
    suggested: 'Предлагаем для захвата области', available: 'Свободно по проверке регистрации', occupied: 'Уже занято',
    unknown: 'Нужна проверка нажатием', assigned: 'Уже назначено в Cute Screen', checking: 'Проверяем сочетание…',
    disclaimer: 'Проверка регистрации не обнаруживает все системные и локальные сочетания других приложений.',
    startup: 'Запуск при входе', startupLabel: 'Запускать Cute Screen при входе в систему',
    startupHelp: 'Приложение запускается в фоне. Захват доступен из трея и по назначенным клавишам.',
    startupSystem: 'Настройки автозапуска в ОС', continue: 'Продолжить', finish: 'Готово', skip: 'Настроить позже',
    welcome: 'Быстрый запуск Cute Screen', welcomeHelp: 'Выберите запуск с системой. Затем можно назначить сочетание захвата.',
    testing: 'Переключитесь в другое приложение и нажмите сочетание. Ждём до 30 секунд…', tested: 'Сочетание сработало',
    pending: 'Нажмите новое сочетание в течение 60 секунд. Прежнее остаётся рабочим до подтверждения.',
    timeout: 'Проверка не завершена. Попробуйте ещё раз или выберите другое сочетание.', copy: 'Скопировать команду', copied: 'Команда скопирована',
    print: 'Print Screen может запускать системный инструмент. При необходимости измените это в настройках ОС.',
    unavailable: 'Этот вид захвата недоступен в текущей системе.', saving: 'Сохраняем…', close: 'Закрыть',
  },
  en: {
    general: 'General', shortcuts: 'Keyboard shortcuts', navigation: 'Settings sections', language: 'Language',
    generalHelp: 'Interface language and background startup.',
    assign: 'Assign…', assignName: 'Assign shortcut', editName: 'Change shortcut',
    actions: 'Actions', restart: 'Record again', escape: 'Esc to cancel',
    invalid: 'Use Ctrl, Alt or Command with a letter, number, F1–F11 or Space. Print Screen can be used on its own.',
    unchanged: 'This shortcut is already assigned to this action.',
    conflictWith: 'Already assigned to', help: 'About shortcut checks',
    systemEdit: 'Change in system…', systemContinue: 'Continue in system',
    localHelp: 'Shortcuts work from other applications. Changes stay on this computer.',
    pendingShortcut: 'New shortcut',

    title: 'Settings', subtitle: 'Choose Assign… or Change…, then press the keys together.',
    loading: 'Loading settings…', retry: 'Retry', edit: 'Change…', remove: 'Remove shortcut', test: 'Test shortcut', apply: 'Save', cancel: 'Cancel',
    record: 'Recording paused', recording: 'Press the keys together',
    recordHelp: 'Include Ctrl, Alt or Command. Fn, media keys and F12 are unsupported.',
    system: 'Open keyboard settings', portal: 'The system manages these shortcuts. Change or remove them in the system dialog.',
    manual: 'Automatic assignment is unavailable. Add a shortcut in system keyboard settings using the command below.',
    suggested: 'Suggested for area capture', available: 'Available in registration check', occupied: 'Already in use',
    unknown: 'Verify by pressing the shortcut', assigned: 'Already assigned in Cute Screen', checking: 'Checking shortcut…',
    disclaimer: 'Registration checks cannot detect every system shortcut or local shortcut in other applications.',
    startup: 'Launch at login', startupLabel: 'Start Cute Screen when I sign in',
    startupHelp: 'Starts in the background. Capture using the tray or your keyboard shortcuts.',
    startupSystem: 'System startup settings', continue: 'Continue', finish: 'Done', skip: 'Set up later',
    welcome: 'Quick start with Cute Screen', welcomeHelp: 'Choose whether to start at login, then assign a capture shortcut.',
    testing: 'Switch to another app and press the shortcut. Waiting up to 30 seconds…', tested: 'Shortcut received',
    pending: 'Press the new shortcut within 60 seconds. The previous shortcut stays active until verification.',
    timeout: 'Verification did not complete. Try again or choose another shortcut.', copy: 'Copy command', copied: 'Command copied',
    print: 'Print Screen may launch the system capture tool. Change this in system settings if needed.',
    unavailable: 'This capture mode is unavailable in the current system.', saving: 'Saving…', close: 'Close',
  },
}

const actionLabels: Record<ShortcutAction, [string, string]> = {
  'capture-area': ['Область', 'Capture area'], 'capture-screen': ['Экран', 'Capture screen'],
  'capture-window': ['Выбрать окно', 'Choose window'], 'capture-active-window': ['Активное окно', 'Active window'],
  'capture-repeat': ['Повторить область', 'Repeat area'], 'show-editor': ['Открыть редактор', 'Open editor'],
}
const statusLabels: Record<ShortcutStatusV1 | AutostartStateV1, [string, string]> = {
  unassigned: ['Не назначено', 'Unassigned'], active: ['Назначено', 'Assigned'], conflict: ['Конфликт', 'Conflict'],
  awaitingVerification: ['Ожидает проверки', 'Awaiting verification'], requiresApproval: ['Нужно разрешение в ОС', 'Requires system approval'],
  unavailable: ['Недоступно', 'Unavailable'], error: ['Ошибка', 'Error'], enabled: ['Включён', 'Enabled'],
  disabled: ['Выключен', 'Disabled'], unknown: ['Состояние ОС не подтверждено', 'System state unknown'], needsRepair: ['Нужно обновить путь', 'Path needs repair'],
}
export type SettingsLocale = 'ru' | 'en'
export type SettingsStrings = typeof strings.en
export const actionLabel = (action: ShortcutAction, locale: SettingsLocale): string => actionLabels[action][locale === 'ru' ? 0 : 1]
export const statusLabel = (status: ShortcutStatusV1 | AutostartStateV1, locale: SettingsLocale): string => statusLabels[status][locale === 'ru' ? 0 : 1]

export function displayTrigger(
  trigger: string,
  macos: boolean,
): string {
  if (!macos) return trigger.replace('CTRL', 'Ctrl').replace('SHIFT', 'Shift').replace('ALT', 'Alt').replace('PRINT', 'Print Screen')
  return trigger.replace('CTRL+', '⌃').replace('ALT+', '⌥').replace('SHIFT+', '⇧').replace('SUPER+', '⌘')
}

export function recordTrigger(event: KeyboardEvent): string | undefined {
  if (
    event.repeat ||
    event.isComposing ||
    event.getModifierState('AltGraph')
  ) return undefined
  let key = event.code.replace(/^Key|^Digit/u, '')
  if (key === 'PrintScreen') key = 'PRINT'
  if (key === 'Space') key = 'SPACE'
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|10|11)|PRINT|SPACE)$/u.test(key)) return undefined
  if (
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    key !== 'PRINT'
  ) return undefined
  return [event.ctrlKey ? 'CTRL' : '', event.altKey ? 'ALT' : '', event.shiftKey ? 'SHIFT' : '', event.metaKey ? 'SUPER' : '', key].filter(Boolean).join('+')
}
