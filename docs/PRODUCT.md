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

- `REQ-CAP-001` — захват произвольной области.
- `REQ-CAP-002` — захват всего выбранного экрана.
- `REQ-CAP-003` — захват выбранного окна.
- `REQ-CAP-004` — захват активного окна.
- `REQ-CAP-005` — повтор последней области с корректировкой при изменении мониторов/DPI.
- `REQ-CAP-006` — задержка перед захватом с отменой.
- `REQ-CAP-007` — настройка включения курсора там, где это поддерживает backend.
- `REQ-CAP-008` — multi-monitor и mixed-DPI без смещения итоговой области.
- `REQ-CAP-009` — X11 использует frozen-screen overlay; Wayland использует системный XDG selector.
- `REQ-CAP-010` — снимок сразу сохраняется как неизменяемый оригинал и открывается редактируемым документом.

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
- `REQ-EDT-005` — selection, move, resize, rotate, duplicate, delete, lock, visibility, z-order и opacity.
- `REQ-EDT-006` — все изменения документа undoable; redo очищается после новой ветки изменений.
- `REQ-EDT-007` — guides появляются только при удержании назначенной клавиши.
- `REQ-EDT-008` — tool settings находятся только в contextual toolbar.
- `REQ-EDT-009` — layers panel ограничена выбором, порядком, visibility, lock, rotation и opacity.
- `REQ-EDT-010` — clipboard различает внутренние слои, bitmap и plain text.
- `REQ-EDT-011` — keyboard duplicate создаёт копию с предсказуемым offset.
- `REQ-EDT-012` — canvas имеет собственные dimensions и продолжает существовать,
  если базовое изображение удалено, уменьшено или перемещено.
- `REQ-EDT-013` — исходное изображение представлено locked-by-default raster
  layer; после unlock его можно move/resize/rotate/delete, не изменяя immutable
  original blob.
- `REQ-EDT-014` — horizontal/vertical flip преобразует все canvas layers и crop
  одной undoable document command и совпадает в preview/export.

## Инструменты аннотации

- `REQ-TOL-001` — arrow/line: прямая или кривая, anchor points, стили линии и варианты наконечников, включая отсутствие наконечника.
- `REQ-TOL-002` — shapes: rectangle, circle, oval, diamond, star; stroke,
  solid/gradient/pattern/texture fills, fill/layer opacity, blend modes и
  визуальный corner radius.
- `REQ-TOL-003` — pencil: базовые кисти, толщина, opacity, smoothing и цвет.
- `REQ-TOL-004` — marker: толщина, opacity и blend modes highlight/darken.
- `REQ-TOL-005` — text: FigJam-like direct WYSIWYG editing through a transient
  `contenteditable` projection (never persisted as HTML), multiline,
  typography, alignment, spacing, solid/gradient/pattern/texture fill, outline,
  shadows, background, opacity/blend, common layer transforms и curated style
  presets.
- `REQ-TOL-006` — numbered marker: несколько форм, автоматическая последовательность и редактируемый multiline label.
- `REQ-TOL-007` — callout: выразительный визуальный стиль, pointer/tail и полноценное редактирование текста.
- `REQ-TOL-008` — manual censor: pixelate, blur и solid fill; без автоматического поиска данных.
- `REQ-TOL-009` — spotlight: rectangle/ellipse/diamond и настраиваемое затемнение.
- `REQ-TOL-010` — ruler измеряет расстояние в pixels/percent и взаимодействует с временными guides.
- `REQ-TOL-011` — loupe: zoom, размер, circle/rectangle, border color/width и shadow.
- `REQ-TOL-012` — eyedropper копирует HEX, показывает результат и добавляет цвет в recent colors.
- `REQ-TOL-013` — crop: свободный режим, aspect presets, handles, rule-of-thirds, reset, `Enter` и `Escape`.
- `REQ-TOL-014` — вставка emoji как редактируемого слоя.
- `REQ-TOL-015` — вставка PNG/JPEG/WebP/SVG как image layer.
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

## Оформление и вывод

- `REQ-OUT-001` — beautify поддерживает фон/градиент, padding, radius, shadow и позиционирование снимка.
- `REQ-OUT-002` — watermark поддерживает text/image, угол или точную позицию, offsets, opacity и текущий год.
- `REQ-OUT-003` — экспорт PNG/JPEG/WebP с настройками качества и масштаба.
- `REQ-OUT-004` — copy result помещает итоговый bitmap в системный clipboard.
- `REQ-OUT-005` — stitch объединяет выбранные кадры серии вертикально или горизонтально с gap/background.
- `REQ-OUT-006` — экспорт атомарный и никогда не изменяет оригинал.
- `REQ-OUT-007` — длительные export/copy показывают progress, поддерживают cancel и сообщают recoverable error.

## Интерфейс и настройки

- `REQ-UI-001` — визуальная иерархия строится на semantic design tokens и сохраняет приоритет canvas над chrome интерфейса.
- `REQ-UI-002` — system/light/dark темы и одна тёплая accent-группа.
- `REQ-UI-003` — русский и английский интерфейс без перезапуска; системная локаль `ru-*` выбирает русский, остальные неподдерживаемые локали используют английский.
- `REQ-UI-004` — primary capture/edit/export доступны при ширине 1024 px.
- `REQ-UI-005` — выбранный tool, object и frame различимы не только цветом.
- `REQ-UI-006` — controls используют настоящую HTML-семантику, tooltips и accessible names.
- `REQ-UI-007` — focus order следует визуальному порядку, reduced motion уважается.
- `REQ-UI-008` — main editor использует системные window decorations; overlays/pin могут быть frameless.
- `REQ-UI-009` — локальные rotating logs и ручной diagnostic bundle без отправки данных.

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
