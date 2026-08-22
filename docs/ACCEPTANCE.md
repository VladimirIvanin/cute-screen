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

Windows screen, area and window capture has DXGI compositor-frame assembly,
PNG-encoding, DPI and frozen-frame crop coverage plus a local interactive
desktop probe. Platform evidence still requires opening Area while one control
window is visible, switching through Alt+Tab to Task Manager (or another
independently rendered system/layered window) while the selector remains open,
then selecting an area crossing it. Decode the produced PNG, verify pixels from
the newly foregrounded window, then confirm controller → immutable library →
mounted document. A PNG containing the pre-selector desktop or only the windows
underneath is a failure.

The corresponding X11 compositor smoke must run with `_NET_WM_CM_Sn` owned,
place a separate composited/layered control window above the base fixture and
verify its pixels in the frozen result. Existing non-composited root smokes do
not satisfy this regression.

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
4. Выполнить Fit → 1:1 → Fit на production-like снимке и проверить pan/zoom:
   zoom HUD остаётся видимым, canvas surface соответствует проценту, а высота
   viewport и окна не меняется.
5. Нарисовать два пересекающихся объекта одним активным инструментом.
6. Убедиться, что новые объекты не выбраны автоматически.
7. Перейти в Select и double-click циклически выбрать слои.
8. Move/rotate/opacity/lock/z-order; image layers resize through their frame,
   while non-image layers expose only tool-owned geometry handles and never
   commit non-unit transform scale. Rotation uses corner zones without a
   detached top handle.
   While moving a selected Arrow, verify that its ink, selection frame and
   floating formatting toolbar follow the same pointer preview without a
   visible offset.
9. Выполнить horizontal и vertical canvas flip, затем undo/redo весь путь.

**Результат:** viewport и постоянные controls не прыгают и не обрезаются,
selection/history согласованы, base image редактируется как слой без изменения
оригинала, intrinsic resize не масштабирует stroke/text/effect styles, flip
совпадает в preview/export.

Windows x64 local-development evidence (2026-08-22): the focused CanvasViewport
suite passed 33/33 for image resize, intrinsic non-image handles, corner rotate,
direct cursors, synchronized Arrow preview/frame/toolbar, modifiers, cancel and
one-command release. The complete Chrome
151 browser matrix passed 7/7 spec files on isolated port 5174; its M08 scenarios
resize a ruler through its factual endpoint and reflow text through a side width
handle while preserving style and unit transform scale. `pnpm test:render`
passed 13/13. Real-Tauri persisted-reopen acceptance is still pending because
the locally built app could not create an embedded WebDriver session.

### UI shell evidence

На 1600×1000, 1280×720 и 1024×700 открыть populated shell, переключить RU/EN и
light/dark, открыть меню и contextual colour/select controls, затем закрыть их
Escape и outside click. Проверить возврат focus к trigger, отсутствие document
horizontal overflow и доступность Capture/Copy/Export. В LayersPanel завершить
drag opacity и изменить rotation: каждый завершённый control interaction создаёт
не более одной undoable document command.

## A06 — Drawing tools

Current status: partial implementation. Chrome 150/Linux browser evidence covers
the M06 pointer and gradient-default flows (2026-08-10). Windows 10 x64 focused
evidence (2026-08-13) covers the v6/v2 persisted arrow engine: v5/v1 migration,
straight/quadratic/three-segment elbow routes, independent endpoint styles,
continuous solid/dashed/dotted-legacy bodies, rebased bounds, hit testing and
one-command endpoint/bend/middle-segment edits. Chrome 151/Windows browser
evidence additionally covers the five-control compact toolbar without overflow
at 1600×1000, 1280×720 and 1024×700 for RU/EN and light/dark, active-tool
persistence, no auto-selection, elbow middle-segment drag and undo/redo. Six
visually reviewed renderer goldens cover all three paths, both body styles and
the complete endpoint set; decoded Canvas2D preview/export is exact and
CanvasKit/Canvas2D stays within the documented semantic tolerance. Real Tauri
WebView2 and native persisted-reopen evidence remain pending because the
2026-08-13 embedded driver did not open port 4445; M05 performance gate and the
remaining non-arrow paint/parity matrix are also pending.

Windows 10 x64 repair evidence (2026-08-14) additionally covers selected Arrow
values diverging from active-tool defaults, 10 px/cap bounds and hit testing
outside the old bounds, one-command undo/reopen, and recoverable corrupt v1/v2
preferences through autosave. This evidence is core/Vue only: browser and Tauri
were not rerun.

The separate user-reported curved Arrow repair covers a yellow quadratic Arrow
with filled caps: the trimmed body starts at the center of the left cap base,
and the cap direction is symmetric around the actual anchor-to-trim join instead
of the mismatched first sample. The semantic scene regression and visually
inspected Canvas2D/CanvasKit goldens pass; endpoint styles and continuous dashed
body rendering are unchanged. This is renderer-harness evidence, not a new
browser or Tauri claim.

The user-reported short Arrow repair covers straight arrows whose endpoints are
closer than the nominal closed-cap length. The `solidArrow` and outline
`triangle` scene regressions require the cap base to stop at the available
route and its width to shrink by the same factor, so moving the handles together
cannot produce a full-size overflowing wedge. The full 413-test suite and all
13 existing renderer goldens pass; normal-length geometry, persisted endpoints
and selection handles are unchanged. This is deterministic core/render evidence,
not a new browser or Tauri claim.

Проверить arrow/line, curved anchors, shapes, radius, solid/linear/radial
gradient, pattern/texture fill, fill/layer opacity, shape blend modes, pencil
brushes и marker blend modes. Для каждого инструмента:

- pointer preview следует за курсором;
- настройки находятся только в contextual toolbar;
- active tool сохраняется;
- итог соответствует renderer golden;
- изменение настройки undoable.

Для arrow отдельно открыть migrated v5 document и v1 drawing preferences,
проверить `chevron → lineArrow`, `triangle → solidArrow`, неизменные width 3,
dotted, opacity/blend и world endpoints. Создать straight, quadratic и elbow,
перетащить start/end, bend и elbow middle-segment handle; до pointer-up document
не меняется, pointer-up создаёт ровно одну update command. Connector text не
должен приниматься document codec.

## A07 — Text/content/clipboard

Windows x64 repair evidence (2026-08-14) покрывает оптическое центрирование
цифры numbered marker: renderer использует actual glyph ink ascent/descent, а
не верх em-box. Focused core/Canvas2D/CanvasKit regressions прошли 39/39;
локальный Chromium screenshot при zoom 453% дал -0,55 canvas px между центром
круга и центром ink цифры. Реальный Tauri/WebView2 rerun и multiline label
editing остаются pending.

Headless renderer evidence (2026-08-14) дополнительно покрывает v7 runs и
paragraph metadata для Text, Callout и Numbered Marker: mixed family/size/color/
weight/italic/strikethrough, fixed-width wrapping, `start|center|end`, bullets
без изменения persisted content и solid background padding/radius. Canvas2D и
CanvasKit goldens декодированы и визуально проверены; preview/export Canvas2D
совпадают точно, backend parity остаётся в documented tolerance. Это закрывает
renderer/layout часть шага 5–6, но не direct editing, selection, IME, toolbar,
browser или real-Tauri acceptance.

1. Из empty state открыть локальную картинку и проверить новый document с locked
   base layer.
2. Вернуться в empty state, вставить bitmap из внешнего приложения и проверить
   тот же document creation flow.
3. В активный document вставить bitmap и убедиться, что он добавлен как обычный
   Image tool layer без auto-selection и смены active tool.
4. Создать multiline RU/EN text и отредактировать его в auto-size/fixed-width.
5. Настроить v7 typography через нижний toolbar для выбранного слоя или через
   transient floating toolbar при inline edit: portable family, size, solid
   color, weight, italic, strikethrough, paragraph alignment/list и solid
   background с padding/radius. Проверить, что removed text effects и common
   opacity/blend/shadows не попадают в persisted JSON.
6. Создать numbered marker и callout с тем же rich-text contract, сохранив
   badge и leader-line callout semantics.
7. Вставить emoji и локальное изображение через Image tool.
8. Скопировать editor layer и вставить его.
9. Вставить plain text из внешнего приложения и выполнить keyboard duplicate.

**Результат:** Open/Paste routing зависит от наличия активного документа, тип
clipboard распознан, text editing не запускает tool/global shortcuts, text
preview и export визуально согласованы.

Headless editing evidence (2026-08-14) закрывает pure/controller/component
контракты direct editing: UTF-16-safe selection, formatting по диапазону,
collapsed typing style, paragraph/list normalization, IME без промежуточных
document commands, plain-text clipboard и одна command на завершённую сессию.
Escape проверен как ожидаемая отмена без commit. Общий flow покрыт для Text,
Callout и Numbered Marker.

Windows browser acceptance (2026-08-14) закрывает этот runtime flow: Chrome
151.0.7922.138, 6/6 specs, включая 4/4 v7 rich-text scenarios. Отдельная
browser-skill visual inspection подтверждает 32 px compact toolbar, порядок и
сегментацию controls на 1024×700, а также одну строку без horizontal scroll с
доступным overflow на 640×700; найденный выпавший `Text color` label исправлен и
перепроверен. Real Tauri/WebView2 acceptance не заявляется: stable runner дошёл
до WebView2 151.0.4129.78, но до test bodies потребовал отсутствующий
`msedgedriver` 151.0.4129.78 и попытку download, запрещённую scope.

Windows browser repair acceptance (2026-08-15) дополнительно проверяет handoff
`contenteditable → canvas`: верхняя граница ink до и после commit совпадает с
допуском 1 canvas px, а при повторном редактировании persisted text pixels
отсутствуют под transient projection и возвращаются после Escape. Chrome
151.0.7922.138 rich-text spec прошёл 5/5; real Tauri/WebView2 не заявляется.

## A08 — Crop и precision tools

На чистом документе открыть Crop без предварительного программного задания frame
size. Проверить presets, handles, rule-of-thirds, reset, `Enter`, `Escape` и undo.
Повторить после resize/delete base layer и до/после canvas flip: crop использует
canvas bounds. Затем проверить color picker: открыть contextual control на desktop и 1024×700, выбрать белый, чёрный и серый, ввести HEX, проверить recent и compact suggestions. Запустить пипетку из picker и tool rail, выбрать известный непрозрачный scene-пиксель при zoom, убедиться, что HEX скопирован, toast и recent обновлены, а transient overlay в sample не попал. Проверить стрелки/Shift+стрелки, Enter и Escape, прозрачный пиксель и clipboard failure; единственное изменение выбранного слоя должно undo/redo ровно одной command.

Затем проверить manual censor, spotlight, ruler, temporary guides,
loupe auto-selection и eyedropper clipboard/toast/recent color. Для ruler
проверить persisted цвет/толщину/размер подписи в нижнем RU/EN toolbar,
перпендикулярные endpoint ticks без точек и rotated-upright contrast badge с
одной длиной (`NNN px` или `%`) без угла; LayersPanel не дублирует настройки.

Observed Windows 10 build 19045 evidence covers seeded browser interactions for
A08, not a clean production mount. The focused Chrome 151 M08 spec passed 8/8
scenarios through the `?m05=1`/M08 App harness: crop remained tied to the 400×300
canvas after user-visible base resize/delete and before/after flips;
presets, handles, rule-of-thirds, reset, Enter/Escape and undo were exercised;
hold/release/window-blur guides changed only the interaction overlay; loupe was
the only precision tool auto-selected after creation; and eyedropper sampled
`#273D5A` at zoom while excluding its transient overlay. Alpha `0` and `128`
were rejected before clipboard/swatch/recent mutation, while alpha `255`
produced uppercase HEX. Locked/read-only precision controls expose disabled
semantics and remain history/default neutral; unlock followed by a completed
update creates one command. Swatch, recent colour, pointer/keyboard cancel,
not-ready and recoverable clipboard-error states were observable. Desktop and
1024×700 EN/RU screenshots plus
`artifacts/browser-e2e/m08-ruler-visual.png` were captured and visually
inspected with all contextual controls inside the viewport. The ruler artifact
shows the default pink-crimson angled line, perpendicular ticks, upright
length-only badge and its bottom toolbar; no ruler settings appear in LayersPanel.

Renderer/export evidence decodes Canvas2D and CanvasKit PNG output, checks all
three censor modes against lower/higher layers, spotlight shapes and feather,
ruler colour/thickness/ticks and length-only contrast badge, loupe
clipping/border/shadow and crop crossing an effect.
`pnpm test:render` passed 13/13 and four visually inspected precision goldens
cover scales 1 and 2.

The cropped-viewport repair adds focused Chrome 151 evidence for a committed
non-origin (`x=60`) crop. After leaving Crop edit mode, the visible surface used
the cropped 1:1 aspect ratio; new censor and ruler gestures, eyedropper sampling,
and create/reopen text editing resolved to canvas-space coordinates without state
injection. Vue coverage also proves that Crop edit/reset temporarily returns to
the full canvas and that text-edit scene rebuilds preserve `outputBounds`. The
live CanvasKit lifecycle test proves full→crop→full backing/CSS resizing while
registered images and fonts remain usable; this is not real GPU/WebView evidence.

The loupe/ruler repair additionally proves that canvas flips mirror a loupe's
separate source rectangle in the same undoable command and that a partially
out-of-canvas source produces transparent-black unsampled lens pixels in both
render backends at scales 1 and 2. Ruler badges derive their upright orientation
from world-space endpoints after rotation or either reflection, while line/ticks
retain the layer transform. Short-ruler selection/hit bounds expand after label
size and thickness changes without moving the measured world endpoints. The
focused Chrome 151 M08 spec passed 8/8. Its ruler scenario now moves a factual
endpoint through the intrinsic handle, proves thickness and badge font size stay
unchanged, keeps the badge inside the visible conservative selection frame and
checks one-command undo/redo with a fixed opposite endpoint. The visually
inspected artifact is
`artifacts/browser-e2e/m08-ruler-bounds-after-style.png`; renderer goldens
remained unchanged.

The loupe callout follow-up brings the committed visual closer to the Electron
prototype without changing schema v7. Canvas2D and CanvasKit decoded-pixel
coverage proves a border-coloured connector and source arrowhead for circular
and rectangular lenses at export scales 1 and 2. The connector is drawn only
after the frozen composite-below snapshot, while the selected source marker and
zoom/size chips live exclusively in the interaction overlay. All four updated
M08 precision goldens were opened and visually inspected; the focused suite
passed 68/68, render harness 13/13, full unit/component suite 396/396 and
`pnpm check` completed successfully on Windows x64.

Real-Tauri A08 remains blocked, not passed. The feature-gated Windows binary
built successfully, but `@wdio/tauri-service` did not observe the embedded
WebDriver server on port 4445 within 60 seconds, so neither clean-state decoded
crop mount nor native system-clipboard readback reached its test body. Browser
clipboard evidence is not substituted for that native result.

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

The headless PNG renderer additionally proves crop-controlled output dimensions,
representative pixels and immutable document/source/layer data. Native Save As,
JPEG/WebP, clipboard, cancellation and full multi-frame stitch remain pending
and are not inferred from this evidence.

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

Windows x64 component evidence (2026-08-22) additionally verifies Hand cursor
feedback (`grab` at rest, `grabbing` only during pan) and a single tooltip path
with explicit custom-tooltip padding. Browser visual and real-Tauri acceptance
remain pending.

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
