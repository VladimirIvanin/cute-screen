# Продуктовый контракт

## Назначение и аудитория

Cute Screen — полноценный local-first редактор снимков и изображений для пути
`capture/open → edit/compose → export`: вызвать захват глобальной комбинацией или
открыть картинку, выполнить аннотацию и частые графические правки, собрать
выразительную композицию и скопировать либо экспортировать результат.

Продукт не пытается повторить весь профессиональный raster/DTP workflow, но
должен заменять тяжёлый графический редактор в типичных быстрых задачах:
скомпоновать несколько изображений, изменить canvas и слои, скрыть данные,
оформить фигуры и текст, подготовить публикационный результат.

Основная аудитория — пользователи Linux, разработчики, дизайнеры, технические авторы и команды поддержки, которым нужен локальный инструмент без аккаунта и облачной обработки. Windows и macOS получают тот же документ, редактор и набор функций.

## Принципы продукта

- Local-first: снимки и документы не покидают устройство.
- Полноценный продукт, а не урезанный MVP: широкий набор инструментов образует
  согласованный редактируемый документ, имеет persistence, undo/redo,
  preview/export parity и необходимые failure states.
- Linux-first по порядку снижения рисков; GitHub Actions собирает все платформы, но официальный подписанный канал дистрибуции не создаётся.
- Canvas является рабочей поверхностью, интерфейс не конкурирует со снимком.
- Базовые действия остаются быстрыми, а профессионально полезные параметры
  раскрываются контекстно и не перегружают постоянный chrome.
- Инструмент остаётся активным до явной смены или `Escape`.
- Все обратимые правки покрываются undo/redo.
- Платформенные ограничения объясняются честно; Wayland selector может отличаться визуально.
- Ошибка должна быть видимой и восстанавливаемой, а не скрытой пустым `catch`.

## Требования к захвату

- `REQ-CAP-001` — захват произвольной области из одного кадра, совпадающего с видимым результатом системного композитора в момент подтверждения выбора; переключённое при открытом selector окно, верхние, layered и аппаратно отрисованные окна не должны исчезать из результата.
- `REQ-CAP-002` — захват всего выбранного экрана из видимого результата системного композитора; backend не сообщает успех, если может вернуть только неполный legacy-кадр.
- `REQ-CAP-003` — захват выбранного окна.
- `REQ-CAP-004` — захват активного окна.
- `REQ-CAP-005` — повтор последней области с корректировкой при изменении мониторов/DPI.
- `REQ-CAP-006` — задержка перед захватом с отменой.
- `REQ-CAP-007` — настройка включения курсора там, где это поддерживает backend.
- `REQ-CAP-008` — multi-monitor и mixed-DPI без смещения итоговой области.
- `REQ-CAP-009` — X11 Area использует fullscreen Quick Capture как единственную
  видимую capture surface: она сначала показывает frozen desktop в состоянии
  выбора области, а после подтверждения на той же WebView и в том же renderer
  lifecycle открывает annotation chrome. Wayland использует системный XDG
  selector. Временная рамка, размер и подсказка X11 восстанавливаются из frozen
  frame при каждом перемещении и не накапливают следы курсора или предыдущих
  состояний.
- `REQ-CAP-010` — Screen, Window, Active Window и Repeat сразу сохраняют
  неизменяемый оригинал и открывают редактируемый документ. Явный Area capture
  сначала создаёт неперсистентный quick-capture draft и материализует original,
  capture и editable document только по Copy, Save PNG или Editor. На X11 и
  macOS запущенный из editor захват скрывает `main` до native capture; editor
  не остаётся видимым и не попадает в кадр.
- `REQ-CAP-011` — quick-capture draft существует только во временном приватном
  staging, не попадает в series/library и полностью очищается по Close/Escape,
  crash, app exit или failed staging до materialization.
- `REQ-CAP-012` — рамка Area создаётся и остаётся move/resize-доступной внутри
  одного Quick Capture document; каждый завершённый gesture проходит одной
  undoable `setCrop` command. Аннотации остаются привязаны к physical pixels
  frozen frame и только clip-ятся рамкой. До первого drag та же Quick WebView
  показывает непрозрачную подсказку «Выделите область», crosshair и затемнение;
  во время drag — пунктирную рамку и читаемый размер. Escape отменяет временный
  draft. Отпускание primary pointer после валидного первого drag только меняет
  внутреннюю фазу `selecting → editing`: окно, renderer, frozen image, dim layer
  и сама пунктирная рамка не уничтожаются, не создаются повторно и не теряют
  focus. Нажатие `Enter` до валидного drag ничего не подтверждает; после
  перехода в `editing` оно выполняет quick action Copy. Между фазами запрещены
  loading state, blank frame, смена native window и повторное появление рамки.
- `REQ-CAP-013` — Windows/X11/macOS Area quick-mode показывает frozen desktop
  в исходных physical coordinates. Wayland сохраняет системный XDG selector,
  показывает возвращённый portal fragment на нейтральном фоне и не разрешает
  расширять рамку за его пределы.
- `REQ-CAP-014` — один Area draft блокирует параллельный capture. Copy, Save PNG
  и Editor дают terminal `captured` с различимым completion; Close даёт
  ожидаемый `cancelled` без скрытой очереди.
- `REQ-CAP-015` — на macOS Screen Recording проверяется до захвата. Отказ даёт
  `permissionDenied` без overlay и без зависших окон. UI объясняет переход в
  System Settings и повторную попытку. Intel и Apple Silicon используют один
  adapter; capability не объявляется `supported` без runtime smoke.

## Запуск и горячие клавиши

- `REQ-ACT-001` — настраиваемые глобальные комбинации для основных capture actions.
- `REQ-ACT-002` — конфликтующая комбинация не заменяет предыдущую рабочую настройку.
- `REQ-ACT-003` — Wayland использует XDG GlobalShortcuts portal при наличии.
- `REQ-ACT-004` — при отсутствии portal приложение показывает и копирует CLI-команду для системных настроек.
- `REQ-ACT-005` — один бинарник поддерживает GUI, tray, single-instance и CLI dispatch.
- `REQ-ACT-006` — скрытый tray-процесс принимает hotkey/CLI и открывает capture без ручного показа редактора.
- `REQ-ACT-007` — autostart выключен по умолчанию и управляется настройкой.

## Базовое поведение редактора

- `REQ-EDT-001` — pan/zoom не сбрасываются при смене инструмента, свойств, undo или кадра.
- `REQ-EDT-002` — добавленный элемент не становится выбранным; активный инструмент сохраняется.
- `REQ-EDT-003` — loupe после добавления выбирается автоматически для настройки; иные исключения требуют ADR.
- `REQ-EDT-004` — double click инструментом выбора циклически проваливается по пересекающимся слоям.
- `REQ-EDT-005` — selection, move, rotate, duplicate, delete, lock, visibility,
  z-order и opacity. Generic transform-scale разрешён только image layers;
  non-image tools изменяют размер только через собственную persisted geometry,
  не масштабируя stroke, text или effect style. Поворот на canvas выполняется
  через corner rotation zones без отдельного вынесенного rotate handle. Для
  bounds/points resize противоположная сторона закреплена в world space;
  `Shift` сохраняет aspect ratio, `Alt` изменяет geometry от центра. Locked
  layer показывает selection frame без активных handles.
- `REQ-EDT-006` — все изменения документа undoable; redo очищается после новой ветки изменений.
- `REQ-EDT-007` — guides появляются только при удержании назначенной клавиши.
- `REQ-EDT-008` — основной `ToolRail` находится внизу по центру; панель
  контролов (`ContextToolbar`) появляется непосредственно над ним для активных
  non-arrow инструментов, precision tools и выбранных слоёв, кроме arrow.
  При inline-редактировании Text, Callout и Numbered Marker transient-панель
  форматирования появляется над редактируемым текстом; нижний toolbar не
  дублирует text controls. Arrow settings не показываются при активации
  инструмента arrow; transient `ArrowFormattingToolbar` появляется над
  выделенной стрелкой только при инструменте select, а defaults arrow
  настраиваются через context menu/tool configure popover на кнопке инструмента.
  Цветовые controls используют product-owned picker с палитрой, HEX,
  recent/suggestions и canvas-only пипеткой; draft не создаёт document history
  entry до завершения взаимодействия.
- `REQ-EDT-009` — layers panel ограничена выбором, порядком, visibility, lock, rotation и opacity.
- `REQ-EDT-010` — clipboard различает внутренние слои, bitmap и plain text.
- `REQ-EDT-011` — keyboard duplicate создаёт копию с предсказуемым offset.
- `REQ-EDT-012` — canvas имеет собственные dimensions и продолжает существовать,
  если базовое изображение удалено, уменьшено или перемещено.
- `REQ-EDT-013` — исходное изображение представлено locked-by-default raster
  layer; после unlock его можно move/resize/rotate/delete, не изменяя immutable
  original blob. Base и content image являются единственными слоями, которым
  UI разрешает persisted non-unit transform scale. При открытии editable
  document и internal clipboard paste legacy non-image scale с модулем, отличным
  от `1`, нормализуется в `+1/+1` без компенсации geometry, history entry или
  dirty state; чистые unit reflections сохраняются.
- `REQ-EDT-014` — horizontal/vertical flip преобразует все canvas layers и crop
  одной undoable document command и совпадает в preview/export.

## Инструменты аннотации

- `REQ-TOL-001` — arrow/line: компактные FigJam-style straight, quadratic
  curved и three-segment elbow paths с редактируемыми endpoint/bend либо
  middle-segment anchors; tail и head независимо выбирают `none`, `lineArrow`,
  `solidArrow`, `triangle`, `circle` или `diamond`; body поддерживает solid и
  dashed style. Connector text не входит в arrow document contract. Arrow
  settings не показываются при активном инструменте arrow; transient toolbar
  над выделенной стрелкой доступен только через select, а defaults — через
  configure popover (context menu / Shift+F10) на кнопке инструмента arrow.
  Изменение размера выполняется endpoint/bend/middle-segment anchors без
  generic transform-scale и без масштабирования stroke/caps.
- `REQ-TOL-002` — shapes: rectangle, circle, oval, diamond, star; stroke,
  solid/gradient/pattern/texture fills, fill/layer opacity, blend modes и
  визуальный corner radius. Bounds handles меняют intrinsic geometry, сохраняя
  paint/stroke values.
- `REQ-TOL-003` — pencil: базовые кисти, толщина, opacity, smoothing и цвет;
  bounds handles преобразуют sampled points, но не толщину кисти.
- `REQ-TOL-004` — marker: толщина, opacity и blend modes highlight/darken;
  bounds handles преобразуют sampled points, но не толщину marker.
- `REQ-TOL-005` — text: FigJam-like direct WYSIWYG editing through a transient
  `contenteditable` projection (never persisted as HTML) с transient-панелью
  форматирования над редактируемым текстом, multiline и portable
  v7 rich text. UTF-16-safe spans хранят только family, size, solid color,
  weight, italic и strikethrough; paragraphs — alignment
  `start|center|end` и list kind `none|bullet`. Text background хранит только
  solid color, padding и radius. Text, callout и numbered marker используют
  этот общий text contract, сохраняя собственные container semantics. Presets,
  underline, letter spacing, line-height contract, gradient/pattern/texture
  text fill, text outline, text shadows и text opacity/blend не входят в v7;
  common layer opacity/blend/shadows для text-bearing layers не сохраняются.
  Боковые width handles переводят auto-size text в fixed-width либо меняют
  существующий wrap width без масштабирования glyph/font styles.
- `REQ-TOL-006` — numbered marker: несколько форм, автоматическая
  последовательность и редактируемый multiline label. Размер определяется
  содержимым автоматически; resize handles отсутствуют.
- `REQ-TOL-007` — callout: leader line от target marker через orthogonal elbow connector
  к label marker и portable rich-text подпись с optional solid background.
  Создание drag target→label, затем transient contenteditable и one-command commit.
  Handles target, label и elbow middle-segment изменяют connector geometry без
  transform-scale; label handle сохраняет роль точки положения подписи.
  Speech-bubble tail не входит.
- `REQ-TOL-008` — manual censor: pixelate, blur и solid fill; без
  автоматического поиска данных. Rectangle изменяет intrinsic bounds, freeform
  пропорционально преобразует persisted points; effect parameters не
  масштабируются.
- `REQ-TOL-009` — spotlight: rectangle/ellipse/diamond и настраиваемое затемнение;
  bounds handles меняют aperture geometry без масштабирования dim/feather style.
- `REQ-TOL-010` — ruler измеряет расстояние в pixels/percent и взаимодействует
  с временными guides. Persisted цвет (по умолчанию розово-малиновый), толщина
  и размер подписи настраиваются только в нижнем contextual toolbar. На canvas
  показывается цветная линия с короткими перпендикулярными засечками без круглых
  endpoint dots и перекрывающий линию rounded contrast badge: он повёрнут вдоль
  ruler, но текст остаётся читаемым, содержит только целое `NNN px` либо значение
  с `%` и имеет тонкую рамку цвета линии. Угол остаётся отдельной семантикой для
  snapping и contextual UI, но в badge не выводится. Start/end handles меняют
  factual endpoints и пересчитывают conservative bounds, сохраняя thickness,
  ticks и badge font size.
- `REQ-TOL-011` — loupe: zoom, размер, circle/rectangle, border color/width и
  shadow. Линза оформлена как callout: connector цвета рамки ведёт от линзы к
  центру source region и одинаково попадает в preview/export. Для выбранной
  лупы точка source и компактные zoom/size chips отображаются только в
  transient overlay и не попадают в документ или export. Corner handles
  равномерно меняют intrinsic `lens.size` и destination bounds; квадратный
  source region остаётся центрированным на прежнем source center, zoom и style
  не меняются, codec limits соблюдаются.
- `REQ-TOL-012` — eyedropper читает один непрозрачный пиксель
  скомпонованного scene canvas (без transient overlay), нормализует и копирует
  uppercase HEX, показывает доступный результат и добавляет цвет в recent
  colors. Во время sampling рядом с pointer/keyboard target отображается
  pointer-transparent transient-карточка с pixelated 9×9 preview, выделенным
  центральным пикселем, live swatch/HEX и подсказкой подтверждения; карточка
  остаётся внутри viewport, не пишет clipboard/recent до click/Enter и не
  попадает в document/export. Pointer и клавиатурный sampling отменяемы; ошибка
  чтения или clipboard не откатывает уже выбранный цвет и не создаёт document
  command.
- `REQ-TOL-013` — crop: свободный режим, aspect presets, handles, rule-of-thirds, reset, `Enter` и `Escape`.
- `REQ-TOL-014` — вставка emoji как редактируемого слоя; corner handles
  равномерно меняют intrinsic size без transform-scale.
- `REQ-TOL-015` — вставка PNG/JPEG/WebP/SVG как image layer. Image selection
  сохраняет восемь transform-resize handles: aspect ratio сохраняется по
  умолчанию, `Shift` разрешает free resize, `Alt` изменяет размер от центра.
- `REQ-TOL-016` — Open image и bitmap paste из empty state создают новый
  editable document с locked base layer; bitmap paste в активный document
  создаёт image layer тем же flow, что Image tool.

## Серии и библиотека

- `REQ-LIB-001` — каждый снимок принадлежит серии; при первом снимке создаётся текущая серия.
- `REQ-LIB-002` — filmstrip показывается, когда активная серия содержит снимки; на пустом стартовом экране он скрыт.
- `REQ-LIB-003` — список и thumbnails появляются лениво, не ожидая обработки всей библиотеки.
- `REQ-LIB-004` — отображаются размер серии и общий объём хранилища.
- `REQ-LIB-005` — очистка предоставляет точный preview освобождаемого места и не удаляет активный несохранённый документ.
- `REQ-LIB-006` — серия и кадр переименовываются и удаляются с recoverable confirmation.
- `REQ-LIB-007` — pin открывает отдельное always-on-top окно выбранного результата.
- `REQ-LIB-008` — после перезапуска сохраняются редактируемые аннотации и последний активный кадр.
- `REQ-LIB-009` — unsupported/corrupt последний активный документ не блокирует
  запуск shell: приложение показывает typed recoverable state, не изменяет raw
  document/original и оставляет доступными Capture и Open image. Нативный
  structured error никогда не отображается как `[object Object]`.

## Оформление и вывод

- `REQ-OUT-001` — beautify поддерживает фон/градиент, padding, radius, shadow и позиционирование снимка.
- `REQ-OUT-002` — watermark поддерживает text/image, угол или точную позицию, offsets, opacity и текущий год.
- `REQ-OUT-003` — экспорт PNG/JPEG/WebP с настройками качества и масштаба.
- `REQ-OUT-004` — copy result помещает итоговый bitmap в системный clipboard.
- `REQ-OUT-005` — stitch объединяет выбранные кадры серии вертикально или горизонтально с gap/background.
- `REQ-OUT-006` — экспорт атомарный и никогда не изменяет оригинал.
- `REQ-OUT-007` — длительные export/copy показывают progress, поддерживают cancel и сообщают recoverable error.
- `REQ-OUT-008` — quick Copy помещает crop с текущими редактируемыми
  аннотациями в native bitmap clipboard; quick Save использует системный Save
  As, пишет только PNG атомарно и повторно декодирует результат. Image bytes не
  передаются через JSON/base64.

## Интерфейс и настройки

- `REQ-UI-001` — визуальная иерархия строится на semantic design tokens и сохраняет приоритет canvas над chrome интерфейса.
- `REQ-UI-002` — system/light/dark темы и одна тёплая accent-группа.
- `REQ-UI-003` — русский и английский интерфейс без перезапуска; системная локаль `ru-*` выбирает русский, остальные неподдерживаемые локали используют английский.
- `REQ-UI-004` — primary capture/edit/export доступны при ширине 1024 px.
  Нижний chrome (серия, `ToolRail`, zoom) остаётся внутри окна и не
  перекрывается.
- `REQ-UI-005` — выбранный tool, object и frame различимы не только цветом.
- `REQ-UI-006` — controls используют настоящую HTML-семантику, tooltips и accessible names.
- `REQ-UI-007` — focus order следует визуальному порядку, reduced motion уважается.
- `REQ-UI-008` — main editor использует системные window decorations; overlays/pin могут быть frameless.
- `REQ-UI-009` — локальные rotating logs и ручной diagnostic bundle без отправки данных.
- `REQ-UI-010` — Area quick-mode использует одну frameless fullscreen surface:
  состояние выбора содержит frozen desktop, crosshair, dim layer, одну
  пунктирную crop-рамку и dimension badge; состояние редактирования добавляет
  annotation toolbar у нижней стороны рамки и action bar Editor/Copy/Save/Close
  справа. Панели меняют сторону при collision, остаются keyboard-accessible и
  не содержат OCR, AI/cloud, print, Pin, layers, beautify или watermark. После
  первого drag переход выполняется только изменением UI state существующей
  WebView; повторные show/hide/focus, native selector handoff и второй renderer
  mount запрещены. Surface не становится визуально доступной до decoded frozen
  frame и первого renderer flush; GTK может заранее map-нуть её non-focusable с
  opacity `0.01`, чтобы WebKit allocation шёл параллельно decode. Пользователю
  не показываются loading, blank или частично разложенный WebView.
  Создание WebView не входит в критический путь Area capture: резидентное
  приложение прогревает hidden quick surface заранее; для уже запущенного
  Windows-приложения reference target mouse-up → interactive chrome составляет
  не более 500 ms на 1920×1080.
- `REQ-UI-011` — системные Open/Import/Save dialogs открываются асинхронно,
  имеют parent window, различают cancel и error и не блокируют native UI event
  loop. На GTK/X11 и Wayland окно приложения остаётся responsive всё время
  жизни системного dialog.
- `REQ-UI-012` — постоянный и transient chrome сохраняет непрозрачный читаемый
  фон, границы и тени в целевых WebView, включая WKWebView macOS 12. CSS не
  полагается без фолбека на `color-mix()`, современный space-separated
  `rgb(... / ...)` или unprefixed-only `backdrop-filter`; отсутствие blur не
  должно делать `ToolRail`, contextual/transient panels или quick actions
  прозрачными.

## Качество и поставка

- `REQ-QLT-001` — 4K/500 слоёв: p95 frame time не выше 16,7 ms на reference hardware.
- `REQ-QLT-002` — 8K/1000 слоёв: p95 не выше 33,3 ms.
- `REQ-QLT-003` — idle editor не поддерживает непрерывный animation loop.
- `REQ-QLT-004` — библиотека из 1000 кадров показывает первую страницу без полного synchronous probe.
- `REQ-QLT-005` — crash/failed write не повреждает оригинал или последнее подтверждённое состояние.
- `REQ-REL-001` — GitHub Actions собирает Linux x64/ARM64 deb и AppImage как неофициальные CI artifacts.
- `REQ-REL-002` — GitHub Actions собирает unsigned macOS universal DMG для Intel и Apple Silicon.
- `REQ-REL-003` — GitHub Actions собирает unsigned Windows x64/ARM64 NSIS installers.
- `REQ-REL-004` — приложение вручную либо по явной opt-in настройке сравнивает текущую SemVer с тегами `vX.Y.Z` публичного GitHub-репозитория; оно не скачивает и не устанавливает обновления.
- `REQ-REL-005` — versioned CI artifacts сопровождаются checksums, SBOM и license report, но не объявляются официальным релизом.

## Не входит в продукт

- Автоматическая цензура и OCR.
- Eraser.
- Auto-series.
- Scrolling capture и запись экрана.
- Cloud sync, аккаунты и совместное редактирование.
- Телеметрия или автоматическая отправка crash reports.
- Миграция библиотеки и аннотаций Electron-альфы.
