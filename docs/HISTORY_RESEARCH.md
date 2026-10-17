# История скриншотов: паттерны и решения

Дата исследования: 2026-10-17. Реализация: ADR-078.

## Источники

- [Snagit: открытие Recent Captures Tray](https://support.techsmith.com/hc/en-us/articles/41235700761101-How-do-I-Open-the-Recents-Tray-in-Snagit-Editor): вход в историю кнопкой внизу слева. Используем положение и раскрытие по запросу.
- [Snagit: tray и library](https://www.techsmith.com/learn/wp-content/uploads/2021/07/Snagit-Mac-Help-PDF.pdf): скрытие из tray и удаление файла различаются. В Cute Screen закрытие popover также не удаляет снимок; удаление называется явно и подтверждается.
- [CleanShot changelog](https://cleanshot.com/changelog): документированы Capture History и вариант хранения один месяц. Это ориентир для временной истории; конкретные квоты Cute Screen выбраны отдельно.
- [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): частый путь остаётся простым, вторичные настройки имеют понятный вход. Применение: одна кнопка, popover, один переход к хранению.
- [MDN: ImageBitmap.close](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close): освобождение графических ресурсов должно быть явным. Сжатый размер PNG не равен расходу RAM.

## Принятые решения

История общая для всех серий и переживает запуск. Popover до 360×400 px
с virtualized grid не расширяет постоянный chrome. Первый срез исключает
поиск, менеджер серий и плавающие pin windows.

Политика временная: 7 дней / 512 МиБ / 200 снимков. Protected и active
важнее квот; это сознательно мягкий лимит. Без защиты важное хранится только
экспортом; с защитой приложение объясняет превышение и предлагает очистку.
Срок считается от capture, просмотр его не продлевает. Аннотации удаляются
вместе с временным кадром. Старые данные получают отдельный consent preview.

Disk cache и decoded cache имеют разные бюджеты. Миниатюры показывают
сохранённый результат с crop/цензурой, а не исходник. Отмена invisible jobs,
revision keys и освобождение native tokens предотвращают накопление данных
и показ устаревших previews. Originals остаются локальными и неизменяемыми;
экспортированные и внешние файлы не входят в очистку.

## Проверяемые риски

- Потеря правок: flush before swap, failure retains old session, stale requests discarded.
- Потеря shared image: reference checks и deferred live-resource journal.
- Неожиданное удаление старого: отдельный legacy consent и точный preview files.
- Неверное обещание места: SQLite reusable space не выдаётся за уменьшение файла.
- Раздувание RAM: отдельные byte budgets, один preview job и реальный native soak.
- Плохая доступность: keyboard navigation, Escape/focus return, RU/EN и light/dark evidence.
