# Base

Базовый слой content-скриптов.

Что здесь лежит:

- `globals.js` — общие константы, `DEFAULT_SETTINGS`, `STOP_WORDS`, общий `state`, флаги загрузки.
- `page-init.js` — `init()`, определение типа страницы, `waitForBody()`, runtime messages, show/hide панели, init для OpenEnds/Pyrus/Cleaner.
- `verify-bootstrap.js` — bootstrap для VerifyMain и интеграция кнопки проверки с ручной чисткой.
- `openends-shortcut.js` — shortcut-кнопка перехода к Verify из OpenEnds.
- `init.js` — финальная точка входа после загрузки всех модулей.

Важно:

- Этот каталог должен грузиться раньше feature-модулей.
- `init.js` должен оставаться последним в цепочке content-скриптов.
