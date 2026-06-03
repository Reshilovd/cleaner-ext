# Verify

Логика VerifyMain и связанных сценариев проверки OpenEnds. В этой папке лежит не только код страницы `/lk/openends2/verifymain`, но и часть feature для `Project/Edit`.

Что здесь лежит:

- `verify-question-utils.js` — работа с кодами вопросов, grouped variables и вариантами кодов.
- `verify-manual-storage.js` — localStorage/API-состояние ручной чистки, токен, сохранённые группы OpenEnds, локальные incorrect ID, синхронизация `#Bfrids` и счётчик ID на вкладке `#manual`.
- `verify-rating.js` — парсеры XLSX, transport для background parse и reason codes из рейтинга.
- `verify-modal.js` — modal UI с ответами респондента и выбором в ручную чистку (см. сортировку списка ниже).
- `verify-row-context.js` — извлечение контекста строки и lookup respondent IDs.
- `verify-index.js` — загрузка и кэширование XLSX-индекса респондентов.
- `verify-row-decorate.js` — подсветка строк, иконки reason codes, колонка «Другие ответы», обновление видимости.
- `project-edit-stats.js` — виджет статистики на `Project/Edit`.

## Сортировка ответов в модалке

Список в модалке респондента (кнопка «Посмотреть» / «Другие ответы») и во вложенных списках кандидатов сортируется функцией `sortVerifyModalAnswersByQuestionOrder` в `verify-modal.js`.

Порядок определяется в три этапа:

1. **Числовой ключ** (`getVerifyModalAnswerSortKey`) — чем меньше ключ, тем выше в списке:
   - **Порядок переменных проекта** — если на `Project/Edit` (#openends) сохранён порядок кодов (`getOpenEndsVariableOrderForProject` / localStorage), используется индекс переменной в этом списке. При нескольких кодах в поле `question` берётся минимальный индекс.
   - **Порядок OpenEnd на странице VerifyMain** — для числового `openEndId`, присутствующего в `state.verifyRespondentIdsByOpenEndId`, ключ = `100000 +` порядок появления на странице.
   - **Числовой `openEndId`** — ключ = `200000 +` значение id.
   - **Номер в коде вопроса** — из первого кода, распознанного `parseVerifyVariableCodes` (например `Q10_15_other` → 10), ключ = `300000 +` номер.
   - **Остальные** — ключ `900000` (в конце списка).

2. **При равном ключе** — естественная сортировка строки `question` (natural sort): разбиение на фрагменты «цифры / не-цифры», числа сравниваются как числа, текст — `localeCompare` с локалью `ru`. Поэтому при отсутствии сохранённого порядка переменных коды вроде `Q10_…`, `Q11_…`, `Q18_…` идут по возрастанию номера вопроса, а не лексикографически как строки.

3. **При полном совпадении** — исходный порядок в массиве ответов (стабильная сортировка).

Источник порядка переменных: сбор строк таблицы OpenEnds на `Project/Edit` (#openends) в `verify-manual-storage.js` (порядок первого появления кода в колонке переменных, по умолчанию `td:nth-child(5)` — порядок первого появления кода при обходе строк сверху вниз). Ключ в localStorage — **ID из URL** `/lk/project/edit/{id}`, не значение с VerifyMain.

## Важно

- Модули из этой папки сильно завязаны на общий `state` и должны грузиться после `base` и `common`.
- Bootstrap VerifyMain находится в `base/verify-bootstrap.js`, а не здесь.
- Состояние ручной чистки живёт сразу в нескольких источниках (`manualBfridsState`, `manualApiState`, DOM textarea), поэтому изменения нужно держать синхронными.
- Разбор XLSX по возможности уходит в background service worker: `ArrayBuffer` передаётся через `chrome.runtime.sendMessage` (structured clone); fallback на main thread остаётся только запасным вариантом.
