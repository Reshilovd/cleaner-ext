# Content script build

- **`src/`** – Content script split into modules (01-core.js … 08-init.js).
- **`build-content.js`** – Node script: concatenates `src/*.js` in alphabetical order into `content.js`.
- **`split-content.js`** – Node script: reads current `content.js` and writes the 8 source files by line ranges.

Requires **Node.js**.

## Workflow

1. **Build content.js from src** (после правок в `src/`):
   ```bash
   npm run build
   ```
   или:
   ```bash
   node build-content.js
   ```
   Перезаписывает `content.js` склейкой `src/*.js` (по алфавиту).

2. **Заново разбить content.js на модули** (если правили один файл `content.js`):
   ```bash
   npm run split
   ```
   или:
   ```bash
   node split-content.js
   ```
   Создаёт/перезаписывает `src/01-core.js` … `src/08-init.js`.
