# Content Scripts

Этот каталог содержит content-скрипты расширения, разложенные по зонам ответственности.

Порядок загрузки задаётся в [manifest.json](/c:/Users/denis.reshilov/Projects/cleaner-ext/cleaner-ext/chrome-extension/manifest.json) и для части модулей критичен: сначала грузятся базовые глобалы и bootstrap, затем feature-модули, в конце общий init.

Структура:

- `base` — общие глобалы, page bootstrap, runtime/init-логика.
- `common` — мелкие общие утилиты без привязки к конкретной feature.
- `cleaner-projects` — фильтры и избранное на списке проектов Cleaner.
- `pyrus` — сценарий переноса данных из Pyrus в Cleaner.
- `storage` — работа с сохранением настроек расширения.
- `styles` — инъекция CSS для UI расширения.
- `verify` — VerifyMain: индекс респондентов, рейтинг, модалки, ручная чистка.
- `openends` — панель группировки OpenEnds, сканирование и bulk-операции.
