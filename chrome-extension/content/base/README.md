# Base

Базовый слой content-скриптов.

Что здесь лежит:

- `01-globals.js` — общие константы, `DEFAULT_SETTINGS`, `STOP_WORDS`, общий `state`, флаги загрузки.
- `01-page-init.js` — `init()`, определение типа страницы, `waitForBody()`, runtime messages, show/hide панели, init для OpenEnds/Pyrus/Cleaner.
- `01-verify-bootstrap.js` — bootstrap для VerifyMain и интеграция кнопки проверки с ручной чисткой.
- `01-openends-shortcut.js` — shortcut-кнопка перехода к Verify из OpenEnds.
- `99-init.js` — финальная точка входа после загрузки всех модулей.

Важно:

- Этот каталог должен грузиться раньше feature-модулей.
- `99-init.js` должен оставаться последним в цепочке content-скриптов.
