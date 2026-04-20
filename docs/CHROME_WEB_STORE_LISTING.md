# Chrome Web Store Listing

## Store Name

Cleaner Assistant

## Short Description

Внутренний инструмент для Cleaner и Pyrus: OpenEnds, VerifyMain, ручная чистка и перенос данных проекта.

## Full Description

`Cleaner Assistant` - внутреннее расширение для рабочих сценариев в `Cleaner` и `Pyrus`.

Расширение ускоряет типовые операции сотрудников и уменьшает объем ручных действий в интерфейсе:

- группировка OpenEnds на странице редактирования проекта;
- быстрый переход и вспомогательные инструменты для `VerifyMain`;
- поиск респондентов по выгрузке OpenEnds;
- подсветка строк и причины для проверки;
- добавление респондентов в ручную чистку;
- перенос данных проекта из `Pyrus` в `Cleaner`;
- фильтрация и избранное в списке проектов Cleaner.

Расширение работает только на целевых доменах компании:

- `https://clr.env7.biz/*`
- `https://pyrus.com/*`
- `https://www.pyrus.com/*`

Расширение не показывает рекламу, не внедряет сторонние скрипты и не отправляет собранные данные на внешние серверы разработчика. Локальное хранилище браузера используется только для настроек, временных состояний интерфейса и кэша, необходимых для работы внутри `Cleaner` и `Pyrus`.

## Single Purpose

Повысить скорость и точность внутренних рабочих операций в `Cleaner` и `Pyrus`: группировка OpenEnds, проверка ответов, ручная чистка и перенос проектных данных между корпоративными системами.

## Permissions Justification

### `storage`

Используется для сохранения локальных настроек, избранных проектов, кэша промежуточных данных и временных состояний интерфейса между страницами `Cleaner` и `Pyrus`.

### `scripting`

Используется для инъекции служебного bridge-скрипта на страницу редактирования проекта в Cleaner, где часть состояния живет в основном контексте страницы и недоступна напрямую обычному content script.

### Host permissions

- `https://clr.env7.biz/*` - основной рабочий домен Cleaner, где расширение добавляет UI, читает текущую страницу и автоматизирует действия пользователя.
- `https://pyrus.com/*`
- `https://www.pyrus.com/*`

Доступ к Pyrus нужен только для сценария переноса данных проекта из карточки задачи в Cleaner.

## Privacy Answers Draft

### Does the extension collect user data?

No.

### Is data sold to third parties?

No.

### Is data used for anything other than the extension's single purpose?

No.

### Is data transferred to third parties?

No.

### Does the extension use authentication or tokens from the target site?

Yes, only to perform user-initiated actions inside the target corporate web application. Tokens are read from the current page session and are not transmitted to developer-owned servers.
