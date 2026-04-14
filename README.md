# Ассистент Cleaner (Chrome Extension)

Расширение для работы с Cleaner и Pyrus: группировка OpenEnds, VerifyMain с поиском респондентов и ручной чисткой, виджеты страницы редактирования проекта, перенос данных проекта из Pyrus в Cleaner и инструменты для списка проектов.

---

## Где работает

| Сайт / страница | Режим |
|-----------------|-------|
| `clr.env7.biz/lk/Project/Edit/<id>#openends` | Панель группировки OpenEnds, shortcut в VerifyMain, penalty-toggle для групп |
| `clr.env7.biz/lk/Project/Edit/<id>#options`, `#matrix`, `#openends`, `#multiaccounts`, `#manual` | Виджет статистики по проекту на странице редактирования |
| `clr.env7.biz/lk/openends2/verifymain` | VerifyMain: respondent lookup, подсветка строк, ручная чистка |
| `clr.env7.biz/lk`, `clr.env7.biz/lk/projects` | Автозаполнение формы проекта, фильтр по авторам, избранное |
| `pyrus.com/t#id...` | Кнопка «Сетап Чистилки» и перенос payload в Cleaner |

---

## Функционал

### 1. Группировка OpenEnds

- Панель расширения открывается на странице `Project/Edit/<id>#openends`.
- Поддерживаются режимы точного совпадения и похожести текста с настраиваемым порогом.
- Есть режим «Разные переменные отдельно».
- Найденные группы сохраняются локально и пересобираются после ручной группировки/разгруппировки через штатные кнопки Cleaner.
- Массовая группировка идёт проходами по кластерам и останавливается, если за проход больше нет прогресса, чтобы не зациклиться на одном и том же наборе строк.
- На странице `#openends` рядом со штатными контролами появляется shortcut-переход к VerifyMain.

### 2. Виджеты на Project Edit

- На вкладках `#options`, `#matrix`, `#openends`, `#multiaccounts`, `#manual` добавляется виджет статистики с процентом и breakdown по причинам.
- На вкладке `#openends` добавляется penalty-toggle для строк групп.
- На вкладке `#manual` расширение синхронизирует локальный список `Bfrids` с textarea и показывает рядом с заголовком счётчик уникальных ID.
- Для penalty-toggle используется bridge в `MAIN world`, потому что часть состояния живёт внутри страницы/Kendo-grid, а не в isolated content script.

### 3. VerifyMain

- Загружается выгрузка OpenEnds (XLSX) для построения индекса респондентов.
- Разбор XLSX по возможности выполняется в background service worker; если это недоступно, используется fallback в content script.
- В грид добавляется колонка «Другие ответы» с модалкой по респонденту или списку кандидатов.
- Кастомная кнопка «Проверить страницу» сохраняет локальные incorrect ID и отправляет выбранных респондентов в ручную чистку.
- Строки подсвечиваются по reason codes из рейтинга, локальным incorrect ID и ручной чистке.
- Изменение чекбоксов `Некорректный/Отложить` оптимизировано: точечное обновление строк и батчинг через `requestAnimationFrame`, чтобы убрать заметные лаги при кликах.

### 4. Перенос из Pyrus в Cleaner

- На странице задачи Pyrus рядом с известными action-кнопками появляется «Сетап Чистилки».
- Payload проекта переносится через `chrome.storage.local`, `localStorage`, а при необходимости через query fallback.
- После открытия Cleaner расширение автоматически пытается открыть форму добавления проекта и подставить поля (`ProjectName`, `Id`, `Plan`, `DbName`).

### 5. Cleaner Projects

- Фильтр по авторам в гриде проектов.
- Избранные проекты.
- Переключатель «Только избранные».
- Автозаполнение формы проекта по payload, пришедшему из Pyrus.

---

## Технические детали

- Manifest: `MV3`, service worker в `chrome-extension/background.js`.
- Permissions: `storage`, `scripting`.
- Host permissions: `clr.env7.biz`, `pyrus.com`, `www.pyrus.com` (см. `chrome-extension/manifest.json`).
- Разбор XLSX выполняется через `xlsx.full.min.js`; для тяжёлых операций используется background-парсинг.
- Основные иконки причин Verify (`inc/speed/manual/table`) объявлены как `web_accessible_resources`.

---

## Файлы

- `chrome-extension/manifest.json` — манифест расширения (Manifest V3).
- `chrome-extension/background.js` — service worker: клик по action, открытие вкладок, инъекция penalty bridge, фоновый разбор XLSX.
- `chrome-extension/content/base/` — глобалы, маршрутизация по страницам, bootstrap и общий init.
- `chrome-extension/content/openends/` — панель группировки OpenEnds и bulk-операции.
- `chrome-extension/content/verify/` — VerifyMain и виджеты страницы Project Edit.
- `chrome-extension/content/pyrus/` — сценарий переноса данных из Pyrus в Cleaner.
- `chrome-extension/content/cleaner-projects/` — фильтры и избранное для списка проектов.
- `chrome-extension/content/styles/styles.css` — стили UI расширения.
- `chrome-extension/xlsx.full.min.js` — библиотека для разбора XLSX.
- `chrome-extension/package.json` — локальные скрипты для вспомогательной разработки.

---

## Ограничения и допущения

- Расширение рассчитано на текущую вёрстку/DOM Cleaner и Pyrus; при изменении интерфейсов может потребоваться обновление селекторов.
- Часть логики работает с `localStorage` страницы и хранит проектные состояния локально в браузере.
- Для некоторых сценариев (например, ручная чистка) требуется валидный `__RequestVerificationToken` со страницы проекта.

---

## Установка

1. Откройте `chrome://extensions/`.
2. Включите **Режим разработчика**.
3. Нажмите **Загрузить распакованное расширение**.
4. Укажите папку `chrome-extension` этого репозитория.
