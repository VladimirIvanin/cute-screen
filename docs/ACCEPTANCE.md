# Сквозная приёмка

## Unix activation frame

`REQ-ACT-005/006`: входящий stream с наследованным O_NONBLOCK принимает header
и payload частями без преждевременного закрытия; terminal reply сохраняет request
ID/outcome. Проверить также Linux CLI cold/warm с реально запущенным приложением;
macOS socket unit tests не объявляют пользовательский CLI поддержанным на macOS.

## Monterey first frame и permission recovery (ADR-158/159)

1. На 12.7.6 запустить штатный macos-screen smoke: metadata обязана содержать
   screenCaptureKitStream, оригинал 2880×1800 полностью декодируется. Повтор
   после успеха и отмены не требует перезапуска службы или приложения.
2. Area получает тот же полный SCK frame; drag даёт корректный crop, Escape
   возвращает cancelled. После timeout/cancel/deny нет временных exclusion окон,
   захватов в библиотеке и активных SCStream.
3. На видимом чужом приложении исключающие прозрачные окна не меняют key window,
   мышь и снимок; проверить wallpaper/Dock, fullscreen Spaces и каждый монитор.
4. Deny остаётся в редакторе с явными Settings/Reopen кнопками. Ошибка открытия
   Settings видима, повтор доступен; выданные права код не сбрасывает.
5. На macOS 13+/14+ подтвердить прежний route без Monterey compatibility windows.

Фактический локальный evidence и оставшиеся gates — TESTING.md.

## macOS Screen/Area через ScreenCaptureKit (2026-10-28, ADR-157)

Статус: implementation и portable contracts; macOS compile/runtime pending.

1. На macOS 12.7.6 выполнить `cargo test --locked --package cute-screen-desktop --lib macos`
   и запустить свежую `.app` либо `pnpm tauri dev`. SDK 13.1 допустим для dev.
   Screen/Area metadata должны показывать `screenCaptureKitStream`.
2. На macOS 14+ со свежей SDK-14+ сборкой повторить: metadata —
   `screenCaptureKitScreenshot`. Сборка с SDK 13.x должна выбрать stream.
3. На каждом маршруте проверить первый grant, deny, повторный запуск и grant
   для изменившейся ad-hoc сборки. Не считать включённый тумблер доказательством
   разрешения текущему процессу. Отказ не открывает selector, не создаёт document.
4. Проверить Screen и Area из видимого editor, tray и hotkey. В frozen image нет
   редактора/selector; drag и Quick → Editor сохраняют тот же frame без переворота.
   Export PNG повторно декодировать и сравнить размеры, угловые цветные метки,
   непрозрачность, Retina 2×, два экрана 1×/2× слева/сверху и отрицательные origins.
5. Escape/cancel во время ожидания кадра и выбора не создаёт original/draft;
   следующий захват доступен. После серии Screen/Area не остаются SCStream
   sessions/индикатор захвата. Изменение layout возвращает invalidTarget;
   технический failure/timeout не превращается в permissionDenied или legacy success.

Windows Rust pass и synthetic bitmap contracts не заменяют эти native steps.

## Portal lifecycle и регрессии waytator (2026-10-26, ADR-156)

1. GNOME/KDE Wayland: из чужого приложения нажать зарегистрированный portal hotkey.
   До первого клика Quick получает фокус, Escape закрывает его. Повторить ShowEditor,
   Screen, Window, отмену, Busy и следующий запуск без token. Не добавлять тестовый
   set_focus до проверки — это скроет дефект production presentation.
2. В открытом Screenshot permission/picker отменить соответствующий MCP job:
   системный диалог закрывается, job получает cancelled, новый capture доступен,
   оригинал/документ не создаётся. Проверить ранний ответ и перезапуск portal.
3. Native capture-lifecycle: второй capture через общий dispatcher возвращает Busy
   и не меняет draft; Copy аннотированного Quick → закрытие → отдельный Windows STA
   process читает PNG из OS clipboard. Повторно декодировать, сравнить crop dimensions,
   opaque pixels и наличие аннотации. Fake capture не доказывает physical capture.
4. Физические два монитора: сменить основной, отключить монитор и изменить DPI;
   проверить Area/Screen/Repeat. Пером выбрать цвет и вложенный пункт меню, проверить
   pointercancel/отпускание. Это отдельные pending hardware gates.
5. Текст → круг: завершить текст, создать фигуру, zoom/resize, Undo/Redo и export;
   не должно быть лишних сегментов и смещения transient overlays. Blur обновляется
   при изменении нижних слоёв и после flip/undo.

## Локальный MCP (ADR-154)

ADR-155: создать два ключа одного клиента и проверить оба stdio-подключения.
Закрыть/открыть Settings: открыть прежний конфиг и скопировать его из строки.
Отозвать первый: второй остаётся рабочим и его открытый config сохраняется.
Перезапустить приложение: открыть/скопировать тот же ID/ключ без create.
MCP off запрещает создание, но позволяет копировать сохранённые конфиги.
Проверить чтение legacy-записи, independent revoke, error/retry и keyboard focus.

Через «Подключить агента» открыть Agents / MCP, включить подключения, скопировать
конфиг и подключить stdio-клиент. Импортировать 4K PNG, добавить текст/стрелку/crop
одним пакетом; проверить preview, token conflict, dedup, Undo/Redo, decoded export,
отказ перезаписи и immutable original. Запустить capture job, отменить delayed
capture и завершить screen capture. Вернуться к edited history record; перезапустить
приложение и проверить production restore. Отозвать ключ и проверить отказ.
Settings уже открыт на General: повторный вход переключает singleton на Agents.
Проверить ширину 1024, keyboard/focus, RU/EN и обе темы. Все 15 профилей (JSON/TOML/YAML,
ручной stdio), смена инструкции/формата, скрытие предыдущего секрета и
packaged sidecar проверяются отдельно на доступных ОС; отсутствующий pass — pending.

## Настройка панели быстрого режима (REQ-UI-017, ADR-153)

Открыть Settings → «Быстрый режим». Верхняя группа активна, нижняя скрыта;
Select (V) закреплён, Hand/Crop/Gradient отсутствуют. Перетащить Arrow вниз,
переставить Spotlight перед Line внутри верхней группы; проверить такой же
порядок Quick rail после reopen. Проверить перестановку скрытых и Alt + стрелки;
отменить другой drag через Escape и отпускание вне группы; только первый
перенос сохраняется. Вернуть Arrow вверх. Повторить перенос через Tab и
Enter/Space, проверить focus и сообщение. Скрыть все перемещаемые инструменты:
Quick содержит Select без завершающего разделителя. Разделители обеих
панелей стоят только между непустыми группами. Переоткрыть Settings/Quick; Editor содержит полный набор.
Новая доступная запись catalog активна без изменения preferences. Проверить
RU/EN, обе темы, окно 760×640, ошибку записи и retry. Browser evidence отдельно
от native WebKitGTK/WebView2/WKWebView.

## Linux native paint (ADR-149)

Запустить свежий standalone debug/no-bundle на реальной Wayland-сессии с GPU.
Открыть production-like 4K изображение. Повторить обычный/развёрнутый размер,
наведение на «Показать слои» и ToolRail, скрытие main и второй GUI launch.
Документ и undo/redo сохраняются; после переходов видны изображение и chrome.
Проверить, что скрытое окно не получает redraw, а callback стабилизированного
окна прекращается. Отдельно проверить первый запуск и capture → Quick → Editor.

`window-paint` E2E декодирует WebView PNG и сравнивает документ после трёх циклов.
Этот gate не заменяет проверку фактического compositor output. Отсутствие
случайного мерцания в одном запуске не доказывает исправление исходного сбоя;
при повторении сохранить desktop frame, sequence и платформу.

## Выбранные рукописные обводки (ADR-147)

В новом документе через палитру создать пять овалов и четыре прямоугольника:
О5 → О3 → О9 → референсный наклонный овал → О5; П4 → П3 → П2 → П4.
Чередовать типы: их циклы независимы. Отменить жест через Escape/pointercancel,
сделать пустой жест и проверить следующий seed. Draft совпадает с commit;
после создания активен Select. Проверить Undo/Redo, duplicate, reorder,
read-only/locked, изменение цвета/толщины, пропорции 1:1/2:1/3:1, отсутствие
fill hit area и точность stroke hit-testing. Переключить вид выбранной фигуры
на другой circling и обычный rectangle: валидный codec, metadata не попадает
в defaults/clipboard. Quick → Editor и reopen сохраняют рисунок и следующий
вариант. Сверить decoded export 1×/2× Canvas2D/CanvasKit. Старые файлы не
удалять; визуальная совместимость прежних обводок по запросу владельца снята.

## Магнит всех рамок (ADR-146)

Создать обычную фигуру, изображение, emoji и текст. Перенести рамку к каждому
краю Crop/canvas и в угол: захват 6 CSS px, скольжение вдоль края, удержание
до 14 CSS px и отрыв. Повторить для группы. Resize стороны/угла должен
попадать в край с допуском 6 CSS px; Shift сохраняет контракт типа, Alt — центр,
отражение не меняет выбранную сторону. Поворот resize и semantic handles
сохраняют прежний контракт. Проверить Ctrl/Cmd, Escape/cancel, no-op, Undo/Redo,
zoom 50/100/200%, ненулевой Crop, Quick-рамку и Crop presets. Preview не пишет
документ; pointerup — одна команда. Native pass требует production Capture →
Quick → Editor и trusted pointer input, browser pass не заменяет WebView.

## Самопересечения цензуры (ADR-145)

Выбрать «Свободный контур» и нарисовать восьмёрку, вернув указатель точно
в начало. Повторить для заливки, размытия и мозаики. Область создаётся без
ошибки simple polygon и сохраняет обе доли контура; не превращается в прямоугольник.
Проверить двойной обход и hit-test внутри него, Undo/Redo, сохранение/codec и
повторно декодированный PNG 1×/2×. Старый вогнутый контур сохраняет форму.

## Стыки экрана рамки (ADR-144)

Через штатный picker выбрать телефон, проверить portrait/landscape и обе темы.
У opaque-снимка с cover смена Screen fill между белым и чёрным не меняет пиксели
preview или повторно декодированного PNG, включая скругления. В contain и после
смещения свободные поля сохраняют выбранный цвет; alpha компонуется под снимком.
Повторить для window/browser, проверить внешний clip и Undo/Redo. Фиксировать
runtime, DPR, fractional preview и export 1×/2×; Windows не доказывает WebKit.

## Кэш размытия (ADR-143)

Открыть production-like 4K PNG, создать blur-цензуру, удерживая кнопку мыши
переместить её через несколько разных участков. Пиксели должны меняться до
pointerup. Повторить с размытым фоном оформления; resize и сила меняют текущую
подложку, а не растягивают старый растр. Проверить Undo/Redo, Escape и cancel,
экспорт сразу после изменения, повторное декодирование PNG и смену документа
при незавершённом worker. Layer above не пересчитывает прежнюю цензуру; layer
below/resource replacement — пересчитывает. Кэш <=128 MiB и освобождён после
dispose; idle canvas не перерисовывается. Итоговые RGBA сверить с legacy path.
Переместить обычную фигуру выше цензуры сначала без оформления, затем с blur
фоном: сцена обновляется до pointerup, статическая цензура не фильтруется заново.
Повторить после «Отразить по горизонтали» и «Отразить по вертикали», с Undo/Redo
отражения и последующим PNG export. Сравнить warmed/fresh renderer после flip
и non-origin crop, включая Undo/Redo; исходные blobs неизменны.

## Отключение оформления (ADR-142)

Применить фон/рамку/тень и создать аннотацию на полях. Прокрутить оформление
вниз: «Убрать оформление» остаётся внизу панели и доступна через Tab/Enter.
Начать numeric draft, нажать кнопку: фон, поля, рамка и подписи исчезают без
дополнительного подтверждения; панель остаётся открытой, кнопка отключена.
Снимок/crop и слои сохраняются. Новая стрелка относится к снимку; Undo стрелки,
затем Undo отключения возвращают всё оформление одним шагом. Redo снова снимает
его. Export без оформления имеет размеры снимка/crop; после Undo и перезапуска
восстанавливаются оформление и его ресурсы. Проверить RU/EN × light/dark при
1024 px и read-only; footer не перекрывает прокручиваемые поля.

Заголовки разделов оформления, включая вложенные summary, не выделяются при
drag/double-click. Клик и Enter/Space раскрывают раздел; текст в полях можно
выделять и копировать.

## Миниатюра картинки фона (ADR-139)

Выбрать «Картинка», загрузить 3840×2160: над fit/scale видны миниатюра,
размеры/формат и «Заменить картинку». Изображение целиком, без растяжения;
прозрачные участки показывают шахматную подложку. Заменить прозрачным PNG,
проверить Undo/Redo и отмену системного picker. Перезапуск сохраняет preview
даже после удаления материала из каталога. Loading/error различимы, старое
изображение не остаётся при ожидании нового. Read-only отключает замену.

## Общая палитра оформления (ADR-138)

Открыть цвет фона: доступны общая палитра и «Свой цвет». Выбор оттенка сохраняет
opacity, создаёт одну undoable command; Undo/Redo восстанавливают цвет.
Неверный HEX показывает ошибку без изменения документа. Escape возвращает из
custom к палитре, затем закрывает её с возвратом фокуса; оформление остаётся открытым.
Проверить RU/EN, обе темы и 1024 px без overflow; read-only отключает trigger.
В палитре инструмента пипетка имеет кнопку 34×34, SVG 18×18 по центру без padding.
Нажатие включает sampling, Escape отменяет его. Повторить в Windows WebView2.

## Ползунок «Все стороны» (ADR-136/137)

Связать поля. Подпись и точное число с единицей стоят рядом, полноширинный
range расположен следующей строкой под ними.
Удерживая ползунок, изменить размер полей: preview виден, документ ещё прежний.
Отпустить — все четыре стороны равны, один Undo/Redo возвращает весь жест.
Повторить с Escape и pointercancel — committed document не меняется.
Проверить стрелки, точный ввод, %/px, disabled и раздельные поля. Диапазоны
200%/8192 px прежние; RU/EN × themes и 1024 px не дают horizontal overflow.

## Визуальные рамки (ADR-135)

Новое оформление начинает с тёмной темы рамки. Сменить на светлую, проверить
Undo/Redo; сохранённый светлый документ/пресет читается со светлой рамкой (ADR-140).

Открыть «Оформление»: порядок разделов — «Фон и макет», «Рамка», верхняя и
нижняя полосы. Открытие не меняет документ. В «Рамке» видны четыре подписанных
образца с различимым chrome. Выбрать окно, стрелками перейти в браузер и телефон,
проверить применимые поля, затем Undo/Redo и «Без рамки». Смена типа сохраняет
title/URL, масштаб и другие настройки; один выбор — один undoable command.
Read-only отключает все radio. При 1024 px RU/EN × themes плитки стоят в одном
ряду без обрезки названий; focus виден. Native save/reopen сохраняет тип.

## Живой выделитель с оформлением

Открыть изображение, включить оформление через «Оформление» → «Поля вокруг».
Для «Выделить», «Подсветить» и «Окрасить» провести выделителем с удерживаемой
кнопкой: штрих виден до pointerup, следующее движение удлиняет его, document
layers и history ещё не меняются. Shift down/up без движения не усиливают цвет.
Pointerup создаёт один слой с теми же пикселями; один Undo убирает его, Redo
возвращает. Инструмент остаётся активным. Escape, blur и pointercancel убирают
временный штрих без нового слоя. Повторить обычный Editor и Quick Capture.
Browser проверяет изображение 2560×1440; native — production Capture → Quick →
Editor в настоящем WebView2 с fake capture, без заявлений о physical capture.

## Клавиатура числовых полей (ADR-133)

Создать градиент через UI; в поле непрозрачности удержать ↓: поле и холст меняются,
committed document остаётся прежним до keyup. Отпускание — одна undo-команда,
redo точно возвращает результат. Проверить Shift, границы и дробный параметр.
Ввести число, нажать ←/Home: подтверждения нет; Tab/клик подтверждает один раз.
Пустой/ошибочный/mixed ввод не меняется стрелками. Первый Escape отменяет draft,
сохраняя панель и Quick; следующий закрывает ближайшую панель с возвратом фокуса.
Проверить потерю фокуса окна, смену слоя, disabled/read-only, IME, wheel,
пресеты и −/+ с Enter/Space. Повторить номер метки, Layers, оформление и
inline Apply/Cancel. До подтверждения autosave/defaults/документ не меняются.
Проверить production Quick → Editor в настоящем WebView2; WebKit evidence отдельно.

## Независимые размер и плотность тени (ADR-134)

В обеих темах образцы показывают белые карточки на одинаковой светлой площадке;
«Нет», «Лёгкая», «Средняя», «Объёмная» различимы без наведения (ADR-141).
Розовое выделение и keyboard focus не окрашивают саму площадку.

При плотности 83% изменить размер 100 → 400%: тень становится шире, плотность
не меняется. Escape отменяет preview; один commit, Undo и Redo возвращают
размер. В «Параметры тени» проверить softness, положительный/отрицательный spread,
X/Y, цвет и reset. Пресет возвращает согласованный рецепт; «Нет» выключает тень.
Параметры сохраняются с документом и пресетом, восстанавливаются после restart.
В 1024×768 два ползунка и свёрнутые дополнительные настройки видны вместе с
background/padding/scale/corners, RU/EN × light/dark, без horizontal overflow.
В PNG проверить мягкий хвост широкой тени и отсутствие чёрной заливки внутри
прозрачного снимка. У края холста большая тень закономерно обрезается; подсказка
объясняет увеличение полей. WebKit требует отдельного runtime evidence.

## Непрерывная тень снимка

Открыть production-like 4K изображение, задать поля 8%, scale 99%, radius 38 и
shadow 83% без рамки. Сразу под нижним краем нет полосы чистого фона: тень
примыкает к снимку и ослабевает наружу. Повторить window/browser/phone и PNG
1×/2× Canvas2D/CanvasKit; экспорт декодировать и проверить пиксели на 1/8/16/32 px
под центром нижнего края. Нулевой shadow убирает тень, Undo возвращает значение.

## Компактные фон и макет (ADR-132)

Открыть «Оформление» без пресета: исходный документ и undo не изменяются.
При 1024×768 RU/EN × light/dark выбрать solid fill: цвет, HEX, opacity, связанные
поля, scale/radius и shadow видны вместе, без горизонтальной прокрутки.
Единицы полей выбираются двумя видимыми сегментами `% / px`: активен только
один, выбор сохраняет значения полей, Undo возвращает единицу. Оба доступны
с клавиатуры и disabled при запрете редактирования.
Разорвать связь полей: изменить левое, остальные сохранены. Включить связь:
четыре стороны равны верхней; один Undo возвращает все независимые значения.
В fixed mode ширина/высота стоят рядом, aspect presets доступны; положение
раскрывается отдельно и содержит девять подписанных позиций и X/Y offsets.
Выбрать образец тени и изменить slider/точный процент: preview не меняет
документ, один commit — одна undo-команда. Escape/pointercancel отменяют draft;
Escape из shadow не закрывает панель. Проверить клавиатуру, disabled без документа,
сохранение/материалы и gradient controls после объединения секций.

## Магнит краёв градиента (ADR-131)

Создать подложку в полном Editor и протянуть её за середину к краям Crop/canvas.
При расстоянии до 6 CSS px край подложки совпадает с краем кадра независимо
от места захвата. Продолжить вдоль края до угла; обе оси удерживаются независимо.
Дрожание до 14 CSS px сохраняет привязку, дальнейший отрыв возвращает свободный
перенос; Ctrl/Cmd отключает магнит. Проверить zoom 50/100/200%, все четыре края,
Crop с ненулевым origin, light/dark и RU/EN. Поворот и группа не получают новый магнит.
Размер и fill не меняются; до release документ неизменен, один Undo отменяет
весь перенос, Redo восстанавливает. Escape/cancel и возврат в исходную позицию
не добавляют history; новый drag не наследует удержание предыдущего.

## Жест масштабирования интерфейса (ADR-130)

В Editor, Quick Capture и Settings развести/свести два пальца над toolbar,
панелями, пустым местом и открытым popover. Размеры controls и всей страницы
должны сохраняться. Ctrl/Cmd+wheel над canvas продолжает менять только масштаб
холста, обычная прокрутка Settings/слоёв сохраняется. Повторить после reload,
при открытии нового окна и смене темы; системный DPI не блокируется.

Browser regression проверяет trusted wheel cancellation, viewport/DPR/control
sizes, zoom холста и Settings scroll. Синтетический WebKit gesture contract
не доказывает физический pinch. Native Linux/Windows/macOS trackpad smoke pending.

## Публикационная карточка (ADR-127)

Проверить production mount → «Оформление» без изменения документа → ручной вариант.
До выбора любого пресета видны Макет/Фон/Рамка/Подписи. Поля/radius/shadow равны
нулю, фон прозрачный; opening/closing и no-op не создают undo. Изменить поле вручную,
проверить одну команду, Undo до отсутствующей composition и Redo; controls остаются доступны.
Новый capture и Quick → Editor не получают оформление автоматически. Панель справа
резервирует место, переключается со слоями, сохраняет раскрытые разделы; Fit учитывает
её ширину. 1024/1280 px, RU/EN, light/dark, focus/disabled/loading/error/cancel.
Тип заливки выбирается семью визуальными кнопками; активен ровно один тип,
названия доступны при наведении и screen reader. Tab/Enter выбирают тип;
Undo/Redo возвращают выбор, параметры других типов сохраняются.
В dock включён compact общего gradient editor: полностью видны 100% и 359°,
число и единица не перекрываются, все 20 цветов и «Свой цвет» помещаются по ширине.
ArrowDown следует восьми колонкам, свой HEX вводится и применяется; обычные
popover редакторов фигур/подложки сохраняют прежний размер.
Включить ручки на холсте, задать углы 0/45/90/180/270/359: цифры точек целиком
помещаются и центрированы в кружках. Проверить номера до 16 и миниатюру freeform;
размеры numeric input, keyboard focus и перетаскивание сохраняются.
В «Подписях» нет вложенных details: один блок редактируется сразу, несколько
выбираются плоским списком с сокращением длинных названий. Текст во всю ширину;
font/size рядом, доступна быстрая палитра и кнопки text alignment. Смена цвета
сохраняет alpha и остальные блоки. Проверить подложку, логотип/disabled import,
выбор после удаления, Undo/Redo, {year} и 1024 px RU/EN × обе темы.

На 4K снимке с аннотациями менять независимые поля, frame и положение: content-стрелки
и censorship следуют пикселям. Создать card-стрелку от поля к снимку. Cross-space
selection/reorder запрещены. Crop/flip относятся к content; экспорт при активном Crop
включает всю карточку. Нижняя полоса с нулевыми прочими полями не перекрывает снимок.
По ADR-129 переключателя пространств нет: начало на поле создаёт card-слой,
на снимке — content-слой; перенос через границу сохраняет привязку. Card-слой
выбирается и перемещается поверх снимка. Стартовые варианты: поля, браузер, телефон;
три пресета полос отсутствуют, ручные настройки полос сохраняются.

Browser: длинные RU/EN title+URL, тема, undo/redo/reopen. Phone: обе ориентации,
contain/cover/offset без деформации и поворота снимка. Подписи: несколько text/logo
blocks, четыре области, якоря/drag/font/opacity/backplate; {year} фиксируется при
применении и меняется только явной командой.

Градиенты: linear/radial 2–8 stops и reverse; freeform 2–16 points/spread/alpha,
миниатюра всего фона и on-canvas controls. Один жест — один undo; Escape/pointercancel
отменяют draft. Delete/стрелки в редакторе не редактируют document layers. Смена типа
сохраняет предыдущие варианты; palette и собственные материалы применяются вручную.

Импортировать фон/лого, сохранить preset, удалить внешний файл и очистить history/cache,
смоделировать age >7 дней: материал доступен после relaunch. Удаление записи материала
не ломает документ/preset; последний владелец освобождает blob через journal recovery.
Материалы не защищают от удаления сам оформленный capture.

Проверить декодированные PNG и clipboard bitmap: размеры/pixels, clipping,
прозрачность, frame, обе реализации renderer, 1×/2×. Замена полностью закрытого
censorship оригинала не должна менять blurred background, card loupe и thumbnail.
Платформенная приёмка и reference GPU budgets фиксируются отдельно; pending не считается pass.

## Компактная панель и графическое размещение (ADR-128)

Создать Gradient в полном Editor. В RU/EN, dark/light и окнах 640/1024 px
mode/fill/opacity/placement не пересекаются; opacity label/field на одной оси.
Открыть «Расположение»: шесть иконок краёв/центров и две stretch-команды.
Применить «Ширина → Снизу», затем проверить остальные края/центры. Меняется
нужная ось, fill и независимая ось сохраняются. Повтор команды — no-op;
Ctrl/Cmd+Z и redo работают, пока popup открыт. Arrow keys перемещают focus
между кнопками, Escape закрывает popup и возвращает focus на trigger.
Rotation/multi объясняют disabled состояние; locked/read-only блокируют команды.
Настройки gradient stops не теряются при reopen. Scope остаётся Editor-only.

## Градиентная подложка (ADR-124/126)

`REQ-TOL-018`, `REQ-EDT-002/015/016/017`: в Quick Capture нет Gradient.
Перейти в полный Editor, выбрать Gradient, протянуть область
в обе стороны. Получить чёрный снизу → прозрачный сверху, без stroke, с Select.
Проверить fit width/height по Crop/canvas, disabled при rotation, edge snap
6 CSS px при 50/100/200%. В одной панели переключить Размер/Переход: bounds
handles и gradient handles взаимно исключаются. Перенести конец, линию и stop,
проверить Shift 45°, Escape/pointercancel/no-op и одну команду на жест.
Проверить 2–8 stops, alpha/position/colour, reverse/rotate/reset и opacity;
новый текст над подложкой, независимые Shape defaults, locked/read-only и mixed.
Повторить RU/EN × light/dark при 1024 px; Quick → Editor → создание → relaunch должен
сохранить identity, editable controls и defaults. Декодировать exports обоих
backend при 1×/2× и визуально проверить снимок интерфейса. Факты — TESTING.md.

## Рукописная линия (ADR-125)

`REQ-TOL-017` (Line), `REQ-EDT-005/006/015/016/017`: выбрать оформление в defaults,
создать две линии серией, проверить разные seeds и отсутствие наконечников.
В Select переключить clean/handDrawn, выполнить undo/redo: seed сохраняется.
Defaults стрелки независимы; mixed/locked/read-only используют общую панель.
Проверить codec, style transfer, оба decoded exports 1×/2×, Quick → Editor
и relaunch с теми же payload/defaults. Linux browser, оба renderer exports
1×/2× и real-WebView Quick → Editor/relaunch passed. Windows/macOS pending;
native gate использует fake capture pixels. Evidence — TESTING.md.

## Обводка и рукописные стрелки (ADR-123)

`REQ-TOL-001/002`, `REQ-EDT-002/005/006/015/016/017`: выбрать овальную и прямоугольную обводки из
палитры до рисования, протянуть область и проверить отсутствие заливки,
Shift/Alt, selection, resize/rotate и undo/redo. Создать два объекта и сравнить
вариации. Для стрелки выбрать рукописное оформление в настройках обводки,
проверить три траектории, наконечники, пунктир, mixed/locked/read-only,
перенос стиля и defaults. Переключение clean/handDrawn сохраняет seed.
Draft и commit совпадают. Проверить Quick → Editor и reopen, декодированные
экспорты 1×/2× обоих renderers и неизменяемый original. Доказательства
фиксируются в TESTING.md. Linux browser, decoded renderer exports 1×/2× и
real-WebView Quick → Editor/reopen passed; Windows/macOS и system capture
для этого среза pending. Наличие controls само по себе не является acceptance.

## GNOME 42 из коробки (2026-10-20, ADR-122)

`REQ-CAP-001/002/006/009/016/017`: в GNOME 42 окружении без gnome-screenshot
в PATH/HOME Auto разрешается во встроенный gnomeShell. Два последовательных
Area, History, новый crop=null, reopen и полное PNG decode проходят. Перед
capture main/settings/Quick скрыты; старой рамки нет. D-Bus Screenshot имеет
flash=false; ScreenCast calls отсутствуют. Занятое legacy имя даёт Busy, его
владелец не заменяется; после освобождения следующий захват работает.
Отдельно проверить явный резервный gnomeScreenshot там, где утилита установлена.
CLI и Settings сохраняют реальный backend в provenance. Современный GNOME
по routing contract сохраняет portal; реальный Ubuntu 24 gate отдельно.

## Разовые Wayland-снимки и повторная рамка (2026-10-20, ADR-121)

`REQ-CAP-001/002/005/006/009/010/011/012/013/016/017`: GNOME ≤42 с helper:
Auto → Area → выбрать crop → сохранить в History → новый Area. Во время
нового mapped warmup старые crop/документ/chrome не появляются; начальный
новый документ имеет crop=null. Два разных drafts, новая рамка работает,
Escape отменяет без сохранения. Сохранённый PNG повторно декодировать.
Screen и Repeat также используют разовые кадры. Проверить отсутствие
ScreenCast calls и постоянного индикатора sharing после всех captures.
Сохранить явный GNOME helper, перезапустить тот же profile и проверить выбор.

В Settings проверить RU/EN, loading/error/retry, unavailable options, pending,
focus, cancel без записи, busy без потери выбора. При удалении helper сохранённый
выбор остаётся видимым как недоступный; Auto восстанавливается явно.
На Ubuntu 24 современный GNOME должен сохранить Screenshot portal; KDE —
Screenshot; wlroots — Screenshot или совместимый grim. Не выдавать router units
за native проверки этих окружений. Итог и команды — TESTING.md.

## Единая иконка толщины линии (2026-10-19)

`REQ-EDT-015/016`, `REQ-UI-001/003/006`: выбрать стрелку, линию, фигуру
и линейку; создать и выделить выноску. Кнопка настройки штриха в defaults
и selection-панели показывает три линии разной толщины. Проверить RU/EN,
обе темы, mixed и disabled; внутри меню остаются образцы типов штриха,
изменение толщины и Escape с возвратом фокуса. Команды и результаты — TESTING.md.

## Первый кадр ScreenCast (ADR-120)

`REQ-CAP-001/002/009/016`: на GNOME/Wayland перезапустить приложение, вызвать
Area и подтвердить системный выбор монитора. Первый frozen frame и сохранённый
результат не содержат permission dialog или его анимацию. Повторный capture
использует сессию без нового диалога и без дополнительных 350 мс. Повторить
для Screen, успешной смены монитора в Settings и немедленного capture после
неё. Cancel выбора сохраняет прежний монитор; ошибка не публикует новую сессию.
Rust ordering tests и успешная сборка сами по себе не закрывают native приёмку.

## Wayland: одна авторизация и качественный кадр (2026-10-19, ADR-118)

`REQ-CAP-001/006/009/010/012`: в настоящей GNOME/Wayland сессии запустить Area
из приложения: первый capture открывает выбор монитора/разрешение ScreenCast,
оставить его открытым минимум 5 секунд. Выбрать монитор и разрешить доступ.
Второй capture в том же процессе не должен снова открывать системное окно.
После отзыва доступа системным индикатором следующий capture сообщает ошибку;
повторный явный запрос может открыть новую авторизацию, без скрытых повторов.
До решения пользователя `Capture unavailable` не появляется, повторный захват
не создаёт второй запрос. Разрешение открывает Quick Capture с полным
кадром в selecting; drag переходит к аннотациям в том же WebView.
Copy/Save/Editor сохраняют только выбранную область; экспорт повторно декодировать.
Повторить с Escape до drag и отменой разрешения после паузы: без error toast
и нового документа; следующий capture доступен. Repeat повторно открывает выбор.
Проверить отсутствие main/settings в кадре, резкость мелкого текста и PNG
в physical resolution выбранного монитора: fit в одной Quick surface,
корректный pixel crop и расширение рамки. В другом масштабе монитора повторить
проверку native Wayland preview; межмониторное выделение не заявляется.
Отказ разрешения должен оставаться отдельным permissionDenied.
Rust regression не заменяет эту проверку через production WebView.
В General Settings проверить «Выбрать экран»: отмена сохраняет прежний монитор,
успех переключает последующие captures, pending не создаёт второй запрос.
Измерить повторный capture до выделения по dev timing, сравнить с PNG staging.
Назначить hotkey в Dev, проверить срабатывание, перезапустить тот же executable:
binding/command сохраняются, ложного unavailable banner нет.
Статус native приёмки и ограничения — TESTING.md; причины удаления
customization dialog — [исследование Linux](LINUX_CAPTURE_RESEARCH.md).

## Стартовая толщина линий (2026-10-18, ADR-116)

`REQ-EDT-015/017`, `REQ-TOL-001/002/003/011`: в workspace без сохранённых
настроек стрелка создаётся с 8 px, линия, фигура, карандаш и рамка лупы —
с 4 px. Панель показывает ту же толщину. Сохранённые пользовательские
настройки и существующие объекты сохраняют свои значения; шрифты не меняются.
Core/component evidence и ограничения native проверки — TESTING.md.

## Windows GUI и края Area (ADR-115)

REQ-ACT-005/006/007/008, REQ-REL-003, REQ-CAP-001/006/010/011/012:
запустить установленный release через Проводник/ярлык и --background: отдельная
консоль не появляется. Проверить single-instance, tray и GUI settings.
Публичные capture/--json/--help/--version отвергаются на Windows/macOS; Linux CLI
сохраняется. Build smoke использует внутренний --startup-check.
Системной мышью начать Area с четырёх краёв/углов, закончить у противоположного
края, отменить живой drag через Escape и повторить. EdgeDriver-only действия
и isTrusted=true не доказывают отсутствие native перехвата у края.
Повторить Quick chrome, физический захват без main и сохранение аннотаций после
Editor handoff. Windows 11/ARM64/mixed-DPI/HDR/RDP требуют отдельных прогонов.

## Гигиена локальных артефактов (ADR-114)

`REQ-REL-001/002/003/005`: `pnpm disk:usage` различает основной target,
изолированные сборки и test runtime. Dry-run cleanup перечисляет только
известные temporary profiles/binary/config; screenshots/reports и failed appData
сохраняются. Два worker не удаляют профили друг друга. После browser E2E
не остаётся его Chrome profile; после native runner — его pin binary/config.
Аварийный kill требует ручного cleanup. Полезные Cargo/incremental caches
сохраняются, Cargo profiles не меняются. Проверка UI/runtime на каждой native
платформе остаётся отдельной.

## Загрузки лендинга (ADR-113)

REQ-WEB-005/006/007: RU/EN, семь точных установщиков, release/checksums, три
колонки выше 760 px и вертикальный список до 760 px. Проверить Tab/Enter,
hero-рекомендации x64/ARM64/universal, mobile/unknown/32-bit, отказ Client Hints,
полный список и якорь без JS. CI не выбирает draft/prerelease/неполные версии;
API failure не публикует сайт. Hosted workflow проверяется отдельным запуском.

## Линковка macOS availability checks (2026-10-18)

`REQ-REL-002`, `REQ-CAP-015`: на macOS Intel и Apple Silicon выполнить
`pnpm build`, затем
`cargo build --locked --package cute-screen-desktop --bin cute-screen --no-default-features`
и `target/debug/cute-screen --startup-check`. Отдельно выполнить штатный
`pnpm verify:release-boundary` и universal DMG build из release workflow.
Не должно быть undefined `__isPlatformVersionAtLeast`; обе архитектуры DMG
должны пройти `lipo <input_file> -verify_arch x86_64 arm64`. Native smoke и проверка
Screen Recording остаются отдельными gates. Исправленный macOS run pending;
локальный Linux pass не закрывает эту приёмку.

## Меню трея не попадает в захват (2026-10-18, ADR-107)

`REQ-CAP-001/002/005/006/012/014`: открыть настоящее системное меню трея,
нажать Area, выделить место под прежним меню. Frozen frame и декодированный
original после materialization показывают фон без меню. Повторить Screen
и Repeat; Window/Active Window не должны выбирать собственное меню.
Пауза 200 мс применяется только к tray actions. Cancel во время паузы
возвращает cancelled до backend без документа; повторный capture доступен.
Hotkey/CLI/UI не получают дополнительной паузы. Фактический runtime статус
и ограничения конкретных desktop shells — TESTING.md и PLATFORM_MATRIX.md.

## Фоновый Area и системный focus (2026-10-18, ADR-106)

`REQ-CAP-009/011/012/014`: foreground принадлежит чужому окну, Cute Screen
работает в tray. Запустить installed CLI Area. До любого click/выделения
и WebDriver switchWindow активным должен стать Quick XID. Esc закрывает его
и возвращает typed cancelled. Повторить с удерживаемым первым drag и ещё раз
без drag. `pnpm smoke:installed:area-escape` проверяет installed ELF; путь,
SHA256, native XID и результаты находятся в JSON. Предыдущий WebDriver
UI-прогон с switchWindow подтверждал DOM cancellation, но не этот контракт.

## Escape до первого выделения Area (2026-10-18)

`REQ-CAP-011/012/014`: открыть Area штатной кнопкой Capture и, не нажимая
на canvas и не назначая ему focus тестом, нажать Escape. Draft удалён, Quick
скрыт, main восстановлен, repository не получил документ. Повторить захват,
начать первый drag, удерживать primary pointer и нажать Escape: отменяется весь
ещё не подтверждённый capture. После отмены доступен новый захват. В editing
первый Escape во время pencil/marker stroke по-прежнему отменяет только штрих.
Native X11 сценарий: `CUTE_SCREEN_E2E_SCENARIOS=area-escape pnpm test:e2e:tauri`;
Ubuntu 24.04.5 / physical X11 / WebKitGTK 2.52.6 — 1/1 passed, включая
repeat=true после hide/reopen. Артефакты и ограничения — TESTING.md. Windows physical exclusion
сценарий также больше не назначает DOM focus перед Escape.

## Ubuntu 22.04: бинарная совместимость (ADR-104)

`REQ-REL-001`: прежний ELF с GLIBC_2.39 должен провалить
`pnpm check:linux:compat`. Собрать `pnpm build:linux:ubuntu22`, проверить ABI
нового ELF и DEB dependencies. В Ubuntu 22.04 с актуальными Jammy updates
установить DEB, выполнить CLI `--help` и открыть GUI через настоящий WebKitGTK.
Повторить AppImage extract-and-run. Отдельно проверить X11/Wayland capture,
горячие клавиши и clipboard; ELF/CLI smoke не заменяет эти проверки.
Для ARM64 требуется native runner. Команды и фактический статус — TESTING.md.

## Иконка выноски: карточка и точка (2026-10-18)

`REQ-EDT-008`, ADR-055: выбранный вариант 01 используется общим `UiIcon`.
Windows x64 / Chrome 155: gallery 16/18/20/24/32 px при DPR 1/2, focus/disabled
и RU/EN × light/dark passed. WebView2 155.0.4283.45: production Capture → Quick
→ Editor, выбор выноски по O и кликом, история и sampling — 1/1 passed.
Native Quick и RU/dark editor screenshots просмотрены; команды и ограничения
общих проверок — TESTING.md. WebKitGTK/WKWebView runtime pending.

## Иконки настроек выноски (2026-10-18)

`REQ-TOL-007`, `REQ-EDT-016`, `REQ-UI-001/003/006`: создать выноску обычным
drag, ввести подпись и подтвердить Ctrl+Enter. Selection-панель содержит
пять компактных кнопок в одном ряду: схема маршрута, оба наконечника,
штрих с толщиной, значок оформления подписи и значок текста с размером.
Названия и длинные значения доступны в RU/EN title и accessibility description.
Проверить 1024 px, обе темы и 50/100/200%, открытие настроек и Escape с возвратом
фокуса. При mixed вместо значений первого объекта показано «—»; locked/read-only
блокирует все кнопки. Результаты, screenshots и пределы проверки — TESTING.md.

## Компактная ширина выноски (2026-10-18, ADR-103)

`REQ-TOL-007`, `REQ-EDT-016`, `REQ-UI-001/003/004/006`: создать выноску
drag-жестом и начать ввод. Строка форматирования содержит одну выровненную
кнопку «Ширина / По тексту»; поле px и «По содержимому» доступны в dropdown.
Пояснение раскрывает рост до 480 px и перенос строк. Задать 300 px, набрать
720 без подтверждения и нажать Escape: остаются 300 px, inline-сессия открыта,
фокус возвращается кнопке. «По содержимому» возвращает auto-size. Проверить
минимум в один em, read-only, закрытие соседних popover, RU/EN, light/dark,
1024 px и 50/100/200% без перекрытия текста dropdown. Фактические команды,
browser/native evidence и ограничения — TESTING.md.

## Chrome при изменении Quick-рамки (2026-10-18, ADR-102)

`REQ-UI-010`, `REQ-CAP-012`: Capture → Quick → Pencil → удерживать resize handle
и сузить область до 180 CSS px. Actions, ToolRail и defaults скрыты, рамка и
размер видны. Отпускание возвращает панели; одна Undo/Redo восстанавливает
границы. Escape при следующем resize возвращает исходную рамку и chrome,
сохраняя Quick открытым. Pointercancel/blur также восстанавливают chrome;
рисование Pencil не скрывает панели. Результаты и платформы — TESTING.md.

## Общая тема окна настроек (2026-10-18)

`REQ-UI-001/002`, `REQ-ACT-008`: Windows 10 x64 / WebView2 155.0.4283.45,
external driver — 2/2 tests passed. Production editor → Settings показывает
dark tokens для фона, текста, sidebar, footer, кнопок и scrollbar; открытое
окно обновляется dark → light → dark и сохраняет dark после закрытия/открытия.
Снимки: `artifacts/settings-theme-webview/settings-general-dark.png`,
`artifacts/settings-theme-webview/settings-shortcuts-live-light.png`.
Component tests 8/8 passed, включая system media change и cleanup.
Linux/WebKitGTK и macOS/WKWebView runtime для этой правки pending.

## Нулевое скругление изображения (ADR-097)

REQ-TOL-015: импортировать через G изображение 4K, задать рамку 26 и 32 px.
При radius 0 все четыре внешних угла прямые; положительный radius скругляет
изображение, возврат к 0 восстанавливает прямые углы. Undo/redo возвращает
точные значения и pixels. Проверить в Editor/Quick и повторно декодированном
экспорте; старый border.join=round не добавляет скругления. Фактический статус — TESTING.md.

## Линия (ADR-100)

REQ-TOL-017: выбрать L, сделать несколько ровных подчёркиваний без Shift,
выключить привязку, нарисовать диагональ, проверить Shift 45° и Alt от центра.
V и щелчок открывают два конца и цвет/обводку. Проверить mixed/locked/read-only,
короткий жест, Escape/blur/pointercancel, один undo/redo, Z для лупы.
Quick с non-origin crop → Editor → reopen сохраняет lines/defaults; экспорт
повторно декодируется. RU/EN × light/dark × 1024 px × zoom 50/100/200%.

## Выбор окна без перекрытий (2026-10-18, ADR-091)

`REQ-CAP-003/008/010/015`: запустить Window из tray/hotkey/CLI. До движения
указателя видны рамка кандидата и подсказка выбора окна. Проверить empty click,
Enter, Tab/Shift+Tab, перенос primary pointer на другое окно, Escape и повтор.
Окно под частичным перекрытием снимается целиком: в повторно декодированном PNG
есть скрытые контрольные pixels, нет соседнего приложения и capture chrome.
Нативный original открывается обычным document mount без Quick. Закрытие окна,
недоступный backend и permission denial дают recovery; Area запускается только
явной кнопкой. DPI/несколько мониторов и платформы без runtime evidence pending.
Windows 10/WebView2: production mount, initial hover, Escape/retry, click,
Tab/Shift+Tab/Enter и EN/dark + RU/light прошли; decoded 1386×893 PNG сохранил
pixels за перекрывающим окном. Остальные пункты матрицы выше pending.
Фактические команды и результаты — TESTING.md.

## Заливка и пунктир фигур (2026-10-18, ADR-092)

REQ-TOL-002: none/solid/linear представлены образцами. Проверить 2–8 точек,
цвет/позицию/alpha, общую opacity, угол и разворот, Escape при перетаскивании,
disabled/mixed, групповую batch-команду и undo/redo. Старый radial документ
сохраняет отображение; новый выбор radial отсутствует. Все фигуры поддерживают
solid/dashed/round dotted. Canvas2D/CanvasKit exports повторно декодируются.
Windows browser RU/EN × light/dark × 1024/1280 и реальные Quick → Editor →
reopen проверяются отдельно; команды, результаты и ограничения — TESTING.md.

## Живой взгляд бренда (ADR-093)

`REQ-UI-013`, `REQ-WEB-001/002`, `REQ-QLT-003`: в RU/EN шапках сайта и
редактора навести на значок, дождаться взгляда влево/вправо и перейти на
название: глаза следуют, приветствие не повторяется. Уход во время любого
этапа возвращает прищуры; повторный вход снова приветствует. Touch и reduced
motion статичны. Переключение reduced motion, blur и hidden отменяют движение.
Неподвижный курсор и idle не держат rAF; unmount освобождает ресурсы.
Проверить знак 30 px в editor light/dark, 36/31 px на landing, без новых focus
stops и изменения ссылок; при отключённом JS работают знак, языки и якорь.
Доказательства browser и настоящего WebView фиксируются отдельно в TESTING.md.

## Подписи кнопок и закрытие истории (2026-10-18)

`REQ-UI-001/003/006`: «Открыть изображение» / «Open image» в верхней
панели и пустом холсте показываются без многоточия; tooltip и accessible
name верхней кнопки используют ту же подпись.

`REQ-UI-001/006`, `REQ-LIB-013`: на 1024 px в RU/EN × light/dark открыть
историю и дроп настроек. «Очистить»/«Хранение»/«Настройки приложения»
видны полностью без многоточий; accessible names совпадают с подписями.
Крестик — UiIcon close 18×18 px в кнопке 32×32 px, центрирован и имеет
видимый клавиатурный фокус. Закрыть крестиком и Escape: фокус на trigger.
Очистка по-прежнему требует подтверждения, cancel не удаляет снимки;
pending/disabled/error и многоточия progress-сообщений сохраняются.
Проверки: Vue/browser и Windows WebView2 history-settings/editor-settings;
команды, screenshots и фактические ограничения — TESTING.md.

## Два режима карандаша и краткие подсказки (ADR-094)

В defaults, selection и group pencil доступны только точное перо и автокоррекция.
Exact pen отключает коррекцию; возврат к автокоррекции восстанавливает её значение.
Старый default brush выбирает автокоррекцию с её памятью либо 65%.
Открыть legacy/v2/v3 expressive strokes, включая hidden/locked: все заменяются
автокоррекцией одной отменяемой командой, без изменения samples/spans/appearance/
transforms. Проверить undo/redo, save failure/retry и reopen без повторной миграции.
Read-only сохраняет прежний документ. Preview/export повторно декодировать на 4K.
В RU/EN tooltip инструментов только имя/shortcut, без Shift/45°; настройки линейки
не содержат этих пояснений. Shift/Alt и функциональные поля угла работают.
Проверить Quick → Editor → reopen, обе темы и 1024 px. Исторический контракт
трёх кистей ADR-060 ниже заменён этим решением; платформы — PLATFORM_MATRIX.md.

## Доработка выноски (ADR-090)

Создать выноску и подтвердить пустой ввод: линия сохранена, оформление скрыто.
Двойной клик по линии → ввести текст → удалить текст → undo/redo восстанавливают
подпись и оформление. Escape нового ввода не создаёт объект.
В маршруте только Line/Stepped; bend handle изгибает Line, Straighten возвращает
прямую с прежними endpoints. Auto и четыре кнопки позиционируют подпись; accent
зеркалится по target tangent. Контур ширины охватывает только текст и не экспортируется.
Добавить три ступени и Alt-click удалить среднюю: минус/preview до commit,
endpoints неподвижны, один undo возвращает маршрут. Проверить Escape, lost capture,
release Alt, превышение drag threshold и минимальный маршрут. Без Alt — обычный drag.
Endpoint SVG, size/color без disclosure, штрих в trigger и текстовый width/Auto
проверяются через production Editor/Quick, locked/read-only/mixed и RU/EN.
Исторические проверки ADR-087 ниже читаются с поправками ADR-090.
Windows: focused 76/76, render 46/46, Chrome 4 specs / 5 tests и WebView2 2/2
с production Quick/Editor/reopen пройдены; команды и ограничения — [TESTING.md](TESTING.md).
WebKit/macOS этим прогоном не подтверждены.

## Диапазоны изображения (2026-10-18, ADR-089)

Через G вставить 4K изображение. Скругление довести до максимума:
для 3840×2160 это 1080 px (капсула), для 3840×3840 — 1920 px (круг).
Рамку довести до 32 px, проверить видимые края. Один undo возвращает рамку,
следующий — скругление; redo точно восстанавливает оба параметра.
Промежуточный numeric preview не меняет документ. Платформы — PLATFORM_MATRIX.md.

## Управляемые выноски (ADR-087)

Создать выноску drag target → label, ввести multiline rich text и подтвердить:
одна команда создаёт Г-линию, target dot и карточку без второго кружка.
Перетащить подпись через target — target и сторона подключения не меняются.
За рамку/ручку переноса двигается весь объект. «Маршрут → Добавить ступень»
показывает ручки «+»; drag добавляет ортогональный участок, Escape отменяет.
Проверить ручной сегмент, удаление ступени, сброс и undo/redo.

Независимо изменить обе конечные метки, их цвет/размер, обводку и оболочку
Текст/Рамка/Карточка/Капсула/Акцент. Locked/read-only блокируют редактирование,
mixed selection показывает смешанное оформление. Прежние payload открываются
без новых полей или команд истории. Проверить сохранение/new launch, Quick с
non-origin crop и переход в Editor. Команды и фактические результаты — TESTING.md;
пользовательская проверка интуитивности и WebKit не подменяются автотестами.

## Панель изображения и непрерывные жесты (ADR-086)

`REQ-TOL-015`, `REQ-EDT-005/006/016`, `REQ-UI-006/007`: G → вставить 4K PNG.
У выделения ровно три компактных контрола; рамка раскрывает толщину и палитру,
«Свой цвет» — HEX/пипетку. Проверить ввод, один undo на commit, Escape без commit,
focus к кнопке, mixed и locked/read-only. Полоса и раскрытая панель оставляют
изображение и handles видимыми при наличии свободного места.

Нажать и удерживать на изображении: пиксели не меняются. Переместить, изменить
размер и повернуть; сохранить кадр до pointerup и сравнить с committed frame.
Undo возвращает исходные pixels/document, Redo — итоговые; Escape и pointercancel
не пишут историю. Повторить в Editor/Quick, crop с ненулевым origin, zoom,
1024/1600 px, RU/EN и light/dark. Source pixels и immutable blob неизменяемы;
PNG export повторно декодировать. Фактическая проверка и ограничения — TESTING.md.

## Хранение из истории (2026-10-17)

`REQ-LIB-002/012`, `REQ-UI-006/008`: открыть историю → «Хранение».
Settings показывает раздел истории, доступные лимиты и отчёт об объёме.
Перейти в General, повторить вход из истории: используется то же окно,
раздел снова History. Закрыть кнопкой окна настроек, открыть и закрыть повторно;
main editor продолжает отвечать. Автоматизация: native `history-settings`,
фактический результат и артефакты — TESTING.md.

## Выбор и перенос за рамку (ADR-085)

`REQ-EDT-019`, `REQ-EDT-004/005/006/016`: создать стрелку обычным drag,
снять выделение, захватить рядом с контуром и сразу переместить. Щелчок
с дрожанием менее 4 CSS px не меняет документ. После выбора пустая часть
пунктирной рамки перемещает объект, endpoint изменяет только геометрию.
Прямое попадание по соседнему объекту выигрывает у рамки; один лишь допуск — нет.
Выделить несколько объектов: рамка, preview и commit перемещают весь набор.
На маленькой фигуре проверить move grip 28×28, фокус, Arrow/Shift+Arrow,
отмену и undo/redo. Проверить locked/read-only и активный инструмент создания.

Browser: RU/EN × light/dark × 25/100/400%; native: production Capture →
Quick с non-origin crop → Editor, trusted pointer/keyboard. Команды и evidence
в TESTING.md; платформы без runtime-проверки остаются pending.
Windows результат: Chrome matrix 12/12 и WebView2 1/1 passed. Native проверка
всех zoom/theme/locale комбинаций pending; общий gate имеет сторонние failures.

## Предпросмотр пипетки после наведения (2026-10-17)

`REQ-TOL-012`: открыть документ обычным capture → Editor flow, нажать пипетку
в ToolRail. Пока указатель остаётся на кнопке, карточка отсутствует на холсте.
Переместить указатель на canvas — появляется live preview; вернуть на кнопку —
карточка скрывается. Повторная активация не показывает старую точку. ArrowRight
показывает keyboard preview, Enter выбирает цвет, Escape отменяет sampling.
Тот же контракт действует при вызове из палитры. Команды и evidence — в `TESTING.md`.

## Дроп настроек редактора (ADR-083)

В main editor отсутствует «Снимок окна» даже при доступной capability; Undo
и Redo соседние. Шестерёнка перед Export открывает тему, язык, отражения и
«Настройки приложения». RU/EN и light/dark сохраняются после reload; выбор
оставляет панель открытой. Отражения закрывают дроп и поддерживают Undo/Redo.
В empty/loading/read-only отражения disabled, настройки оформления доступны.
В браузере native Settings disabled с объяснением; pending исключает повтор,
error оставляет retry. Escape возвращает фокус, Tab проходит controls,
Enter/Space открывают, outside click закрывает. На 1024/1600 controls не
обрезаны; при малой высоте panel scrolls. Из настоящего Windows WebView2
Settings открывается, сохраняет раздел при повторном вызове и остаётся singleton.
Фактические результаты и платформенные ограничения — TESTING.md.

## Windows cold capture / Editor (ADR-082)

Первый Area после запуска: первый показанный scene уже соответствует
fullscreen Fit, без кадра в предыдущем масштабе. Выделение → Editor одним
кликом показывает main с выбранным документом и скрывает Quick. До выбора
main драйвером проверить native visibility, иначе WebDriver может скрыть
регрессию самостоятельным показом окна. Escape → повтор и CLI/tray Show
после capture также должны возвращать main. Фактические результаты — TESTING.md.

## Вставка изображений (2026-10-17, ADR-081)

`REQ-TOL-015/016`, `REQ-EDT-002/003`: G/кнопка вставляют один PNG/JPEG/WebP/SVG
в центр видимой области; bitmap paste выделяет новый слой; drop использует
точку отпускания. Большой источник вписывается в 80% области, маленький не
увеличивается. Один Undo/Redo удаляет/возвращает слой. Проверить 1024 px,
zoom/pan, non-origin crop, RU/EN и light/dark, Quick после выбора области.
Отмена, decode error, смена session и несколько dropped файлов не создают слой.
Drop поверх панелей игнорируется; empty drop создаёт документ. После перезапуска
ресурсы восстанавливаются; Copy PNG повторно декодируется через native clipboard.
Фактические результаты и границы автоматизации — TESTING.md.

## Лендинг: демонстрация и инструменты (2026-10-17)

`REQ-WEB-001/002/003/004`: открыть готовую статичную сборку под `/cute-screen/`
на RU/EN при viewport 375/768/1024/1440 px. Вверху один бренд; hero показывает
предоставленный снимок вымышленной админки с нанесёнными аннотациями на планшете
и десктопе. На мобильной ширине до 760 px снимок скрыт, а панель инструментов
доступна отдельной горизонтальной прокруткой, без overflow страницы. Ниже
доступны 16 описаний с оригинальными иконками. Tab/Enter открывают якорь и
языковые ссылки; стрелки прокручивают панель на телефоне. Production
preview не содержит scripts или desktop bundle. Browser passed; GitHub Pages
deploy и нативные функции приложения этим изменением не проверяются.

## Пропорции указателя лупы (2026-10-17, ADR-079)

`REQ-TOL-011`: создать лупу жестом, изменить размер на 256/512 px и рамку
на 8 px. При 512/8 линия имеет 5.2 document px и наконечник 25.6 px;
наконечник различим в уменьшенном viewport. При border=0 указатель остаётся.
Проверить circle/rectangle, светлый/тёмный фон, preview/export 1×/2×,
отсутствие рекурсивного sampling стрелки, source внутри линзы, Escape числового
preview и undo/redo изменений size/border. Исходный документ и IPC не расширяются.
Фактические результаты, команды и платформенные ограничения — TESTING.md.

## Однозначное выделение пресетов (2026-10-17)

`REQ-EDT-015/016`, `REQ-UI-006/007`: открытие числовых настроек линейки
с 4 px / 24 px фокусирует выбранный пресет; первая кнопка не получает
ложную подсветку. Для 5 px и mixed focus находится в поле ввода без выбранного
пресета. Аналогичный приоритет применяется к карандашу, подсветке, выделителю,
лупе и палитре. Vue проверяет focus без change/commit при открытии; browser
проверяет pointer/Enter reopen, Escape и fit при 1024 px, RU/EN × light/dark.
Снимки просмотрены; команды и platform limits — TESTING.md.

## Понятные настройки линейки (2026-10-17, ADR-076)

`REQ-TOL-010`, `REQ-EDT-006/015/016/017`, `REQ-UI-006`: в Editor и Quick
панель остаётся одной строкой: цвет, пиктограмма толщины с px, Aa с px,
прямой разделитель, пиктограмма линейки и результат с базой процентов.
Размер текста не содержит единиц измерения. В меню измерения доступны Pixels,
% ширины, % высоты и % диагонали, фактический crop/canvas с размерами,
отдельные длина/угол с копированием и объяснение Shift/Alt. На линии и в PNG
сохраняется короткая подпись без базы. Смена режима — один undo/redo;
crop пересчитывает значение и badge geometry. Повторное открытие сохраняет
режим; locked/read-only блокируют правки, копирование остаётся доступным.
При 1024 px RU/EN × light/dark значение и база полностью видны без меню.
Фактические результаты и ограничения — TESTING.md.

## Меню других действий (2026-10-17)

`REQ-UI-001/002/003/004/006`: открыть меню TopBar в RU/EN и light/dark,
при ширине окна 1024 и 1600 px. Длинные подписи целиком внутри поверхности,
пункты выровнены слева, меню внутри viewport. Наведение показывает одну
подсказку, открытие меню скрывает её. Выбор темы/языка закрывает меню и
применяется сразу; на пустом холсте отражение недоступно.
Focused browser evidence: 4/4 passed, восемь визуальных комбинаций;
детали и ограничения общего gate — TESTING.md. Native re-smoke pending.

## Shift для линейки (2026-10-17, ADR-074)

`REQ-TOL-010`, `REQ-EDT-005/006`: в Quick и Editor нарисовать линейку
с ShiftLeft/ShiftRight: ближайшие 0/45/90° и противоположные направления.
Нажать и отпустить Shift посреди drag без движения мыши: preview сразу
переключается, без Shift возвращается raw endpoint. Повторить с Alt и обоими
модификаторами: Shift имеет приоритет, после его отпускания остаётся Alt.
Повторить для каждого endpoint, включая край canvas; другой конец фиксирован.
Undo/redo меняет весь жест одним шагом; Escape/blur/pointercancel отменяют draft.
Tooltip RU/EN содержит имя и shortcut без пояснений Shift/45° (ADR-094).
Результаты и ограничения — TESTING.md.

## Прямые разделители тулбаров (2026-10-17)

`REQ-UI-001`: активировать Shape/Highlighter, открыть настройки и выделить
фигуру. Разделители — прямые центрированные линии 1×21 CSS px; углы кнопок
остаются скруглёнными. Browser RU/EN × light/dark × 1024/1280 и настоящий
Linux/X11 WebView Capture → Quick → Editor прошли. Геометрия, скриншоты и
ограничения остальных E2E — TESTING.md, `artifacts/toolbar-separators/`.

## Кнопки формы фонаря (2026-10-17, ADR-072)

`REQ-TOL-009`, `REQ-EDT-015/016`, `REQ-UI-006`: выбрать фонарь — в панели
сразу доступны иконки rectangle/ellipse/diamond без меню. Click и Tab/Space
меняют выбранную форму; подсказки и accessible names локализованы.
На 1024 px RU/EN × light/dark группа помещается над ToolRail. После создания
форма выбранной области меняется одной undoable command; locked/read-only
блокирует кнопки. Повторить в Quick Capture и editor. Результаты — TESTING.md.

## Чёткие края фонаря по умолчанию (2026-10-17, ADR-071)

`REQ-TOL-009`, `REQ-EDT-015`: в новом workspace выбрать фонарь. Панель
показывает «Чётко»/«Sharp» в RU/EN; созданный drag-жестом слой имеет
`feather: null`. Повторить в Quick Capture и editor. Явно выбранные мягкие
края и существующие слои сохраняют настройки. Результаты — TESTING.md.

## Физические буквенные shortcuts редактора (2026-10-16, ADR-064)

`REQ-EDT-003/005/006/016`:

1. В editor создать или выбрать объект. На английской, русской и другой
   нелатинской раскладке нажать физические Ctrl/Cmd+Z и Ctrl/Cmd+Shift+Z:
   history отменяется и повторяется одинаково.
2. На тех же раскладках проверить Ctrl/Cmd+O/D/C/X/V и Ctrl/Cmd+Alt+C/V.
   Открытие, duplicate, clipboard и style clipboard реагируют по позиции
   латинской клавиши, без добавления Ctrl+Y/Ctrl+S/Ctrl+A.
3. В input, contenteditable и во время IME composition команды редактора не
   перехватывают ввод. Уже обработанное событие не выполняется повторно.
4. Browser E2E создаёт объект через видимый UI, затем выполняет Undo, Redo и
   Duplicate native keyboard input. Real Tauri фиксирует отдельно платформу,
   системную раскладку и trusted input; непроверенные WebViews не получают claim.

## Новая панель текста (2026-10-16, ADR-061)

`REQ-TOL-005/006/007`, `REQ-EDT-005/008/016`, `REQ-UI-001/005/006/007`:

1. Text/Callout/Numbered Marker используют общую панель; три alignment buttons
   заменяют select, B/I/strike/list/background используют UiIcon.
2. На 640/1024/1440 px группы остаются видимыми без horizontal overflow;
   на узкой ширине они переходят на две строки. RU/EN, dark/light проверены в Chrome.
3. Меню содержит 12 bundled family, собственные образцы и loading/error/retry;
   hover не меняет документ, Home/End/стрелки/Enter/Escape доступны с клавиатуры.
4. Цвет текста применяется через общую палитру. Background colour остаётся
   в общем Apply/Cancel draft; numbered marker сохраняет disabled restrictions.
5. Выделенный диапазон сохраняется при работе с popover; inline editing
   подтверждается одной command, undo возвращает предыдущий document.
6. Все 12 font family проверены в browser через реальное меню, Latin/Cyrillic и
   decoded PNG. Четыре renderer goldens используют реальные subset assets;
   цифры у Cyrillic не превращаются в отсутствующие glyphs.

Browser и component evidence — TESTING.md. Native Tauri/WebKitGTK показывает
панель без overflow, но inline gesture не создаёт contenteditable в текущем
embedded-driver прогоне; native edit и Quick handoff не подтверждены. Windows,
macOS и Wayland отдельно не проверялись.

## Немедленное применение кропа (2026-10-16)

`REQ-TOL-013`, `REQ-EDT-005/006`, `REQ-UI-005`: открыть Crop, выбрать 1:1,
сдвинуть рамку и нажать Apply либо Enter. Сразу видны cropped viewport и Select,
без затемнения/handles кропа и дополнительного Cancel/Select. Проверить Undo/Redo,
повторное открытие с другой рамкой → Cancel/Escape, Reset → Escape и
Reset → Apply. Подтверждённый crop сохраняется при отмене; аннотации и original
не заменяются. Enter на сфокусированной кнопке Cancel именно отменяет draft,
Tab достигает Apply с видимым focus ring. Панель выше ToolRail: select и кнопки
32 px, центры по одной линии, Apply справа; RU/EN, light/dark и окна
1213×724 / 1024×700 без обрезания controls. Фактические результаты и ограничения
browser/real WebView — TESTING.md и PLATFORM_MATRIX.md.

## Линейка внутри холста и crop (2026-10-16, ADR-059)

`REQ-TOL-010`, `REQ-EDT-005/006`: создать линейку, перетащить её за верхний/правый
край, затем конец за нижний/правый. Оба endpoints остаются внутри; move сохраняет
длину и удерживает badge внутри, когда он помещается. Во время удержания pointer
документ не меняется; Escape и pointercancel отменяют draft. Нажатия стрелок
у края не добавляют history. Применить меньший non-origin crop, пересекающий
линейку: она сдвигается внутрь, при необходимости сокращается с сохранением
направления и style. Undo/Redo изменяют crop и линейку одним шагом, точно
восстанавливая прежний документ. Locked/hidden rulers подгоняются также.
Core property regression проверяет 1000 rotated/reflected crops, включая 1 px;
Chrome 1280/1024 — 2/2 и production WebKitGTK Capture → Editor — 1/1;
скриншоты просмотрены. Unit 750/750, render 20/20 и `pnpm check` — passed.
Фактические команды, native input evidence и ограничения — TESTING.md.

## Фонарь в Quick и editor (2026-10-16)

`REQ-TOL-009`, `REQ-EDT-005/006`, `REQ-OUT-003`: из production Capture выбрать
фонарь, начать drag и удерживать кнопку. Затемнение уже видно, центр области
сохраняет исходные pixels, layers/history до release неизменны. После создания
переместить область при удерживаемой кнопке: старый центр затемняется, новый
центр открывается до release. Undo возвращает прежнее положение, redo повторяет
move. Двойной клик включает aperture editing; drag/Escape восстанавливает маску
без команды. Повторить после handoff в Editor. Linux external WebKitGTK и Chrome
прошли; 4K/8K decoded renderer evidence — отдельно. Команды, размер native fixture
и платформенные ограничения — TESTING.md.

## CI без подготовленных artifacts и macOS baseline (2026-10-16)

`REQ-REL-001/002/003`: driver-cache boundary test проходит в workspace без
`artifacts`; общий `pnpm test:boundaries` — 41/41 на Linux. Для `REQ-REL-002`
прямой `cargo check --workspace --all-targets` на macOS Intel/ARM должен
использовать deployment target 12.0 и компилировать Objective-C bridge
с Xcode 16.4. Согласованность Cargo/Tauri settings проверена boundary test;
native compile и capture smoke на macOS остаются pending. Команды — TESTING.md.

## Резкость линейки (2026-10-16, ADR-058)

Создать горизонтальную и наклонную линейку; сравнить подпись при 100/160/200%
и DPR 1/2. Glyph raster учитывает масштаб экрана, persisted font size и длина
не меняются от zoom. Проверить draft, выбор/endpoint drag, crop с non-origin,
undo/redo, пипетку и выделитель. PNG сохраняет document dimensions, immutable
original остаётся чистым. На экстремальном zoom действует pixel budget ADR-058.
Windows browser, pixel tests и WebView2 production fake Capture → Quick → Editor
пройдены; команды, initial failures и остальные gates — TESTING.md.

## Единое числовое поле (2026-10-16)

`REQ-UI-001/002/003/004/006/007`: создать линейку и открыть «Подпись и единицы».
Значение, px и −/+ находятся внутри одной рамки высотой 32 px; кнопки не
выступают сверху/снизу. Проверить точный ввод, оба шага и Escape в editor/Quick,
RU/EN × light/dark при 1024/1280 px. Существующие numeric component tests
проверяют mixed, disabled, invalid draft и границу commit. Evidence — TESTING.md.

## Центр поворота (2026-10-16)

`REQ-EDT-005/006/009/013`: создать фигуру и стрелку через ToolRail, повернуть
внешней угловой зоной с Shift на 90°. Центр локальной рамки остаётся в прежней
точке canvas во время preview и после release; документ до release неизменен.
Undo восстанавливает исходную геометрию одним шагом, redo повторяет поворот.
В editor ввести 180° в Layers, отменить Escape, повторить с Enter и undo/redo.
Пройдены Chrome и WebView2; native Capture → Quick → Editor, ввод trusted.
Core дополнительно проверяет non-origin bounds, начальный поворот, image scale,
отражения и отсутствие дрейфа при неизменном угле. Команды — TESTING.md.

## Панель после переключения лупа → фонарь (2026-10-16)

`REQ-EDT-016`, `REQ-TOL-008/009/011`: создать лупу и фонарь, несколько раз
переключить выделение кликами на canvas. Панель соответствует текущему объекту;
изменение затемнения меняет только фонарь. Выбор не создаёт history entries.
Mounted-shell regression также проверяет лупа ↔ цензура и отсутствие renderer
exceptions. Browser и WebView2 результаты — TESTING.md.

## Компактные настройки лупы (2026-10-16)

`REQ-TOL-011`, `REQ-EDT-015/016`, `REQ-UI-001/003/004/006/007`:
из production Capture создать лупу в Quick, изменить size, shape, border и
shadow; проверить numeric cancel, focus return и Undo/Redo, затем повторить в
editor после handoff. ПКМ defaults меняет zoom/size для следующего создания.
Browser matrix: 1024/1280 px × RU/EN × light/dark, все четыре меню внутри
viewport, без горизонтальной прокрутки. Locked/unlock — существующий mounted-shell
regression. Фактические команды и результаты: TESTING.md.

## Карандаш, фонарь и линейка (ADR-056)

Из production mount в editor/Quick создать штрих, составной фонарь и линейку.
Проверить четыре компактных контрола, numeric preview/cancel, один history step,
индивидуальные move/resize/remove областей, маску пересечений, Alt endpoints,
копирование длины/угла и clipboard failure. Повторить при non-origin crop,
zoom, 1024 px, RU/EN, light/dark. Dedicated Chrome и WebView2 flow, unit/core,
decoded exports обоих backend и production-shaped 4K/8K пройдены на Windows;
команды и артефакты — TESTING.md. WebKitGTK/WKWebView остаются pending.

## Проектные иконки рядом с Tabler (2026-10-16, ADR-055)

Лупа использует выбранный B1: сегментированная рамка исходной области и круглая
лупа с ручкой. Проверить её в gallery, пустом editor и при выборе клавишей L
в RU/EN, обеих темах, затем в production Quick → Editor. Кнопки zoom сохраняют
собственные обозначения. Команды и фактические результаты — TESTING.md.

1. Открыть `pnpm icons:preview` → `/icons-preview.html`: выделитель вертикальный,
   скошенным пером вверх, с короткой обоймой и широкими округлыми плечиками;
   карандаш имеет остриё, пипетка — округлую грушу и наполненную трубку с круглым
   концом. «Скрыть данные» — цельная шахматная мозаика 3×3, плотные клетки 100%
   и светлые 15%, без связи с полем пароля. Фонарь — чистое прямоугольное окно на равномерной штриховке 45°;
   штрихи касаются контура, без зазора. Проверить 16/18/20/24/32 CSS px при DPR 1/2, обе темы и состояния
   кнопок. При 18 px метафоры должны различаться без подписи и цветовой подсказки.
2. В editor при 1024 px проверить RU/EN × light/dark, disabled в пустом состоянии,
   доступные имена, focus и неизменный размер hit area. Соседние Tabler сохраняются.
3. Через Capture → Quick → Editor выбрать цвет пипеткой, нарисовать карандашом
   и выделителем, выполнить undo/redo и переключение клавишами. Смысловые имена
   инструментов и document history не зависят от источника иконки.

Windows x64: финальный gallery/browser evidence пройден, включая принятую
иконку фонаря «Встык». Dedicated WebView2 Capture → Quick → Editor после
подключения этой геометрии — 1/1; sampling, drawing, history, trusted keyboard
и выбор фонаря сохранены. Команды и артефакты — TESTING.md.
Для позднее подключённой шахматной мозаики цензуры SVG/browser прошли;
финальный WebView2 handoff pending из-за перекрытия Select настройками цензуры
в Quick. Не переносить прежний native pass фонаря на эту замену.

## Числовые controls и компактные пресеты (2026-10-16, ADR-054)

1. Создать фигуру, открыть «Наложение → Непрозрачность», удерживать слайдер:
   canvas обновляется, committed document/history/preferences сохраняются.
   Отпустить: одна команда, undo/redo воспроизводит результат. Escape во время
   ввода и pointercancel восстанавливают исходный вид без новой команды.
2. Сравнить поле, слайдер и группы пресетов; нестандартное/mixed значение
   не активирует готовую кнопку. Повторный пресет не добавляет history.
   Проверить запятую/точку, ошибки, единицы, Arrow/Shift, Home/End, read-only.
   Прокрутка панели не меняет значение; смена selection/document отменяет draft.
3. В inline text выделить диапазон с разным форматированием: preview размера
   сохраняет диапазон, spans и typing style. Размеры 16/24/32/48/64 остаются
   в открытой компактной группе. Фон текста подтверждается общим Apply/Cancel.
4. Повторить production Capture → Quick → Editor, non-origin crop, RU/EN,
   light/dark и окно 1024 px. Панели и результат остаются видимыми. Масштаб,
   Fit и 1:1 сохраняют прежнее поведение.

Windows browser и настоящий WebView2 проверены; 4K render test повторно
декодирует PNG и сравнивает его с preview/commit без различий. Команды,
количество тестов и ограничения — TESTING.md. Linux/macOS/WebKit для этого
изменения остаются pending; fake capture не подтверждает физический захват.

Дополненный общий Quick native gate имеет failures переключения sampling и
создания стрелки. Они остаются открытыми; первый успешный прогон не заменяет
финальную проверку. Numeric opacity в Quick/editor и inline background имеют
отдельное runtime evidence; подробности и конфликт параллельных сборок — TESTING.md.

## Вложенные настройки после выделения сноски (2026-10-16, ADR-053)

Создать большую сноску обычным drag и вводом текста, подтвердить её и открыть
Shape через ПКМ. Переключить «Наложение → Обводка → Наложение»: вложенная
панель остаётся рядом с кнопкой, а при неизбежном пересечении большого объекта
минимизирует перекрытие поблизости. Escape закрывает только submenu и возвращает
focus, следующий Escape закрывает defaults. Документ и выделение сохраняются.
Проверить browser и настоящий WebView2 в Quick/editor; фактические результаты
и ограничения — TESTING.md.

## Ровная палитра и плавный custom swatch (2026-10-15)

В drawing palette два полных ряда по десять образцов, custom action находится
справа за разделителем. Между цветными кругами 10 px; selection/focus ring
не касается соседнего образца. В highlighter остаётся один ряд из восьми цветов.
Custom swatch — плавный градиент внутри круга, без секторного рисунка и цветных
краёв кнопки. Проверить light/dark, RU/EN, selection/defaults, embedded
stroke/fill, keyboard и закрытие палитры без скачка. Evidence — TESTING.md.

## Закрытие палитры без скачка (2026-10-15)

`REQ-EDT-008/015/016`, `REQ-UI-003/006/007`: создать стрелку обычным gesture,
открыть цвет в selection toolbar и выбрать образец. Панель исчезает на месте,
фокус возвращается на trigger, Undo восстанавливает цвет. Повторить Escape.
Для выделителя в Quick и editor проверить также click outside и custom HEX.
Измерять каждый animation frame до скрытия панели: её координаты не должны
сбрасываться в `(0, 0)` во время leave transition. Результаты — TESTING.md.

## Курсоры точек кропа (2026-10-15)

`REQ-TOL-013`, `REQ-UI-005`: открыть Crop на полной рамке и с preset 1:1.
Навести на каждый угол и середину каждой стороны: NW/SE — `nwse-resize`,
NE/SW — `nesw-resize`, N/S — `ns-resize`, E/W — `ew-resize`. Внутри рамки —
`move`; Escape отменяет draft без изменения документа. Shared browser/native
helper `crop-cursors.ts` проверяет все восемь точек и центр через pointer input.

## Курсор карандаша и выделителя (2026-10-15)

Расширение `REQ-TOL-006`, обновлено 2026-10-17 (ADR-067): выбрать Numbered
marker — полупрозрачная метка заменяет крест, сохраняется при движении над
объектами и возвращается после временного pan средней кнопкой.

`REQ-TOL-003/004`, `REQ-UI-005`: в editor и Quick Capture выбрать Pencil,
затем Highlighter. На холсте сразу появляется `crosshair` и сохраняется при
наведении на существующие объекты и во время штриха. При удержании средней
кнопки курсор становится `grabbing`, после отпускания возвращается крест.
Переключение на Hand показывает `grab`, на Select — обычный курсор/курсор
объекта. Автоматизированный общий сценарий — `highlighter-toolbar.ts`;
фактические результаты и платформы — TESTING.md.

## ToolRail без дополнительной стрелки

`REQ-EDT-015`, `REQ-UI-001/006/007`, ADR-052: выбор инструмента не добавляет
кнопку `⌄`. ПКМ на самой иконке открывает defaults, вложенные controls работают,
Escape закрывает настройки и сохраняет Quick Capture. Клавиатурные входы
Shift+F10/ContextMenu остаются на кнопке инструмента. Проверки — существующие
tool-ux и quick-chrome; платформа, результаты и screenshots — TESTING.md.

## Выделитель и простые палитры

`REQ-TOL-004`, `REQ-EDT-008/015/016/017`, ADR-051:

- Свёрнутый режим: образец 36×24 px и «Темнее / Светлее / Окрасить» показывают
  результат без открытия меню. Авто показывает resolved effect; pending и mixed
  имеют нейтральный образец. Текущие цвет/интенсивность совпадают с меню.
  Проверить tooltip/доступное описание, RU/EN, обе темы, 1024 px, Quick/Editor;
  decoded screenshot должен подтверждать затемнение светлого и осветление тёмного фона.

- Светлый документ с чёрным текстом: «Выделить» сохраняет чёрные пиксели.
- Тёмный терминал с белым текстом: «Подсветить» сохраняет белые пиксели.
- Фото/смешанный фон: «Окрасить» явно окрашивает также текст.
- Авто анализирует весь original один раз после первого frame; поздний результат
  действует только на следующие штрихи. Проверить 4K/8K, pending, unsupported,
  error, timeout и смену документа; UI остаётся доступным.
- Проверить preset/custom colour, HEX validation, вложенный Escape, focus,
  ПКМ defaults, атомарную правку группы, locked/read-only, Undo/Redo и reopen.
- Сравнить draft/commit/decoded export, пересечения и Canvas2D/CanvasKit goldens.
- Пройти browser и native Tauri в editor/Quick, обе темы и RU/EN.

Фактические результаты и ограничения текущей платформы — TESTING.md.

## Расширенная палитра и видимый предпросмотр (ADR-051)

1. Через обычный Capture/Open создать фигуру; открыть её геометрию. Доступен 31 именованный вариант, до семи колонок с ячейками 32×32 и иконками 20×20. Заголовок «Форма» не занимает отдельную строку.
2. Звезда показывает лучи и внутренний радиус в одной строке; rectangle — скругление. Rounded rectangle — пресет, а не дополнительный persisted kind.
3. Переключить геометрию, Undo/Redo, изменить intrinsic size и stroke/fill; сохранить и открыть документ повторно. Прежние пять форм остаются совместимыми. Braces выбираются по штриху, прозрачные углы фигур не дают fill hit.
4. На 1024 px, у краёв окна, при zoom и non-origin Quick crop открыть shape/arrow/defaults popovers. При доступной свободной позиции объект не закрыт; при невозможности полного обхода controls остаются в viewport и доступны через scroll. Canvas не сдвигается сам.
5. Проверить RU/EN, light/dark, keyboard/focus, locked/mixed, Escape и cancel. Сопоставить preview и повторно декодированный экспорт обоих renderers, включая внутренние линии, кривые и opacity/blend.

Фактические platform results и артефакты находятся в TESTING.md; наличие этого сценария само по себе не означает pass.

## Компактная панель фигур (2026-10-15)

Windows 10 x64: форма, заливка, обводка и наложение образуют одну строку без
«Ещё»; кнопки показывают состояние и имеют локализованные accessible names.
Chrome 155 подтверждает RU/EN × light/dark при 1024×700 и работу при 1280×800.
Real WebView2 155.0.4283.45 через production fake capture создаёт фигуру в Quick,
меняет скругление, независимый цвет заливки `#336699`, толщину, непрозрачность и
blend; Undo/Redo восстанавливают paint. Один Editor click переносит редактируемый
слой в main. Native ПКМ меняет defaults без правки выделения; следующая фигура
получает новую толщину. Locked/mixed, invalid/cancel, batch и preferences
проверены component/mounted-shell тестами. Логи и просмотренные screenshots —
в TESTING.md. Physical capture, Linux/macOS и вся release matrix остаются
отдельными gates.

## Windows: новый снимок без следа editor (2026-10-15)

На Windows 10 x64 / WebView2 155.0.4283.45 сценарий
`windows-capture-exclusion` нажимает production Capture поверх заметного
editor marker и контрольного fullscreen desktop. После скрытия main frozen
scene содержит точный desktop colour в 9 точках прежнего editor; три цикла
с trusted Escape/retry дают 27/27 совпадений. Before/after screenshots
просмотрены, фактический прогон и ограничения — в TESTING.md. Захват настоящий;
fake-platform проверяет Quick chrome и не заменяет это pixel evidence.

## Windows native harness и tool settings (2026-10-15)

Windows x64 / WebView2 155.0.4283.45: полный stable `pnpm test:e2e:tauri`
прошёл 15 scenarios / 18 tests через external tauri-driver.
ПКМ и Escape имеют `isTrusted=true`; nested stroke panel, keyboard focus,
handoff, Copy и повторный capture проверены через production mount-flow.
Следующий сценарий запускается после освобождения портов и остановки driver tree.
Скриншот `artifacts/tauri-e2e/quick-native-tool-settings.png` просмотрен.
Большой viewport проверяет декодированный цвет исходника; Quick→Editor —
отрисованные пиксели; пипетка читает HEX обратно из system clipboard.
Browser matrix — 17/17 specs, включая RU/EN light/dark 1024×700 screenshots.
Настройки drawing v3 проверяются также между двумя нативными запусками с общим
WebView2 userDataFolder; временный профиль EdgeDriver не подходит для этой проверки.
Подробности и логи — в TESTING.md. Полная UX/platform matrix остаётся pending;
fake-platform не подтверждает physical capture permissions или native Save As.

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
3. Проверить tray, empty state и доступность Capture. В трее нет розовой
   плитки: монитор с кошачьими ушами, прищурами и подставкой различим при 16/20/24/32 px на
   светлой и тёмной панели; на macOS системный template меняет окраску вместе
   с панелью. Открыть tray menu и проверить «Открыть редактор».
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

macOS first Screen slice (2026-08-28, host darwin 21 / Intel): CoreGraphics
adapter, Screen Recording `permissionDenied` and hide-before-snapshot are in
code. Local grant/deny plus decoded-PNG smoke remains the gate before any
`supported` claim. ADR-038 defines the next Area/Window architecture, but does
not constitute runtime evidence for it.

macOS 12.7.6 x64 launch smoke (2026-08-29): `pnpm tauri dev` with a saved last
document and with a clean profile both left the `loading` screen without a
click, Shift+Tab or other focus event. Capture and Open image stayed
available; the hidden `quick-capture` window was not created. This is A01
startup/empty evidence only, not a Screen `supported` claim.

macOS quick-presentation follow-up (2026-08-29): the photographed duplicate
menu bar identifies AppKit window-frame constraining, not missing captured
pixels: the live menu bar remained above a selector whose frozen image already
contained another menu bar. The selector window now overrides that constraint
and retains the complete `NSScreen.frame`. Quick capture now maps its real
WKWebView at 1% opacity with pointer input disabled, waits for stable canvas and
chrome frames, and only then reveals and focuses the window. Focused frontend
tests passed 15/15, macOS bridge tests passed 16/16 and boundary tests passed
15/15. The already-running `tauri dev` process predates the rebuilt binary, so
a restarted visual Area smoke remains required and is not claimed here.

The next macOS visual pass exposed Retina-sized quick-frame handles/badge and a
notification-plugin capability rejection in the quick WebView. Overlay sizing
now uses actual CSS-to-backing canvas scale and redraws after fit zoom; focused
Vue coverage passed 44/44. Quick capture grants only the plugin's injected
read-only permission-state probe, with notify/request permissions rejected by
the passing boundary suite. Restarted visual confirmation remains pending.

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
canvas bounds. Затем проверить color picker: открыть contextual control на desktop
и 1024×700, выбрать белый, чёрный и серый, ввести HEX, проверить recent и compact
suggestions. Запустить пипетку из picker и tool rail: до подтверждения рядом с
pointer/keyboard target должна появиться не перехватывающая ввод 9×9 лупа с
выделенным центром, live swatch/HEX и подсказкой. Выбрать известный непрозрачный
scene-пиксель при zoom, убедиться, что HEX скопирован, toast и recent обновлены, а
transient overlay в sample не попал. Проверить стрелки/Shift+стрелки, Enter и
Escape, прозрачный пиксель и clipboard failure; единственное изменение выбранного
слоя должно undo/redo ровно одной command.

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

The 2026-08-22 eyedropper follow-up adds a pointer-transparent 9×9 live loupe
without changing schema v7, renderer/export or document history. Pointer moves
are coalesced to one preview update per animation frame and repeated motion
inside one scene pixel does not repeat readback; card placement flips and clamps
inside the viewport. Focused Vue coverage passed 36/36 after the expected
red-first 2/36 failures. Focused Chrome 151 M08 passed 8/8; the inspected
`m08-eyedropper-live-loupe-en.png` and
`m08-eyedropper-live-loupe-1024-ru.png` artifacts show `#273D5A`, the centre
target and complete EN/RU hints without bottom-chrome overlap. Alpha `0`/`128`,
loading, readback and clipboard failures remain recoverable, and only click or
Enter reaches clipboard/recent colours. The repeated aggregate browser run
passed all 7/7 spec files. Real-Tauri acceptance remains blocked before test
bodies: the runner could not replace the in-use debug executable and WDIO could
not create an embedded session, so no native clipboard/WebView result is
claimed.

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

## A09 — История, серии и библиотека

1. Через production Capture создать два кадра и аннотировать первый.
2. Через кнопку истории открыть первый: восстановлены аннотации/crop/viewport, Undo начинается заново.
3. Перезапустить приложение: выбран прежний старый кадр; protection сохранена.
4. На fixture 1000 captures проверить первую страницу до полного scan и ≤18 DOM-карточек.
5. Проверить срок/объём/count, soft-limit warning, active/protected/legacy exclusions.
6. Очистить cache и подтвердить preview удаления активного и последнего кадров. Empty state оставляет Capture/Open image доступными.
7. Проверить stale plan, shared blobs, interruption recovery и отсутствие stale/censor-leaking previews.
8. Выполнить 200 переключений после прогрева и записать RSS/cache evidence.

Команды, фактическая платформа и результаты — TESTING.md, раздел ADR-078.
Series rename/search/size и pin windows остаются будущими частями M09;
этот срез не подтверждает их runtime acceptance.

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
- 1024 px без горизонтального overflow основных действий; нижний chrome (серия, ToolRail, zoom) остаётся внутри окна по вертикали.
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

ADR-148: обычный software `pnpm test:perf` — ограниченный 2/8 smoke обеих
4K/8K нагрузок с проверками cache lifetime; полный 30/120 software trend —
`pnpm test:perf:trend`. Profile/counts/RSS сохраняются в JSON, shared-host
quantiles не закрывают frame SLA выше. Для leak acceptance остаются реальные
20 open/close циклов; короткий software sampling их не заменяет.

## A14 — CI-сборки и проверка версии

ADR-112: обычный CI выполняет короткий browser/native E2E smoke. Для полной
приёмки ниже запустить полные локальные suites либо manual CI с `full_e2e: true`.
Проверить, что failure отдельной task не отменяет остальные jobs и создание
package artifact, но блокирует Release publisher; отдельные reports доступны
после ошибки. Новый Actions run должен подтвердить hosted граф и длительности.

Для Linux x64/ARM64, Windows x64/ARM64 и macOS Intel/Apple Silicon скачать
versioned package из GitHub Release, проверить checksum/архитектуру, выполнить
install/launch → capture → edit → export → relaunch → uninstall. На Windows/macOS
ожидаемые предупреждения unsigned build документированы. macOS получает один
universal DMG для обеих архитектур.

`REQ-REL-006`, ADR-111: опубликовать Release со строгим version tag либо вручную
запустить Release assets с существующим тегом. Дождаться полного CI и пяти
package jobs; проверить семь installers/packages, пять SBOM/license reports,
SHA256SUMS и Downloads с рабочими ссылками. Повторный publish job с теми же
artifacts пропускает идентичные файлы. Ошибка любого job, несовпадение версий,
перемещение tag, неполная матрица, повреждение файла и конфликт asset должны
блокировать публикацию. Hosted end-to-end прогон этого workflow пока не выполнен;
локальные boundary/API tests не заменяют installer/runtime acceptance.

## A15 — Area quick capture

1. Запустить Area из editor, скрытого tray, hotkey и CLI; основной editor не
   должен появиться до действия Editor.
2. До drag проверить стабильную непрозрачную закруглённую подсказку
   «Выделите область» с иконкой камеры; во время drag — пунктирную рамку и
   читаемый dimension badge без мерцания. Escape на этом этапе отменяет capture.
3. На mouse-up frozen frame, затемнение и рамка не исчезают ни на один кадр;
   панели редактора добавляются к той же визуальной сцене без пустого кадра или
   повторного появления overlay. После handoff проверить frameless surface,
   dimension badge, полный набор quick annotation tools и action bar
   Editor/Copy/Save/Close.
   В Select без selection нет horizontal/vertical flip и пустой панели настроек.
   Pencil/Shape и precision tools сохраняют контекстные настройки; selected
   arrow использует transient-панель. Text, Callout и Numbered Marker имеют
   разные контурные Tabler-иконки; Undo/Redo сохраняют disabled/focus состояния.
   В полном editor оба flip доступны и проходят click → Undo → Redo.
4. Создать аннотацию, затем move/resize рамку: annotation остаётся над теми же
   pixels frozen desktop, crop clip изменяется, undo/redo возвращает рамку.
5. Close/Escape до commit не оставляет capture, document, series frame или
   staged blob. Параллельный capture возвращает busy.
6. Copy создаёт editable library document, помещает rendered crop в native
   clipboard и закрывает overlay только после успеха. Clipboard error оставляет
   recoverable quick surface.
7. Save cancel не материализует draft; успешный Save создаёт document, атомарный
   PNG и проходит повторный decode. Editor открывает тот же editable document с
   сохранёнными слоями и history-compatible geometry.
8. Повторить на Windows/X11/macOS mixed-DPI и cross-monitor layouts. На Windows
   и X11 Area должен использовать единственную fullscreen Quick surface без
   отдельного native Area selector. На macOS Area должен использовать native
   AppKit selector и единый frozen multi-display frame. На Wayland подтвердить
   один системный выбор ScreenCast Monitor и затем собственное Quick выделение
   с расширением до границ выбранного монитора (ADR-118/119).
9. Screen, Window и Active Window открывают полный editor. Repeat на Wayland
   снова открывает Quick selection, остальные платформы сохраняют прежний flow.
10. Для resident X11/Windows процесса измерить mouse-up → `IsViewable`
    interactive quick chrome; временный preview не должен синхронно сжимать
    full-desktop PNG или записывать transport-файл.
11. На X11 Area проверить единственный fullscreen top-level Quick XID до drag,
    во время него и после появления editor chrome. В `selecting` не должно быть
    ToolRail, Zoom или actions; первый валидный drag создаёт одну `setCrop`
    command. После mouse-up scene/overlay canvas и пунктирная рамка не заменяются,
    а инструменты появляются без нового map/show/focus или loading frame.
12. На resident X11 измерить command → focused interactive Quick: уже скрытый процесс
    не начинает новый compositor-settle, недавно скрытая app surface ждёт только
    остаток интервала, а видимый editor становится `IsUnMapped` до snapshot.
    Первый drag на показанной Quick surface принимается без дополнительной
    подготовки; Escape возвращает typed `cancelled` и не материализует draft.
13. На Windows проверить тот же single-surface lifecycle: первый Area show не
    проходит через восстановленное окно 800×600, до drag существует один
    fullscreen `Cute Screen Quick Capture` HWND, первый physical drag не
    закрывает и не заменяет его, а после mouse-up те же scene/overlay canvas
    сохраняют frozen frame и рамку, добавляя tools/actions. Win32 Area selector
    не должен появляться; Window capture по-прежнему использует native selector.
14. В Windows editing нажать `Редактор` ровно один раз. Main должен стать видимым
    с materialized document и получить первый renderer frame; Quick должен
    потерять topmost и скрыться без timeout. Через три секунды видим только main;
    Quick не remap-ится уменьшенным non-fullscreen окном.

Resident Ubuntu 24.04 / GNOME 46 / X11 replay (2026-08-30) подтвердил пункт 11:
одна fullscreen Quick surface сохранила XID `0x42000fc` до и после физического
drag `300,250 → 1000,700`. Selecting frame содержал только frozen desktop,
dim/crosshair и подсказку; editing frame сохранил точную рамку 700×450 и добавил
tools/actions. Dev/debug command → focused selecting составил 723 ms из
видимого editor и 607 ms из скрытого процесса. Escape скрыл тот же XID,
ожидавший CLI получил typed `cancelled`.

Windows 10 Home 22H2 build 19045 x64 repair replay (2026-08-30) подтвердил
single-display часть пункта 13: до и после первого drag оставался один fullscreen
Quick HWND `0x4078C`, отдельного selector HWND не было, а та же surface сохранила
видимые frozen desktop pixels и сменила hint-only selecting на рамку 1225×750 с
tools/actions. `Подготавливаем редактор…` после drag отсутствует; Escape убрал
Quick window. Артефакты: `artifacts/windows-area-repair/selecting.png` и
`artifacts/windows-area-repair/editing.png`. Cross-monitor/mixed-DPI layout
остаётся отдельным pending gate.

Windows dev replay terminal Editor handoff (2026-08-30) подтвердил пункт 14:
после одного UI Automation Invoke main HWND стал видим через 104 ms, Quick HWND
скрылся к 163 ms; через три секунды `Quick=false`, `Main=true`, resident process
продолжал работать. Артефакт:
`artifacts/windows-area-repair/editor-handoff-one-click.png`.

Для macOS 12+ отдельно выполнить acceptance на 12.0–12.2, 12.3–13 и 14+.
Проверить фактическую ветку CoreGraphics fallback, one-shot `SCStream` и
`SCScreenshotManager`/system window picker соответственно; grant/deny Screen
Recording, cancel и отсутствие selector pixels. Area должен открыть quick-mode
с frozen multi-display pixels и корректными Retina/mixed-scale bounds; Window
должен сразу создать и смонтировать direct document без quick-mode. До этих
реальных decoded-pixel прогонов runtime support остаётся pending.

Локальное доказательство 2026-08-24: Ubuntu 24.04, GNOME 46,
X11, packaged-debug binary и чистый профиль. CLI Area → physical drag 600×400
→ видимый 2560×1440 quick WebView с frozen frame и полным chrome → Close
вернул typed `cancelled`. Артефакт визуальной проверки:
`/tmp/codex-shot-2026-08-24_18-15-32.png`. После пользовательского
воспроизведения накопления transient-следов selector переведён с XOR на
damage redraw из frozen backing pixmap. Packaged binary обработал 472 движения
cursor hint и 120 изменений рамки при удерживаемой кнопке; screenshots
`/tmp/codex-shot-2026-08-24_18-31-00.png` и
`/tmp/codex-shot-2026-08-24_18-31-30.png` содержат только последнее состояние,
без следов предыдущих координат. Mixed-DPI/cross-monitor и Wayland acceptance
остаются отдельными gates.

Follow-up local proof, 2026-08-24: the rebuilt debug binary ran in an isolated
X11 profile through `cute-screen capture --mode area --json`; `xdotool` sent
only `300,220 → 900,620` primary-pointer drag. It mapped `Cute Screen Quick
Capture` at `2560×1440` before any `Enter` key was sent. Escape then returned
the typed terminal JSON `cancelled`; the temporary profile was removed.

The final primary-window regression smoke started a resident editor first and
clicked its actual Capture button. The earlier client-only `IsUnMapped` check
was insufficient: user evidence showed Mutter's separate blank decoration with
the selector. The repaired gate now waits for both the client and its mapped
`_MUTTER_FRAME_FOR` decoration to disappear and stay absent for the compositor
settle interval. In the rebuilt debug smoke the old frame was destroyed, the
client remained `IsUnMapped`, and the selector showed only the frozen VS Code
desktop. Escape recreated/restored the editor frame. Screenshot:
`/tmp/cutescreen-frame-settled-selector-hint.png`.

Latency follow-up, 2026-08-28: on the resident Ubuntu 24.04/GNOME X11
debug/Vite process at 2560×1440, the Area preview used a memory-owned top-down
32-bit BMP instead of synchronous full-frame PNG compression and file staging.
The first observed mouse-up → viewable presentation measured 700 ms; the warm
replay measured 486 ms and Escape returned typed `cancelled`. A third automated
attempt cancelled before presentation and is not counted as performance
evidence. Repeated optimized-build measurement remains pending.

Selector-visibility follow-up, 2026-08-28: the same resident X11 process ran a
warm CLI Area selector for more than four seconds after hiding a visible main
editor. The inspected frozen frame contains no editor, grey compositor actor,
frame or shadow; the rounded white hint has readable text and a complete camera
outline. A separate 600×650 drag across a white LibreOffice Writer page shows a
4 px dark solid underlay below the 2 px white dash, so the complete frame stays
visible on white content. Escape returned typed `cancelled`. Evidence:
`/tmp/cutescreen-selector-predrag-final-2026-08-28.png` and
`/tmp/cutescreen-selector-white-page-drag-final-2026-08-28.png`. Packaged
optimized, mixed-DPI and cross-monitor repetition remains pending.

Camera-asset follow-up, 2026-08-28: the X11 pre-drag hint replaced its
hand-built camera geometry with the official Lucide Camera SVG and a
pre-rasterized 24×24 native derivative. Source URL and the complete ISC notice
are retained with the asset; capture performs no network request or active SVG
parsing. The physical replay was inspected in
`/tmp/cutescreen-selector-lucide-camera-2026-08-28.png`; Escape returned typed
`cancelled`.

Текущая версия (REQ-UI-015, ADR-108): открыть Settings → General;
под Cute Screen видна «Версия <номер>» / «Version <number>» из метаданных
запущенного приложения. Проверить RU/EN, обе темы, 820×720 и 620×520;
переключить разделы и выделить номер для копирования. При ошибке чтения
доступен повтор; настройки остаются рабочими. Фактический evidence — TESTING.md.

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

## A15 UI-срез — Tabler и отсутствие quick flip (2026-10-15)

Ubuntu 24.04.5 x86_64/X11, WebKitGTK 605.1.15: clean-profile production request
с fake capture прошёл 1/1; отдельный quick-chrome scenario прошёл 3/3:
нет flip/пустой панели в Select, есть Pencil settings, distinct text-tool
icons, keyboard focus, Editor handoff, Copy, Escape/restart и Close.
Скриншоты: `artifacts/tauri-e2e/quick-tabler-select.png`,
`artifacts/tauri-e2e/quick-tabler-pencil.png`,
`artifacts/tauri-e2e/quick-tabler-focus.png`.

Physical first-drag/annotation и native Save PNG dialog/cancel/redecode остаются
pending. Full browser suite не зелёный; команды, failures и baseline comparison
зафиксированы в `TESTING.md`. Это UI acceptance текущей системы, а не полная
платформенная приёмка A15.

Quick frame sharpness follow-up: тот же native scenario прошёл 3/3 с
проверкой display-resolution overlay. Пунктир/handles/размер визуально проверены
на `artifacts/ui-tabler/quick-after.png` против приложенного blurred
`quick-before.png`; DPR 1/2 и redraw покрыты pixel/component tests. Physical
mixed-DPI replay остаётся pending; source/exports не масштабируются этим fix.

## Панель стрелки и выделение (ADR-050)

`REQ-EDT-005/008/015/016`, `REQ-TOL-001`:

1. Создать стрелку обычным drag: активен Select, у выделения одна компактная
   панель без дополнительной иконки Arrow; цвет и четыре controls выровнены.
2. Открыть Head/Tail: шесть миниатюр, хвост направлен влево, наконечник вправо;
   текущий вариант выделен, hover показывает RU/EN название.
3. Escape закрывает ближайшее меню и возвращает focus на trigger; выбор
   Circle меняет стрелку, один Undo восстанавливает прежний наконечник.
4. Навести на corner rotation zone: виден контрастный `rotate-clockwise`.
5. При zoom 50/100/200% и DPR 1/2 рамка остаётся тонкой, пунктир и handles
   сохраняют экранный размер. Повторить в editor и Quick Capture.
6. Locked selection блокирует controls; ПКМ на tool по-прежнему меняет defaults.
7. В Quick уменьшить рамку с верхнего левого угла, создать стрелку внутри неё:
   панель находится над стрелкой, по центру её bounds; рамка, действия и ToolRail
   остаются внутри viewport. Crop не сдвигает панель в левый верхний угол.

Фактические browser/WebView результаты и ограничения — TESTING.md;
полная Linux/macOS runtime-проверка остаётся отдельной platform gate.

## Quick → Editor и выход из пипетки (2026-10-15)

1. Из палитры Arrow запустить sampling, затем выбрать инструмент кликом,
   shortcut или ПКМ, включая тот же Arrow: лупа/курсор sampling исчезают,
   следующий drag создаёт выбранную аннотацию. Повторить в Quick и editor.
2. Configure popover закрывается при запуске sampling; успешный образец
   меняет defaults выбранного tool без изменения существующей аннотации.
3. В Quick уменьшить crop с верхнего левого угла, нарисовать стрелку и нажать
   Editor один раз: main открыт, Quick скрыт, размеры crop сохранены.
   Delete полностью убирает ink, Undo возвращает стрелку, Redo снова убирает.

Windows WebView2 155.0.4283.45: native 7/7, полный unit suite 578/578 и общий
`pnpm check` прошли. Использован fake capture; физический захват и другие
платформы остаются отдельными gates. Числа и screenshots — TESTING.md.

## Три разных кисти (2026-10-16, ADR-060)

`REQ-TOL-003`: в инструменте Pencil выбрать по очереди «Точное перо»,
«Автокоррекция», «Экспрессивная кисть». На одной шумной траектории первое
сохраняет углы и постоянную толщину, второе убирает дрожание, третье меняет
толщину. Стартовые настройки: автокоррекция 65%, экспрессивная 35%; точное
перо отключает control коррекции с пояснением. После смены режима возвращается
его последнее значение. Миниатюры используют тот же resolver. Проверить RU/EN,
обе темы, 1024 px, выбор клавиатурой, locked/read-only и смешанное выделение.

До pointerup документ не меняется; release завершает штрих одной command,
инструмент остаётся активным. Escape/pointercancel не создают объект. Нулевая
pressure отпускания не обрывает толщину. Undo/Redo, выбор по реальному контуру,
прозрачная середина петли, move/resize/rotation/reflection, internal clipboard,
save/reopen и прежний вид legacy штрихов обязательны. Полупрозрачный новый штрих
не темнеет на стыках или собственном пересечении. Экспорт повторно декодируется.

Linux WebKitGTK: production fake Capture → Quick → Editor проверяет три кисти,
trusted pointer input, отмену, Undo/Redo; отдельный native launch восстанавливает
шесть штрихов и выбранную кисть. Chrome проверяет также compact RU/EN × light/dark.
4K/8K fixtures и 12 000 samples подтверждают decoded preview/export parity;
software timing не является GPU frame-budget evidence. Фактические результаты
и ограничения общих проверок — TESTING.md.

## Text sizing/wrapping follow-up (2026-10-16, ADR-062)

- New point text starts at one em; short Latin/Cyrillic text follows actual
  bundled-face metrics, up to 480 document px. A long unbroken word wraps.
- DOM soft lines and persisted/exported lines agree; wrapping does not insert
  newlines in source or split combining/ZWJ graphemes. Range formatting and copy
  retain UTF-16 offsets through soft breaks.
- A capped commit uses v7 fixedWidth. Side handles may make it wider or narrower;
  height reflows from real metrics without scaling fonts. Style edits update
  bounds in the same undo step. Existing autoSize keeps its sizing mode.
- Background popup fits at 640/1024/1440; colour, custom colour, padding/radius,
  Apply and Cancel remain reachable without horizontal scrolling.
- Execute core/renderer/component/browser/real-Tauri checks. Record actual
  platform, decoded PNG and screenshots, including unavailable checks in
  TESTING.md; Linux browser evidence does not establish Windows/macOS support.

## Панель скрытия данных: UX (2026-10-16)

`REQ-TOL-008`, `REQ-EDT-008/015/016/017`:

1. Открыть изображение, выбрать «Скрыть данные»: видны три подписанных эффекта,
   отдельная форма и текущий параметр; нет обрезанных select и постоянного slider.
2. Выбрать форму, эффект, visual preset и произвольное число; нарисовать область.
   После создания активен Select, настройки — в единственной панели у объекта.
3. Изменить параметр, отменить draft через Escape, подтвердить другой параметр.
   Undo/redo откатывают завершённые правки по одной, исходная geometry сохраняется.
4. Проверить mixed selection, locked/read-only, ПКМ configure и ближайший Escape.
5. RU/EN, light/dark, DPR 1/2, 1024×700 и 1440×900: все подписи и меню помещаются;
   эффекты остаются видимыми. Enter/Space активируют кнопки, фокус возвращается.
6. В Quick открыть и закрыть настройки, нажать Select, затем Editor одним кликом.

Browser и WebKitGTK evidence: `artifacts/censor-toolbar/`; команды и пределы
проверки — TESTING.md. Native embedded pass проверяет DOM input в production
WebViews; Windows/macOS и физические pointer-жесты остаются отдельной проверкой.

## Жизненный цикл инструментов и панелей (2026-10-16, ADR-063)

`REQ-EDT-002/003/008/015/016/018`, `REQ-UI-003/006/007`:

- Создать аннотацию production pointer-жестом; пустой canvas и фон рабочей
  области снимают рамку и панель без изменения документа/history.
- ПКМ, Shift+F10 и ContextMenu открывают defaults у кнопки; повторная ПКМ
  сохраняет панель. ЛКМ/hotkey, включая тот же tool, закрывает прежнюю панель
  и sampling. Creation activation очищает прежний выбор.
- Вложенные palette/select/number controls не считаются внешним кликом.
  Escape закрывает один уровень с возвратом фокуса; outside click сохраняет
  назначение и фокус, слои/zoom/history сохраняют выделение.
- Текст подтверждается один раз до нового выбора/режима, включая IME/fonts;
  Escape нового draft не создаёт history. Crop Apply/Cancel остаются видимыми.
- Без выделения и открытых defaults нет нижней панели обычного инструмента.
  В полном Editor flip canvas доступен через More actions и undo/redo;
  empty/loading/read-only/pending блокируют эти команды. В Quick их нет.
- Запустить mounted-shell, browser и production real-Tauri проверки. Платформу,
  screenshots и ограничения native driver фиксировать в TESTING.md.

Native follow-up: Ubuntu 24.04.5 / X11, external tauri-driver + WebKitGTK 2.52.6,
2/2. ПКМ вводится системным xdotool; Shift+F10, Escape, hotkey и создание —
WebDriver. Проверки наблюдают isTrusted, document focus и enabled controls;
никакие события или document/selection state не инъецируются. Browser lifecycle
повторяется после изменения общего input helper. Wayland и другие ОС этим
follow-up не подтверждены; команды и диагностика — TESTING.md.

## Выноска: измеренная подпись (2026-10-17, ADR-065)

`REQ-TOL-007`, `REQ-TOL-005`, `REQ-EDT-016`: drag target→label opens an expanding
inline label. Left endpoints place the whole padded block on the left; equal X uses
the right. The marker gap is 6 document px, independent of text alignment.
New labels wrap at 480 document px; the outer grip or numeric width can exceed
that cap without scaling glyphs or moving endpoints. Auto, minimum-one-em validation,
Escape/focus return, read-only blocking and one-command undo/redo are covered.
Mixed span sizes use the same paragraph heights in projection and rendering.

Linux browser and external-driver real WebKitGTK cover production creation,
commit/reopen, 720 px width, direct grip resize, popup cancellation and undo/redo.
Browser screenshots cover 1024 px, both themes, RU/EN and 50/100/200% zoom.
The render harness decodes both backend exports and verifies Canvas2D preview/export
pixel identity. Existing autoSize documents are measured without dirtying the document.
Windows/macOS/Wayland were not run for this follow-up. See TESTING.md for commands.

## Номерная метка (2026-10-17, ADR-066)

- Через production controls создать 1/2/3, удалить 2, получить 4; undo/redo.
- Задать повторяющийся следующий номер: предупреждение без запрета; после
  успешного создания Auto, после смены инструмента override сохраняется.
- Изменить номер, добавить multiline подпись справа, изменить номер с сохранением
  подписи и убрать подпись; одна команда на commit, размер и центр badge не меняются.
- Проверить все формы, крупный шрифт, 100 и кириллицу без обрезания и сдвига центра.
- RU/EN, light/dark, 640/1024/1440, zoom 50/100/200: без horizontal overflow,
  корректные focus/Escape/outside, locked/read-only, preview без selection.
- Проверить экспорт повторным декодированием и реальный Capture → Quick → Editor.

Дополнение ADR-067: предпросмотр заменяет курсор на canvas; сменить квадрат/синий
на ромб/красный в defaults и вернуться в ту же точку — preview и созданная метка
совпадают с новым стилем. Панели, pan и sampling скрывают preview.

## Настройки инструментов (ADR-069, 2026-10-17)

- Название и shortcut — единственное содержимое tool tooltip в RU/EN.
- Девять creation tools показывают defaults при активации; Text/Callout — inline
  после размещения; Select показывает свойства выбранного объекта.
- Quick: settings + tools целиком вне crop либо явная кнопка настроек.
  Chrome фиксирован во время gesture; outside-dismiss пропускает первый штрих.
- Evidence: browser-creation-settings, tool-lifecycle, brushes; native scenario
  creation-settings через production Capture → Quick → Editor.
  Результаты и платформенные ограничения записываются в TESTING.md.

## Глобальные сочетания и запуск при входе (ADR-070)

REQ-ACT-007…012 реализуются через отдельный Settings и Rust-owned registrations.
Проверить через реальный UI: назначить область/редактор, отменить recorder,
получить конфликт без потери старого назначения, скрыть приложение и вызвать
физическое сочетание. После перезапуска вызвать его до открытия Settings.
Для захвата завершить selection → Editor и повторно декодировать оригинал;
размеры декодированного файла должны совпасть с подтверждённой областью.

Автозапуск: checkbox заранее включён, но ОС не меняется до подтверждения;
Cancel ничего не включает. Установить с обоими вариантами, обновить и повторно
войти в систему. Проверить фактический фоновой запуск и single-instance;
системное отключение не должно автоматически отменяться приложением.

Локально подтверждены browser UI, Rust/Gio контракты и X11 resident shortcuts.
Полная Windows/macOS/Wayland и logout/login матрица остаётся pending до
перечисленных реальных проверок. Фактические команды и артефакты — TESTING.md.

## Прямые участки штрихов (ADR-073)

`REQ-TOL-003/004`, `REQ-EDT-006/016`: в Editor и Quick выбрать выделитель и
каждую pencil brush. Начать с Shift, провести горизонталь, вертикаль и диагональ;
направление кратно 45°, длина сохраняется. Начать свободно, нажать Shift,
изменить направление, отпустить Shift и продолжить без скачка. Повторить Shift
несколько раз и обеими клавишами. До pointerup history не меняется; весь gesture
отменяется одним Undo и восстанавливается Redo. Escape, blur и pointercancel
не сохраняют draft. Tooltip RU/EN не объясняет Shift (ADR-094). При correction 0/65/100%
прямой span остаётся прямым; pressure expressive brush и alpha на стыках
не теряются. Resize, смена кисти, save/reopen, zoom/DPR и decoded export
сохраняют диапазоны. Old/v2 strokes остаются прежними. Фактическое evidence
и непроверенные платформы — TESTING.md и PLATFORM_MATRIX.md.

## Настройки и inline recorder (ADR-075)

- Один пункт настроек в трее; Общие/Горячие клавиши видны слева.
- Обычное открытие показывает Общие; CLI section shortcuts открывает назначения.
  Повторное открытие singleton сохраняет выбранный раздел.
- Один клик по Назначить/Изменить включает запись в строке. Save/Cancel,
  предупреждения и ошибки остаются у действия. Клик мыши не становится binding.
- Проверить Escape/focus return, Tab, blur, смену строки/раздела, конфликт
  с другой командой, ошибку probe/storage и запоздалый ответ отменённого probe.
- Проверка/удаление доступны через вертикальное троеточие мышью и клавиатурой;
  неназначенная строка не показывает пустое меню. Portal/manual различимы.
- RU/EN, light/dark, 820×720 и 620×520: нет горизонтального overflow, выбранный
  recorder с кнопками прокручивается в видимую область; sidebar/footer постоянны.
- Подтвердить native назначение, физическую активацию и relaunch отдельно от
  browser fixture. Команды, платформы и артефакты — TESTING.md.

## Форма скрытия данных до рисования (2026-10-17, ADR-077)

`REQ-TOL-008`, `REQ-EDT-015/016`, `REQ-UI-006`: в production Capture → Quick →
Editor выбрать rectangle в настройках «Скрыть данные» и нарисовать область.
У выделенного объекта видны эффекты и параметр без кнопки/подписи формы.
Повторно активировать инструмент, выбрать freeform, нарисовать треугольный
контур: первая область не меняется. У новой области и группы rectangle/freeform
также нет переключателя; эффекты доступны, undo/redo сохраняет точки/геометрию.
В defaults/configure доступны обе формы, Escape закрывает меню и возвращает
focus; при смене schema открытое меню исчезает без focus удалённой кнопке.
Проверить RU/EN, light/dark, 1024 px, locked/read-only. Результаты и ограничения
фиксируются в TESTING.md и PLATFORM_MATRIX.md.

## История: карточки и очистка (2026-10-17, ADR-078)

- REQ-LIB-002/011: две колонки; превью крупнее прежних 64 px, максимум десять
  mounted cards; ArrowDown/Up меняет строку из двух карточек. Корзина первой,
  правой и нижней карточек сразу открывает подтверждение; Cancel/Escape
  возвращает focus к нажатой корзине. Горизонтальной прокрутки нет.
- REQ-LIB-012/013: замок рядом с корзиной переключает защиту; защищённый замок
  виден постоянно, остальные доступны при hover/focus. Прозрачные кнопки 32 px,
  крупные белые SVG на мягкой тёмной подложке читаются на светлом и тёмном снимке.
- «Очистить» учитывает все страницы, включая старые снимки; preview показывает
  число и объём и объясняет сохранение protected/active. Focus на «Отмена»,
  Tab ограничен подтверждением, Escape отменяет без commit и возвращает focus.
- Подтверждение удаляет только reviewed IDs; пустой plan запрещает commit.
  Ошибка commit остаётся видимой и требует нового preview. Native deletion,
  protection и relaunch проверяются через production WebView отдельно от harness.

## Регрессия Export полного editor (ADR-083, 2026-10-17)

Production Open image с 3840×2160 fixture → добавить номер → Export. Повторно
декодированный PNG должен иметь исходный размер и RGBA committed scene, без
selection overlay. После применения квадратного crop и возврата в Crop, при
zoom >100%, Export обязан дать 2160×2160, равный соответствующей области первого
PNG. Отмена Save As не меняет предыдущий output; source metadata остаётся прежней.
Автоматизация подменяет только выбор пути OS picker; ручной системный диалог и
платформы за пределами фактического прогона остаются отдельными проверками.
JPEG/WebP и настройки quality/scale не считаются закрытыми. Evidence — TESTING.md.

Фактический результат ADR-083: Windows x64 / WebView2 155.0.4283.45, native
result-export 1/1 passed, decoded 4K и square-crop RGBA совпадают с эталоном;
cancel не меняет ранее сохранённый PNG. Native OS picker selection подменён,
ручной диалог и другие ОС остаются pending. Общие TS/Vue 1128/1128, renderer
33/33 и Rust workspace passed; общий check остановлен существующим unrelated
file-size boundary (503 > 500). Команды и артефакты — TESTING.md.

Дополнение имени PNG (2026-10-17): editor Export и Quick Save предлагают
`Скриншот YYYY-MM-DD HH-MM-SS.png` на момент открытия диалога по локальным часам.
Имя можно изменить. Rust formatter contract 1/1 passed на Windows x64;
ручная проверка предложенного имени в обоих OS-диалогах остаётся pending.

## Настраиваемый PNG filename — ADR-084 (2026-10-17)

Default: `YYYY-MM-DD_HH-MM-SS_Скриншот.png`. В Общие → Имя PNG проверить preview,
запрет пробелов/путей/неизвестных tokens, Cancel/Escape, Reset и Save. Сохранённый
шаблон восстанавливается после открытия настроек; editor/Quick предлагают одно
общее имя по текущим локальным часам. Windows/WebView2 native Settings → reopen
→ named 4K export и прежний crop/cancel scenario passed 2/2; RU/EN screenshots
просмотрены. Rust 3/3, Vue settings 18/18 и typecheck passed. OS picker selection
подменён; ручной Quick Save и другие ОС остаются pending. Команды — TESTING.md.

## Панель настроек и системные тулбары (2026-10-17)

REQ-UI-001, REQ-EDT-015/016: при создании/выделении объекта у верхнего края
панель экземпляра и вложенные настройки остаются ниже верхних действий и выше
занятых нижних controls. Пересчёт учитывает размеры chrome и viewport; маленькое
выделение и Quick с non-origin crop сохраняют свои координаты. Escape возвращает
фокус, просмотр параметров не меняет документ. Windows/Chrome: 4/4 RU/EN,
light/dark browser regressions passed; связанные Vue tests 59/59 passed.
Native и общие ограничения описаны в TESTING.md; другие ОС остаются pending.

Фактический native результат: Windows x64 / WebView2 155.0.4283.45,
`selection-toolbar-chrome` 1/1 passed через production Capture → Quick → Editor,
external pointer input. Панель и Stroke не пересекают системный chrome;
Escape/focus return и неизменность документа проверены, screenshots просмотрены.
Использован fake-platform capture; другие ОС и physical capture не проверялись.

## Локаль настроек и native tray (ADR-088)

1. В General Settings выбрать русский: все восемь native tray items, включая
   недоступные capture actions, Settings и Quit, должны получить русский текст.
2. Выбрать английский и снова русский без перезапуска. Editor должен принять
   тот же выбор; закрытие и повторное открытие Settings сохраняет язык.
3. Перезапустить процесс с тем же профилем: tray создаётся сразу на русском,
   до frontend hydration. Комбинации и disabled state сохраняются.
4. Ошибка записи показывает сообщение; повторный выбор языка повторяет save.

Автоматизация: tray-locale / tray-locale-reopen через реальный WebView;
чтение MenuItem::text, startup snapshot и screenshot Settings. Визуальный вид
открытого OS popup и Linux/macOS требуют отдельного runtime smoke.

ADR-088 native acceptance: 2026-10-18 Windows x64 / WebView2 155.0.4283.45,
external provider — 2/2 passed. Проверены все восемь native item texts,
RU/EN/RU, editor sync, Settings reopen и initial tray после process restart.
Screenshot Settings просмотрен; открытый OS popup визуально остаётся pending.

### Эмоджи Noto 2D — REQ-TOL-014 (2026-10-18)

Проверить E → быстрые 🔥/⚡ → pointer ghost → click → Select; заменить glyph,
изменить размер, move/rotate/corner resize, undo/redo. Повторное E восстанавливает
creation defaults, не параметры экземпляра. Палитра: 100 SVG, пять категорий,
поиск RU/EN, 12 недавних, пустой результат и два уровня Escape/focus. Проверить
1024 px, обе темы, non-origin crop в Quick, loading/read-only/error/cancel.
Native emoji + emoji-reopen должны материализовать Quick, открыть Editor,
сохранить и восстановить оба слоя после отдельного запуска. Windows WebView2
155.0.4283.45: оба сценария прошли, PNG повторно декодирован и совпал по RGBA
SHA-256 с preview 1:1. Геометрия палитры одинакова для 100/20/1/0 результатов.
Лог: artifacts/emoji-tauri-complete.log. Linux/macOS runtime pending.

## Компактные Quick actions и история (ADR-096)

Production Area → non-origin crop → pencil → inline Text → History. Проверить
пять доступных icon-only кнопок 36×36, SVG 20×20, панель 46 px и разделитель Close.
Hover/focus дают RU/EN подсказки; Enter на кнопке активирует её, Enter на canvas
копирует, Escape отменяет несохранённый draft. Пока pending, повторный ввод запрещён.
History завершает inline text/crop и закрывает Quick после commit без main, picker
или clipboard write. Ошибка persistence оставляет draft; dismiss retry не создаёт
дубликат. Позже открыть единственную запись истории и перезапустить приложение:
слои остаются редактируемыми, PNG результата содержит ink, original декодируется
чистым. Windows WebView2 evidence и ограничения — TESTING.md.

## Лендинг: актуальные инструменты (2026-10-18)

`REQ-EDT-008`, `REQ-TOL-001/002/003/004/005/006/007/008/009/010/011/012/013/014/015/017`:
RU/EN показывают одинаковые 18 карточек с актуальными UiIcon, включая Emoji
после Images. На 375/760/768/1024/1440 px текст и значки не обрезаются,
общего horizontal overflow нет, панель доступна через keyboard scroll.
Предоставленный пользователем toolbar screenshot 598×41 сохраняет pixels;
CSS clipping удаляет наружный фон скруглений. Большой hero не изменён.
Chrome/JS/no-JS и native capture evidence — TESTING.md; новые desktop runtime
или платформенные гарантии этим изменением не заявляются.

## Ссылка Noto Emoji (ADR-105)

`REQ-TOL-014`: Capture → Quick → выбор области → Emoji → Все эмоджи →
Noto Emoji. Клик и Enter на ссылке передают точный upstream URL системному
браузеру. Повторить после перехода в Editor; палитра и документ сохраняются.
Проверить отказ native opener для стороннего HTTPS, file URL и вложенного
пути. Автоматизированный Linux scenario emoji-link записывает OS dispatch;
реальное отображение сайта в браузере и Windows/macOS остаются отдельными
ручными/runtime проверками. Linux/X11 WebKitGTK 2.52.6, external driver:
1/1 passed, четыре URL dispatch и три отказа; оба screenshots просмотрены.
Фактические результаты — TESTING.md.

## Плавные дуги автокоррекции (2026-10-18, ADR-113)

`REQ-TOL-003`: на одинаковой редкой траектории сравнить точное перо и
автокоррекцию 65% — у второй петля и S-кривая без углов на стыках.
Повторить тонким штрихом, затем с 0%, коротким штрихом/точкой и Shift
посередине: начало/конец совпадают с жестом, прямой участок не искривляется.
Undo/Redo возвращают тот же штрих; Escape отменяет активный жест.
Preview и повторно декодированный экспорт совпадают. Core/render/browser
результаты и ограничения native проверки — TESTING.md и PLATFORM_MATRIX.md.

## Ресайз эмоджи и локальное начало изображения (2026-10-20)

`REQ-TOL-014/015`, `REQ-EDT-005/006`, ADR-035: создать эмоджи инструментом E,
увеличить и уменьшить за каждый угол. Рисунок совпадает с рамкой в preview
и после release; противоположный угол неподвижен. Повторить с поворотом,
отражением и Alt: при Alt неподвижен центр. После ресайза за левый/верхний
угол изменить размер в selection-панели: центр сохраняется, undo/redo возвращают
точную геометрию и изображение. Экспорт повторно декодировать и сравнить
с ожидаемым рисунком. Для image с ненулевым localBounds проверить поворот
и отражение без расхождения с selection frame. Shape, pencil/marker, text,
censor, spotlight, loupe и ruler используют собственную геометрию; arrow/callout
имеют semantic handles, numberedMarker не имеет generic resize. Проверки
и границы платформенного подтверждения — TESTING.md и PLATFORM_MATRIX.md.

## Креативные шрифты (2026-10-20, ADR-131)

`REQ-TOL-005/006/007`: каталог содержит 20 вариантов в прежнем меню. После
исходных 12 идут Press Start 2P, Germanica, Rubik Dirt, Rubik Glitch, Unbounded,
Russo One, Ruslan Display, Underdog. Все работают офлайн и распространяются
по OFL-1.1 с сохранением copyright/license notices.

- Component: 20 вариантов, Home/End/стрелки, явный commit, hover без изменений,
  disabled/loading/error/retry и восстановление focus.
- Assets/render: полный русский алфавит с Ё/ё, латиница и цифры в реальных
  файлах без fallback; 20 строк regular/B/I в decoded Canvas2D/CanvasKit goldens.
- Browser: production меню, смешанный текст, measured width и переносы,
  B/I, undo/redo, PNG decode; RU/EN, обе темы, 640/1024/1440 px.
- Native: новые text layers через UI на 4K original, все восемь family,
  wrapping/B/I, undo/redo, autosave, relaunch и совпадение decoded export pixels.

Фактические результаты и ограничения текущей рабочей копии — TESTING.md.
Результаты старого набора из 12 шрифтов не являются native evidence нового.

Результат ADR-131 на Ubuntu 22.04.5 x86_64: 18 component/license tests,
4 профильных font/render tests, 6 browser tests и 2 native persistence/export
сценария прошли. Оба native PNG декодированы, каждый текст меняет пиксели
в собственных bounds, relaunch сохраняет полный decoded pixel hash.
Общие проверки имеют отдельные timeout ограничения, зафиксированные
в TESTING.md; Windows/macOS runtime не объявляются проверенными.
