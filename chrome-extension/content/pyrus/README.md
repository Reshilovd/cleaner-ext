# Pyrus

Сценарий переноса данных проекта из Pyrus в Cleaner.

Что здесь лежит:

- `pyrus.js` — Pyrus-специфичный UI и orchestration quick fill; вставка кнопки «Сетап Чистилки», группировка action-кнопок по секциям «Программисты/Менеджеры», адаптивная сетка кнопок.
- `pyrus-payload.js` — сбор и нормализация payload из Pyrus.
- `pyrus-prefill.js` — transport и storage для передачи payload между страницами.
- `cleaner-form-fill.js` — низкоуровневое заполнение формы в Cleaner.
- `cleaner-autofill.js` — autofill-flow на стороне Cleaner.

Важно:

- Порядок загрузки внутри этой папки имеет значение: orchestration и transport должны быть доступны до запуска autofill-flow.
- Если появится ещё один способ передачи payload, его лучше добавлять рядом с `pyrus-prefill.js`, а не смешивать с UI.
- Группировка кнопок в `pyrus.js` опирается на тексты action-кнопок и текущую DOM-структуру Pyrus, поэтому при изменениях интерфейса Pyrus в первую очередь проверяйте селекторы и маркеры в этой логике.
