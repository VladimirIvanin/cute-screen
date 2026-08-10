# Сквозная приёмка

## Правила

- Каждый сценарий выполняется из описанного начального состояния.
- Доказательство содержит app SHA, OS/architecture/session, fixture ID и observable result.
- `Pass` нельзя выставить по mocked backend, если сценарий требует реальную ОС.
- Отмена и отказ разрешений проверяются так же, как happy path.

## Режимы приёмки

**Local development acceptance:** во время разработки выполняются сценарии и
runtime checks, доступные на текущей системе владельца проекта. Реальный результат
этой системы достаточен для продолжения следующего milestone, но не означает
support на других platform rows.

**Final platform/release acceptance:** после функционального завершения приложения
все применимые сценарии повторяются на полной platform matrix, включая реальные
webview, capture/hotkey, permissions и install/launch. Только этот этап может
дать requirement статус `verified` и platform статус `supported`.

## A01 — Первый запуск

**Начало:** чистая установка и пустой app data.

1. Запустить приложение без аргументов.
2. Убедиться, что создана schema, но нет пустых фиктивных снимков.
3. Проверить tray, empty state и доступность Capture.
4. Переключить RU/EN и theme без перезапуска.
5. Закрыть editor и убедиться, что tray остаётся активен.
6. Завершить через Quit.

**Результат:** нет необработанных ошибок, пустых панелей и лишней серии; настройки сохраняются.

M04 partial evidence: `pnpm test:e2e:tauri` scenario
`m04-clean-profile-capture.e2e.ts` starts with empty app data and reaches an
enabled Copy/Export state only after the production capture request has
persisted and mounted the first document. Its native pixels are feature-gated
fake-adapter data; it is orchestration evidence, not a real-OS capture claim.

## A02 — Hotkey capture из скрытого приложения

M04 partial evidence: local Ubuntu/GNOME X11 `screen` and frozen `area` capture
successfully passed controller → owned transport → immutable library → editable
document (`pnpm smoke:m04:x11:screen`, `pnpm smoke:m04:x11:area` and
`pnpm smoke:m04:x11:window`, evidence
`artifacts/m04/x11-*.json`). It does not yet satisfy this scenario: hidden-app
native hotkey runtime and complete area interaction semantics remain pending.

1. Назначить свободную комбинацию для area capture.
2. Скрыть editor.
3. Нажать hotkey.
4. Выбрать область.
5. Проверить, что новый снимок декодирован, добавлен в серию и открыт в editor.

В финальной platform/release acceptance повторить для X11, GNOME Wayland, KDE
Wayland, Windows и macOS. На Wayland selector системный.

## A03 — Конфликт shortcut и fallback

1. Сохранить рабочую комбинацию.
2. Попытаться назначить занятую.
3. Проверить видимую ошибку и работу старой комбинации.
4. На Wayland без GlobalShortcuts открыть fallback-инструкцию.
5. Скопировать команду и вызвать capture через desktop shortcut/terminal.

## A04 — Multi-monitor и repeat area

1. Выполнить area capture на secondary mixed-DPI monitor.
2. Проверить pixel bounds результата.
3. Выполнить repeat.
4. Отключить/переставить монитор и повторить.

**Результат:** нет смещения; устаревшая область ограничивается или требует нового выбора.

## A05 — Базовое редактирование

1. Открыть новый снимок.
2. Убедиться, что снимок показан нижним locked base layer, а canvas имеет
   собственные dimensions.
3. Unlock, resize/move и удалить base layer; проверить, что canvas и immutable
   original сохранились, затем выполнить Undo.
4. Выполнить Fit → 100% → Fit на production-like снимке и проверить pan/zoom:
   zoom HUD остаётся видимым, canvas surface соответствует проценту, а высота
   viewport и окна не меняется.
5. Нарисовать два пересекающихся объекта одним активным инструментом.
6. Убедиться, что новые объекты не выбраны автоматически.
7. Перейти в Select и double-click циклически выбрать слои.
8. Move/resize/rotate/opacity/lock/z-order.
9. Выполнить horizontal и vertical canvas flip, затем undo/redo весь путь.

**Результат:** viewport и постоянные controls не прыгают и не обрезаются,
selection/history согласованы, base image редактируется как слой без изменения
оригинала, flip совпадает в preview/export.

## A06 — Drawing tools

Проверить arrow/line, curved anchors, shapes, radius, solid/linear/radial
gradient, pattern/texture fill, fill/layer opacity, shape blend modes, pencil
brushes и marker blend modes. Для каждого инструмента:

- pointer preview следует за курсором;
- настройки находятся только в contextual toolbar;
- active tool сохраняется;
- итог соответствует renderer golden;
- изменение настройки undoable.

## A07 — Text/content/clipboard

1. Из empty state открыть локальную картинку и проверить новый document с locked
   base layer.
2. Вернуться в empty state, вставить bitmap из внешнего приложения и проверить
   тот же document creation flow.
3. В активный document вставить bitmap и убедиться, что он добавлен как обычный
   Image tool layer без auto-selection и смены active tool.
4. Создать multiline RU/EN text и отредактировать его в auto-size/fixed-width.
5. Настроить typography, gradient/pattern/texture fill, outline, shadows,
   background, opacity/blend и применить несколько style presets.
6. Создать numbered marker и callout.
7. Вставить emoji и локальное изображение через Image tool.
8. Скопировать editor layer и вставить его.
9. Вставить plain text из внешнего приложения и выполнить keyboard duplicate.

**Результат:** Open/Paste routing зависит от наличия активного документа, тип
clipboard распознан, text editing не запускает tool/global shortcuts, text
preview и export визуально согласованы.

## A08 — Crop и precision tools

На чистом документе открыть Crop без предварительного программного задания frame
size. Проверить presets, handles, rule-of-thirds, reset, `Enter`, `Escape` и undo.
Повторить после resize/delete base layer и до/после canvas flip: crop использует
canvas bounds. Затем проверить manual censor, spotlight, ruler, temporary guides,
loupe auto-selection и eyedropper clipboard/toast/recent color.

## A09 — Серии и библиотека

1. Создать несколько снимков в активной серии.
2. Проверить filmstrip, rename и switching без сброса viewport.
3. Перезапустить приложение и открыть последний кадр.
4. Загрузить fixture с 1000 captures и измерить first-page latency.
5. Проверить storage usage и cleanup preview.
6. Удалить серию и проверить recoverable confirmation.
7. Открыть pin window и проверить always-on-top.

## A10 — Beautify, watermark и export

1. Настроить gradient/background, padding, radius и shadow.
2. Создать text watermark с текущим годом и image watermark.
3. Проверить corner/exact placement, offsets и opacity.
4. Экспортировать PNG/JPEG/WebP и повторно декодировать.
5. Скопировать итог в clipboard.
6. Выполнить horizontal/vertical stitch.
7. Отменить длительный export.

**Результат:** оригиналы не изменены, output dimensions/pixels соответствуют настройкам.

## A11 — Ошибки и восстановление

- Отказ capture permission.
- Отмена portal/file dialog.
- Полный диск во время сохранения.
- Crash между blob write и DB commit.
- Повреждённый thumbnail.
- Отсутствующий original.
- Повреждённая/старая document schema fixture.
- Потеря WebGL context.
- Повторный hotkey во время активного capture.

**Результат:** нет потери подтверждённых данных; пользователь получает конкретное действие восстановления.

## A12 — Accessibility и responsive UI

- Полный primary flow только клавиатурой.
- Видимый focus и логический order.
- Selected tool/object/frame различимы без опоры только на цвет.
- Icon controls имеют names/tooltips.
- 1024 px без горизонтального overflow основных действий.
- Reduced motion.
- RU/EN строки не обрезают primary actions.

## A13 — Performance

- 4K/500 слоёв — p95 ≤16,7 ms.
- 8K/1000 — p95 ≤33,3 ms.
- Idle не генерирует frames.
- Library 1000 captures не блокирует shell до полного scan.
- 20 циклов document open/close не дают монотонной утечки.

## A14 — CI-сборки и проверка версии

Для Linux x64/ARM64, Windows x64/ARM64 и macOS Intel/Apple Silicon скачать versioned artifact из GitHub Actions, проверить checksum/архитектуру, выполнить install/launch → capture → edit → export → relaunch → uninstall. На Windows/macOS ожидаемые предупреждения unsigned build документированы.

Отдельно проверить GitHub version check:

1. При равном/старом теге приложение показывает, что текущая версия актуальна.
2. При новом стабильном `vX.Y.Z` показывает current/latest и ссылку на страницу тега/Actions.
3. Manual check работает независимо от opt-in automatic setting.
4. Automatic check выключен по умолчанию и после включения выполняется не чаще раза в 24 часа.
5. `ETag`/`304`, offline, timeout, malformed tag и GitHub rate limit не блокируют запуск.
6. Приложение не скачивает и не устанавливает binaries.

## Keyboard matrix

| Действие                       | Default               | В text editing                                  | Ожидаемое поведение                          |
| ------------------------------ | --------------------- | ----------------------------------------------- | -------------------------------------------- |
| Select                         | `V`                   | вводит символ                                   | Включает Select вне поля ввода               |
| Hand                           | `H`, hold `Space`     | обычный пробел                                  | Временный pan при удержании вне text edit    |
| Crop                           | `C`                   | вводит символ                                   | Открывает crop session                       |
| Arrow/Shape/Pencil/Marker/Text | `A/S/P/M/T`           | ввод                                            | Выбирает tool вне text edit                  |
| Delete                         | `Delete`, `Backspace` | редактирует текст                               | Удаляет selection вне text edit              |
| Cancel                         | `Escape`              | завершает/отменяет text edit                    | Закрывает transient UI или очищает selection |
| Undo/Redo                      | platform convention   | работает в text editor как единая command model | Отменяет последнее обратимое действие        |
| Copy/Paste                     | platform convention   | text semantics                                  | Layer/bitmap/text dispatch                   |
| Duplicate                      | platform convention   | не перехватывает ввод                           | Создаёт offset copy                          |
| Guides                         | configurable hold key | не активирует в text edit                       | Показывает только пока клавиша удерживается  |

Точные platform key combinations фиксируются перед реализацией shortcuts и отображаются в tooltips/settings.
