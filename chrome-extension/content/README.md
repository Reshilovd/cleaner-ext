# Content Scripts

Каталог `content/` содержит content scripts расширения, разложенные по зонам ответственности.

Порядок загрузки задаётся в `chrome-extension/manifest.json` и для части модулей критичен: сначала грузятся глобалы и базовый bootstrap, затем общие утилиты, затем feature-модули, и только в конце общий `init`.

Структура:

- `base` — глобальное состояние, определение типа страницы, bootstrap VerifyMain, shortcut из OpenEnds и общий вход.
- `common` — мелкие общие DOM-, text- и timing-утилиты без привязки к конкретной feature.
- `cleaner-projects` — фильтр по авторам, избранное и related UI для списка проектов Cleaner.
- `pyrus` — извлечение payload из Pyrus, transport между страницами и autofill-flow в Cleaner.
- `storage` — сохранение настроек панели OpenEnds.
- `styles` — CSS для UI расширения.
- `verify` — VerifyMain и часть логики страницы `Project/Edit`: respondent lookup, rating/manual state, синхронизация ручной чистки, модалки, project-edit stats и penalty-toggle.
- `openends` — панель группировки OpenEnds, сканирование грида, bulk-операции и защита bulk-проходов от зацикливания.

Важно:

- Это только content-слой. Часть тяжёлой логики, например фоновый разбор XLSX и инъекция bridge-скрипта, вынесена в `chrome-extension/background.js`.
- Модули из `verify/`, `openends/`, `pyrus/` и `cleaner-projects/` опираются на общий `state` из `base/globals.js`.
