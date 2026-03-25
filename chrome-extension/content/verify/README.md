# Verify

Логика страницы VerifyMain и связанных сценариев проверки OpenEnds.

Что здесь лежит:

- `05-verify-question-utils.js` — работа с кодами вопросов и группами переменных.
- `05-verify-manual-storage.js` — localStorage/API-состояние ручной чистки и локальные incorrect-ID.
- `05-verify-rating.js` — загрузка и разбор рейтинга, reason codes.
- `05-verify-modal.js` — modal UI с ответами респондента и выбором в ручную чистку.
- `05-verify-row-context.js` — извлечение контекста строки и поиск respondent IDs.
- `05-verify-index.js` — загрузка XLSX-индекса респондентов.
- `05-verify-row-decorate.js` — подсветка строк, иконки, кнопка `Посмотреть`, bulk-декорация грида.

Важно:

- Модули из этой папки сильно завязаны на общий `state` и должны грузиться после `base` и `common`.
- Bootstrap VerifyMain вынесен в `base/01-verify-bootstrap.js`, а не лежит здесь.
