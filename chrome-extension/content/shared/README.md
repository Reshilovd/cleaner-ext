# Shared

Модули, которые используются и в content scripts, и в service worker (`background.js`).

Что здесь лежит:

- `verify-keys.js` — ключи lookup для VerifyMain: `buildVerifyQuestionValueKey`, `buildVerifyValueOnlyKey`.
- `xlsx-loader.js` — проверка, что `XLSX` уже подключён в content bundle (без `eval`/`fetch`: CSP запрещает dynamic eval).
- `xlsx-parsers.js` — разбор XLSX OpenEnds и рейтинга: `parseOpenEndsFromXlsxArrayBuffer`, `parseRatingFromXlsxArrayBuffer`.
- `xlsx-messaging.js` — `normalizeQgaXlsxArrayBuffer` для передачи XLSX в background через `chrome.runtime.sendMessage` (structured clone, без base64 data URL).

Подключение:

- Content (основной bundle): `https://clr.env7.biz/lk/*` и Pyrus — без `xlsx.full.min.js`.
- Content (доп. XLSX): отдельный блок manifest только с `xlsx.full.min.js` для `OpenEnds2/*` и `Project/Edit/*` (fallback, если background недоступен). Паттерны с учётом регистра (`OpenEnds2`, не только `openends2`).
- Content: `verify-keys.js` → `xlsx-loader.js` → `xlsx-parsers.js`.
- Background: `importScripts` для `xlsx.full.min.js`, `verify-keys.js` и `xlsx-parsers.js`.

Правила:

- Без DOM, без `state`, без зависимостей от конкретной страницы или feature-модуля.
- Функции публикуются в глобальную область через `globalThis` / `window`, потому что расширение не использует ES modules.
- Если модуль нужен только content-слою — ему место в `common/`, а не здесь.
