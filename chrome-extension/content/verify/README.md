# Verify

Логика страницы VerifyMain и связанных сценариев проверки OpenEnds.

Что здесь лежит:

- `verify-question-utils.js` — работа с кодами вопросов и группами переменных.
- `verify-manual-storage.js` — localStorage/API-состояние ручной чистки и локальные incorrect-ID.
- `verify-rating.js` — загрузка и разбор рейтинга, reason codes.
- `verify-modal.js` — modal UI с ответами респондента и выбором в ручную чистку.
- `verify-row-context.js` — извлечение контекста строки и поиск respondent IDs.
- `verify-index.js` — загрузка XLSX-индекса респондентов.
- `verify-row-decorate.js` — подсветка строк, иконки, кнопка `Посмотреть`, bulk-декорация грида.

Важно:

- Модули из этой папки сильно завязаны на общий `state` и должны грузиться после `base` и `common`.
- Bootstrap VerifyMain вынесен в `base/verify-bootstrap.js`, а не лежит здесь.
