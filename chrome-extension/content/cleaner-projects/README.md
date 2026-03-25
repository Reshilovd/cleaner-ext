# Cleaner Projects

Логика для страницы списка проектов в Cleaner.

Что здесь лежит:

- `cleaner-projects-author-filter.js` — фильтр по авторам, кеширование списка авторов, применение фильтра к гриду.
- `cleaner-projects-favorites.js` — избранное, toggle `Только избранные`, сохранение состояния в localStorage.

Важно:

- Эти модули должны работать только в режиме `cleaner_projects`.
- UI и storage здесь допустимы, но общие утилиты лучше выносить в `common` или `storage`.
