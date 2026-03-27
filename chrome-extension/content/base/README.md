# Base

Базовый слой content scripts.

Что здесь лежит:

- `globals.js` — общие константы, `DEFAULT_SETTINGS`, `STOP_WORDS`, общий `state`, флаги single-run для top window.
- `page-init.js` — `init()`, определение типа страницы, `waitForBody()`, runtime messages, lifecycle панели и init для OpenEnds, VerifyMain, Pyrus и Cleaner Projects.
- `verify-bootstrap.js` — bootstrap VerifyMain: декорация грида, колонка «Другие ответы», кастомная кнопка проверки страницы и интеграция с ручной чисткой.
- `openends-shortcut.js` — shortcut-кнопка перехода из `Project/Edit#openends` к VerifyMain.
- `init.js` — финальная точка входа: определяет `PAGE_KIND`, гидратирует локальные состояния и запускает `init()`.

Важно:

- Этот каталог должен грузиться раньше feature-модулей.
- `init.js` должен оставаться последним в цепочке content scripts.
- Детальная бизнес-логика Verify/OpenEnds/Pyrus не должна разрастаться здесь: `base` отвечает за bootstrap и маршрутизацию, а не за feature-реализацию.
