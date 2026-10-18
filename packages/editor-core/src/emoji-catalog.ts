/** Original curation/labels; artwork is Google Noto, Apache-2.0. */
export const NOTO_EMOJI_COMMIT = 'e20cbc2bbec1926686be9f9bee7d1d2cfa1fea0e'
export const EMOJI_PACK_VERSION = 'noto-2d-v1'
export const EMOJI_CATEGORIES = [
  { id: 'faces', ru: 'Эмоции', en: 'Emotions' },
  { id: 'gestures', ru: 'Жесты', en: 'Gestures' },
  { id: 'marks', ru: 'Отметки', en: 'Marks' },
  { id: 'reactions', ru: 'Реакции', en: 'Reactions' },
  { id: 'work', ru: 'Работа', en: 'Work' },
] as const
export interface EmojiEntry {
  readonly id: string
  readonly grapheme: string
  readonly category: string
  readonly ru: string
  readonly en: string
  readonly keywords: string
}
const entries = `
😀|Улыбка|Grinning face|радость smile happy
😂|Слёзы радости|Tears of joy|смешно laugh
🤣|Хохот|Rolling on floor laughing|смех lol
😍|Влюблённость|Heart eyes|любовь love
🤔|Размышление|Thinking face|думаю think question
😎|Круто|Sunglasses|cool класс
🤨|Сомнение|Raised eyebrow|нравится doubt сомневаюсь
😱|Ужас|Screaming face|страх fear
😤|Возмущение|Steam from nose|angry злость
🥳|Праздник|Partying face|party
😢|Грусть|Crying face|sad слеза
😭|Плач|Loudly crying|cry грустно
😡|Злость|Enraged face|angry плохо
😬|Неловкость|Grimacing face|awkward
🙄|Закатывание глаз|Rolling eyes|скепсис
😴|Сон|Sleeping face|sleep
🤯|Взрыв мозга|Exploding head|шок mind blown
🤡|Клоун|Clown face|clown
👻|Привидение|Ghost|ghost
🤖|Робот|Robot|bot
👆|Палец вверх|Point up|указатель pointer above
👇|Палец вниз|Point down|указатель pointer below
👈|Палец влево|Point left|указатель pointer
👉|Палец вправо|Point right|указатель pointer
👍|Нравится|Thumbs up|лайк хорошо like approve
👎|Не нравится|Thumbs down|дизлайк плохо dislike reject
👏|Аплодисменты|Clapping hands|браво clap
🙌|Ура|Raising hands|hooray
🤝|Рукопожатие|Handshake|договорились agreement
💪|Сила|Flexed biceps|strong
👋|Привет|Waving hand|hello goodbye
✋|Ладонь|Raised hand|стоп stop
👌|Окей|OK hand|хорошо okay
✌️|Победа|Victory hand|peace
🤞|Скрещённые пальцы|Crossed fingers|удача luck
🤟|Люблю тебя|Love you gesture|love
🤘|Рок|Sign of horns|rock
✊|Кулак|Raised fist|fist
👊|Удар кулаком|Oncoming fist|punch
🙏|Спасибо|Folded hands|пожалуйста thanks please
✅|Готово|Check mark button|галочка одобрено исправлено done approved
❌|Исправить|Cross mark|крестик ошибка нет wrong error reject
⚠️|Внимание|Warning|предупреждение danger caution
❓|Вопрос|Question mark|непонятно question
❗|Важно|Exclamation mark|важность important
⛔|Въезд запрещён|No entry|стоп stop
🚫|Запрещено|Prohibited|нельзя forbidden
💯|Сто процентов|Hundred points|отлично perfect
➕|Добавить|Plus|плюс add
➖|Убрать|Minus|минус remove
🔄|Повторить|Counterclockwise arrows|обновить reload refresh
↩️|Вернуть|Right arrow curving left|назад undo back
⬆️|Стрелка вверх|Up arrow|выше above
⬇️|Стрелка вниз|Down arrow|ниже below
⬅️|Стрелка влево|Left arrow|слева
➡️|Стрелка вправо|Right arrow|справа
📌|Кнопка|Pushpin|закрепить pin
📍|Метка|Round pushpin|место location
🚩|Красный флаг|Triangular flag|проблема flag problem
🏁|Финиш|Chequered flag|finish
🐛|Ошибка|Bug|жук гусеница баг caterpillar
💡|Идея|Light bulb|мысль idea
👀|Посмотри|Eyes|взгляд look review
🎯|Цель|Bullseye|target
🔥|Огонь|Fire|огонёк круто hot flame
⭐|Звезда|Star|избранное favorite
❤️|Сердце|Red heart|любовь love
🚀|Ракета|Rocket|запуск launch
🎉|Поздравление|Party popper|конфетти celebration
💥|Взрыв|Collision|boom
⚡|Молния|High voltage|быстро lightning fast
🔔|Колокольчик|Bell|уведомление notification
📢|Объявление|Loudspeaker|announce
🏆|Кубок|Trophy|награда award
🔒|Закрыто|Locked|замок lock
🔓|Открыто|Unlocked|замок unlock
🧪|Пробирка|Test tube|тест experiment
🚧|В работе|Construction|ремонт wip
🛑|Стоп|Stop sign|stop
🔍|Поиск|Magnifying glass|лупа search inspect
📝|Заметка|Memo|правка note edit
📋|Буфер|Clipboard|список checklist
📎|Скрепка|Paperclip|вложение attachment
🔗|Ссылка|Link|связь
🏷️|Ярлык|Label|метка tag
✏️|Карандаш|Pencil|редактировать edit
🗑️|Корзина|Wastebasket|удалить trash delete
💬|Комментарий|Speech balloon|обсуждение comment
💭|Мысль|Thought balloon|thought
📊|Диаграмма|Bar chart|статистика chart
📈|Рост|Chart increasing|growth
📉|Снижение|Chart decreasing|decline
🗂️|Разделители|Card index dividers|файлы files
💻|Ноутбук|Laptop|компьютер computer
📱|Телефон|Mobile phone|mobile
🖥️|Монитор|Desktop computer|экран screen
⌨️|Клавиатура|Keyboard|ввод input
🖱️|Мышь|Computer mouse|клик click
⚙️|Настройки|Gear|шестерёнка settings
🛠️|Инструменты|Hammer and wrench|починить tools fix
`.trim().split('\n')

export function emojiAssetId(grapheme: string): string {
  return [...grapheme].filter((point) => point !== '\ufe0f').map((point) => point.codePointAt(0)!.toString(16)).join('_')
}
export const EMOJI_CATALOG: readonly EmojiEntry[] = Object.freeze(entries.map((row, index) => {
  const [grapheme = '', ru = '', en = '', keywords = ''] = row.split('|')
  return Object.freeze({
    id: emojiAssetId(grapheme), grapheme, ru, en, keywords,
    category: EMOJI_CATEGORIES[Math.floor(index / 20)]!.id,
  })
}))
export const QUICK_EMOJI_IDS = ['2705', '274c', '26a0', '2753', '1f44d', '1f44e', '1f525', '26a1', '1f4a1', '1f446', '1f447', '1f448', '1f449'] as const
export function findEmoji(id: string): EmojiEntry | undefined {
  return EMOJI_CATALOG.find((entry) => entry.id === emojiAssetId(id) || entry.id === id)
}
export function searchEmoji(
  query: string,
  category?: string,
): readonly EmojiEntry[] {
  const words = query.trim().toLocaleLowerCase().replaceAll('ё', 'е').split(/\s+/).filter(Boolean)
  return EMOJI_CATALOG.filter((entry) => (!category || entry.category === category) && words.every((word) =>
    `${entry.grapheme} ${entry.ru} ${entry.en} ${entry.keywords}`.toLocaleLowerCase().replaceAll('ё', 'е').includes(word)))
}
