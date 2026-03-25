# Pyrus

Сценарий переноса данных проекта из Pyrus в Cleaner.

Что здесь лежит:

- `03-pyrus.js` — Pyrus-специфичный UI и orchestration quick fill.
- `03-pyrus-payload.js` — сбор и нормализация payload из Pyrus.
- `03-pyrus-prefill.js` — transport и storage для передачи payload между страницами.
- `03-cleaner-form-fill.js` — низкоуровневое заполнение формы в Cleaner.
- `03-cleaner-autofill.js` — autofill-flow на стороне Cleaner.

Важно:

- Порядок загрузки внутри этой папки имеет значение: orchestration и transport должны быть доступны до запуска autofill-flow.
- Если появится ещё один способ передачи payload, его лучше добавлять рядом с `03-pyrus-prefill.js`, а не смешивать с UI.
