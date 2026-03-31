# Verify

Логика VerifyMain и связанных сценариев проверки OpenEnds. В этой папке лежит не только код страницы `/lk/openends2/verifymain`, но и часть feature для `Project/Edit`.

Что здесь лежит:

- `verify-question-utils.js` — работа с кодами вопросов, grouped variables и вариантами кодов.
- `verify-manual-storage.js` — localStorage/API-состояние ручной чистки, токен, сохранённые группы OpenEnds, локальные incorrect ID, синхронизация `#Bfrids` и счётчик ID на вкладке `#manual`.
- `verify-rating.js` — парсеры XLSX, transport для background parse и reason codes из рейтинга.
- `verify-modal.js` — modal UI с ответами респондента и выбором в ручную чистку.
- `verify-row-context.js` — извлечение контекста строки и lookup respondent IDs.
- `verify-index.js` — загрузка и кэширование XLSX-индекса респондентов.
- `verify-row-decorate.js` — подсветка строк, иконки reason codes, колонка «Другие ответы», обновление видимости.
- `project-edit-stats.js` — виджет статистики на `Project/Edit` и penalty-toggle на вкладке `#openends`.
- `project-edit-penalty-bridge.js` — bridge-скрипт, который инжектится в `MAIN world` для работы с page-side Kendo state и `GroupUpdate`.

Важно:

- Модули из этой папки сильно завязаны на общий `state` и должны грузиться после `base` и `common`.
- Bootstrap VerifyMain находится в `base/verify-bootstrap.js`, а не здесь.
- Состояние ручной чистки живёт сразу в нескольких источниках (`manualBfridsState`, `manualApiState`, DOM textarea), поэтому изменения нужно держать синхронными.
- Разбор XLSX по возможности уходит в background service worker через сообщения; fallback на main thread остаётся только запасным вариантом.
