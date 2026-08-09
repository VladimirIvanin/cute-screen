import {
  translationKeys,
  type SupportedLocale,
  type TranslationKey,
} from './types'

const dictionaries: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en: {
    appName: 'Cute Screen',
    canvasViewport: 'Canvas viewport',
    capture: 'Capture',
    captureAction: 'Capture',
    copy: 'Copy',
    export: 'Export',
    moreActions: 'More actions',
    theme: 'Theme',
    language: 'Language',
    systemTheme: 'System',
    lightTheme: 'Light',
    darkTheme: 'Dark',
    tools: 'Tools',
    toolSettings: 'Tool settings',
    seriesFrames: 'Series frames',
    zoom: 'Zoom',
    sceneCanvas: 'Scene canvas',
    interactionOverlay: 'Interaction overlay',
    emptyTitle: 'Capture your first screen',
    emptyDescription:
      'Start a capture to open it here and add clarifying annotations.',
    readyLoadError: 'The document could not be loaded.',
    captureUnavailable:
      'Capture will be available after the native backend is connected.',
    copyUnavailable: 'Copy is available after a result is open.',
    exportUnavailable: 'Export is available after a result is open.',
    layers: 'Layers',
    layersEmpty: 'Layers will appear when a capture is open.',
    hideLayers: 'Hide layers',
    showLayers: 'Show layers',
    toolSelect: 'Select',
    toolHand: 'Hand',
    toolCrop: 'Crop',
    toolArrow: 'Arrow',
    toolShape: 'Shape',
    toolPencil: 'Pencil',
    toolMarker: 'Marker',
    toolText: 'Text',
    toolPrivacy: 'Hide data',
    toolSpotlight: 'Spotlight',
    toolUnavailable: 'This tool is not available yet.',
    arrowHint: 'Drag to create an arrow',
    color: 'Color',
    width: 'Width',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoomValue: 'Reset zoom',
    selectedFrame: 'Selected frame',
    cancel: 'Cancel',
    retry: 'Retry',
    loadingEditor: 'Preparing editor…',
    copyAction: 'Copy',
    exportAction: 'Export',
    undo: 'Undo',
    redo: 'Redo',
    unsavedChanges: 'Unsaved changes',
    savingDocument: 'Saving…',
    readOnlyDocument: 'Read-only document',
    saveFailed: 'Saving failed',
  },
  ru: {
    appName: 'Cute Screen',
    canvasViewport: 'Область холста',
    capture: 'Снимок',
    captureAction: 'Снимок',
    copy: 'Копировать',
    export: 'Экспорт',
    moreActions: 'Другие действия',
    theme: 'Тема',
    language: 'Язык',
    systemTheme: 'Системная',
    lightTheme: 'Светлая',
    darkTheme: 'Тёмная',
    tools: 'Инструменты',
    toolSettings: 'Настройки инструмента',
    seriesFrames: 'Кадры серии',
    zoom: 'Масштаб',
    sceneCanvas: 'Холст сцены',
    interactionOverlay: 'Слой взаимодействия',
    emptyTitle: 'Сделайте первый снимок',
    emptyDescription:
      'Запустите захват — здесь откроется снимок и появятся инструменты уточнения.',
    readyLoadError: 'Не удалось загрузить документ.',
    captureUnavailable:
      'Захват станет доступен после подключения native backend.',
    copyUnavailable: 'Копирование доступно после открытия результата.',
    exportUnavailable: 'Экспорт доступен после открытия результата.',
    layers: 'Слои',
    layersEmpty: 'Слои появятся после открытия снимка.',
    hideLayers: 'Скрыть слои',
    showLayers: 'Показать слои',
    toolSelect: 'Выбор',
    toolHand: 'Перемещение',
    toolCrop: 'Обрезка',
    toolArrow: 'Стрелка',
    toolShape: 'Фигура',
    toolPencil: 'Карандаш',
    toolMarker: 'Маркер',
    toolText: 'Текст',
    toolPrivacy: 'Скрыть данные',
    toolSpotlight: 'Фонарь',
    toolUnavailable: 'Этот инструмент пока недоступен.',
    arrowHint: 'Потяните, чтобы нарисовать стрелку',
    color: 'Цвет',
    width: 'Толщина',
    zoomOut: 'Уменьшить',
    zoomIn: 'Увеличить',
    zoomValue: 'Сбросить масштаб',
    selectedFrame: 'Выбранный кадр',
    cancel: 'Отмена',
    retry: 'Повторить',
    loadingEditor: 'Подготавливаем редактор…',
    copyAction: 'Копирование',
    exportAction: 'Экспорт',
    undo: 'Отменить',
    redo: 'Повторить',
    unsavedChanges: 'Несохранённые изменения',
    savingDocument: 'Сохраняем…',
    readOnlyDocument: 'Документ только для чтения',
    saveFailed: 'Не удалось сохранить',
  },
}

export function resolveSystemLocale(
  languages: readonly string[],
): SupportedLocale {
  return languages.some((language) =>
    language.toLocaleLowerCase().startsWith('ru'),
  )
    ? 'ru'
    : 'en'
}

export function t(locale: SupportedLocale, key: TranslationKey): string {
  return dictionaries[locale][key]
}

export function assertLocaleCompleteness(): boolean {
  return (
    (Object.keys(dictionaries.en) as TranslationKey[]).length ===
      translationKeys.length &&
    (Object.keys(dictionaries.ru) as TranslationKey[]).length ===
      translationKeys.length
  )
}
