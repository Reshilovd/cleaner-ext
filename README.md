# Ассистент группировки вопросов CleanerUI (расширение Chrome)

Расширение:

- группирует дубли в OpenEnds на `clr.env7.biz`;
- переносит проект из Pyrus в CleanerUI через кнопку `В CleanerUI` с автозаполнением формы.

## Файлы

- `chrome-extension/manifest.json`
- `chrome-extension/content.js`
- `chrome-extension/background.js`

## Установка

1. Откройте `chrome://extensions/`.
2. Включите режим разработчика.
3. Нажмите `Загрузить распакованное расширение`.
4. Выберите папку `c:\Users\denis.reshilov\Projects\tampermonk\chrome-extension`.

## OpenEnds

1. Откройте `https://clr.env7.biz/lk/Project/Edit/<id>#openEnds`.
2. Нажмите иконку расширения в панели Chrome.
3. Для полного прогона используйте `Сгруппировать все`.

## Перенос из Pyrus

1. Откройте карточку задачи в Pyrus: `https://pyrus.com/t#id...`.
2. Нажмите кнопку `В CleanerUI` в верхнем блоке кнопок.
3. Расширение откроет `https://clr.env7.biz/lk?qga_autofill=1` в новой вкладке и заполнит форму.

Заполняются поля:

- `Наименование проекта`
- `ID проекта`
- `План`
- `База ОД`

## Важно

- Кнопка `Заполнить из Pyrus` в форме CleanerUI отключена и не используется.
- Если новая вкладка не открывается, проверьте, что расширение обновлено и включено.
