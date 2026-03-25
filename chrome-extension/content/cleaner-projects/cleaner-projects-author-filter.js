"use strict";

    function setupCleanerProjectsAuthorFilter() {
        if (state.cleanerProjectsAuthorFilterBound) {
            ensureCleanerProjectsAuthorFilterBound();
            return;
        }

        state.cleanerProjectsAuthorFilterBound = true;
        ensureCleanerProjectsAuthorFilterBound();

        const observer = new MutationObserver((mutations) => {
            // Не делаем тяжёлые пересчёты на изменениях, которые создаёт сам dropdown,
            // иначе при больших таблицах можно получить лаги/фриз.
            if (!Array.isArray(mutations) || mutations.length === 0) return;

            const isRelevant = mutations.some((m) => isCleanerProjectsAuthorMutationRelevant(m));
            if (!isRelevant) return;

            invalidateCleanerProjectsAuthorFilterCache();

            scheduleCleanerProjectsAuthorFilterApply();
        });

        observer.observe(document.body, { childList: true, subtree: true });
        state.cleanerProjectsAuthorFilterObserver = observer;

        document.addEventListener("click", (event) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            if (!target) return;
            if (target.closest(".qga-author-filter-dropdown") || target.closest(".qga-author-filter-trigger")) {
                return;
            }
            closeCleanerProjectsAuthorDropdown();
        });

        document.addEventListener("keydown", (event) => {
            if (!(event instanceof KeyboardEvent)) return;
            if (event.key !== "Escape") return;
            const dropdown = document.querySelector(".qga-author-filter-dropdown");
            if (dropdown) {
                closeCleanerProjectsAuthorDropdown();
            }
        });
    }

    function isCleanerProjectsAuthorMutationRelevant(mutation) {
        if (!mutation) return false;
        const target = mutation.target instanceof Element ? mutation.target : null;
        if (!target) return false;

        // Игнорируем изменения внутри нашего UI.
        if (target.closest(".qga-author-filter-dropdown") || target.closest(".qga-author-filter-controls")) {
            return false;
        }

        // Считаем релевантными изменения грида.
        if (target.closest(".k-grid-content") || target.closest(".k-grid-header")) {
            return true;
        }

        // На случай когда target не попадает внутрь нужных контейнеров,
        // проверяем добавленные ноды.
        if (Array.isArray(mutation.addedNodes) && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                const el = node instanceof Element ? node : null;
                if (!el) continue;
                if (el.closest(".k-grid-content") || el.closest(".k-grid-header")) return true;
                if (el.closest(".qga-author-filter-dropdown") || el.closest(".qga-author-filter-controls")) return false;
            }
        }

        return false;
    }

    function scheduleCleanerProjectsAuthorFilterApply() {
        if (state.cleanerProjectsAuthorFilterApplyScheduled) return;
        state.cleanerProjectsAuthorFilterApplyScheduled = true;

        const delay = Number.isFinite(state.cleanerProjectsAuthorFilterObserverThrottleMs)
            ? Math.max(0, state.cleanerProjectsAuthorFilterObserverThrottleMs)
            : 120;

        setTimeout(() => {
            state.cleanerProjectsAuthorFilterApplyScheduled = false;
            ensureCleanerProjectsAuthorFilterBound();
            applyCleanerProjectsAuthorFilter();
        }, delay);
    }

    function invalidateCleanerProjectsAuthorFilterCache() {
        state.cleanerProjectsAuthorFilterAuthorsCache = null;
        state.cleanerProjectsAuthorFilterAuthorsCacheGridRoot = null;
        state.cleanerProjectsAuthorFilterCacheInvalidatedAt = Date.now();
    }

    function ensureCleanerProjectsAuthorFilterBound() {
        const binding = findCleanerProjectsAuthorHeaderBinding();
        if (!binding) {
            closeCleanerProjectsAuthorDropdown();
            return false;
        }

        const { headerCell, authorIndex } = binding;
        if (state.cleanerProjectsAuthorColumnIndex !== authorIndex) {
            invalidateCleanerProjectsAuthorFilterCache();
        }
        state.cleanerProjectsAuthorColumnIndex = authorIndex;

        headerCell.classList.add("qga-author-filter-header");
        headerCell.style.cursor = "pointer";

        if (headerCell.dataset.qgaAuthorFilterBound === "1") {
            refreshCleanerProjectsAuthorHeaderLabel(headerCell);
            applyCleanerProjectsAuthorFilter();
            return true;
        }

        headerCell.dataset.qgaAuthorFilterBound = "1";
        const clickHandler = (event) => {
            if (!(event instanceof MouseEvent)) return;
            event.preventDefault();
            event.stopPropagation();
            toggleCleanerProjectsAuthorDropdown(headerCell);
        };

        headerCell.addEventListener("click", clickHandler);
        refreshCleanerProjectsAuthorHeaderLabel(headerCell);
        applyCleanerProjectsAuthorFilter();
        return true;
    }

    function findCleanerProjectsAuthorHeaderBinding() {
        const candidateGrids = Array.from(document.querySelectorAll("#grid, [data-role='grid']"));
        for (const grid of candidateGrids) {
            const headerCells = grid.querySelectorAll(".k-grid-header th[role='columnheader']");
            if (!headerCells.length) continue;
            for (let i = 0; i < headerCells.length; i += 1) {
                const headerText = normalizeSearchText(headerCells[i].textContent || "");
                if (!headerText) continue;
                if (headerText.includes("автор") || headerText.includes("author")) {
                    return {
                        gridRoot: grid,
                        headerCell: headerCells[i],
                        authorIndex: i
                    };
                }
            }
        }
        return null;
    }

    function refreshCleanerProjectsAuthorHeaderLabel(headerCell) {
        if (!headerCell) return;

        if (!headerCell.dataset.qgaAuthorOriginalText) {
            // Сохраняем текст заголовка до добавления индикатора фильтра.
            const raw = String(headerCell.textContent || "");
            headerCell.dataset.qgaAuthorOriginalText = raw.replace(/\u25be/g, "").trim();
        }

        let trigger = headerCell.querySelector(".qga-author-filter-trigger");
        if (!trigger) {
            trigger = document.createElement("span");
            trigger.className = "qga-author-filter-trigger";
            trigger.textContent = " \u25be";
            headerCell.appendChild(trigger);
        }
        const selectedCount = state.cleanerProjectsSelectedAuthors.size;
        const selectedTitle = selectedCount > 0
            ? `Фильтр авторов: выбрано ${selectedCount}`
            : "Фильтр авторов";
        headerCell.title = selectedTitle;
        trigger.setAttribute("aria-label", selectedTitle);

        // Показываем количество выбранных рядом с `Автор`.
        trigger.textContent =
            selectedCount > 0 ? ` \u25be (${selectedCount})` : " \u25be";
    }

    function normalizeCleanerProjectsAuthorKey(value) {
        // Быстрое нормализование для фильтра (без тяжёлых regex из normalizeSearchText).
        // Важно: используется одинаково и для автора из строки, и для текста поиска/выбранных.
        return normalizeSingleLine(value)
            .toLowerCase()
            .replace(/ё/g, "е");
    }

    function getCleanerProjectsGridRootWithAuthor() {
        const binding = findCleanerProjectsAuthorHeaderBinding();
        if (!binding) return null;
        state.cleanerProjectsAuthorColumnIndex = binding.authorIndex;
        return binding.gridRoot;
    }

    function getCleanerProjectsRows(gridRoot) {
        if (!gridRoot) return [];
        return Array.from(gridRoot.querySelectorAll(".k-grid-content tbody tr"));
    }

    function getCleanerProjectsAuthorByRow(row, authorIndex) {
        if (!(row instanceof HTMLTableRowElement) || authorIndex < 0) return "";
        const cells = row.querySelectorAll("td");
        if (!cells.length || authorIndex >= cells.length) return "";
        return normalizeSingleLine(cells[authorIndex].textContent || "");
    }

    function getCleanerProjectsAvailableAuthors() {
        const gridRoot = getCleanerProjectsGridRootWithAuthor();
        if (!gridRoot) return [];

        // Возвращаем кэш, чтобы не сканировать весь грид при каждом открытии.
        if (state.cleanerProjectsAuthorFilterAuthorsCacheGridRoot === gridRoot) {
            return state.cleanerProjectsAuthorFilterAuthorsCache || [];
        }

        const authorIndex = state.cleanerProjectsAuthorColumnIndex;
        if (authorIndex < 0) return [];

        const rows = getCleanerProjectsRows(gridRoot);
        const authorMap = new Map();
        for (const row of rows) {
            const author = getCleanerProjectsAuthorByRow(row, authorIndex);
            if (!author) continue;
            const key = normalizeCleanerProjectsAuthorKey(author);
            if (!key || authorMap.has(key)) continue;
            authorMap.set(key, author);
        }

        const authors = Array.from(authorMap.values()).sort((a, b) => a.localeCompare(b, "ru"));
        state.cleanerProjectsAuthorFilterAuthorsCache = authors;
        state.cleanerProjectsAuthorFilterAuthorsCacheGridRoot = gridRoot;
        return authors;
    }

    function applyCleanerProjectsAuthorFilter() {
        const gridRoot = getCleanerProjectsGridRootWithAuthor();
        if (!gridRoot) return;
        const authorIndex = state.cleanerProjectsAuthorColumnIndex;
        if (authorIndex < 0) return;
        const selected = state.cleanerProjectsSelectedAuthors;
        const hasFilter = selected && selected.size > 0;
        const rows = getCleanerProjectsRows(gridRoot);
        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            if (!hasFilter) {
                row.classList.remove("qga-author-filter-hidden-row");
                continue;
            }
            const author = getCleanerProjectsAuthorByRow(row, authorIndex);
            const normalizedAuthor = normalizeCleanerProjectsAuthorKey(author);
            if (selected.has(normalizedAuthor)) {
                row.classList.remove("qga-author-filter-hidden-row");
            } else {
                row.classList.add("qga-author-filter-hidden-row");
            }
        }
    }

    function closeCleanerProjectsAuthorDropdown() {
        const dropdown = document.querySelector(".qga-author-filter-dropdown");
        if (dropdown) {
            dropdown.remove();
        }
    }

    function toggleCleanerProjectsAuthorDropdown(headerCell) {
        const existing = document.querySelector(".qga-author-filter-dropdown");
        if (existing) {
            existing.remove();
            return;
        }
        openCleanerProjectsAuthorDropdown(headerCell);
    }

    function openCleanerProjectsAuthorDropdown(headerCell) {
        closeCleanerProjectsAuthorDropdown();
        const authors = getCleanerProjectsAvailableAuthors();
        const selected = state.cleanerProjectsSelectedAuthors;

        const dropdown = document.createElement("div");
        dropdown.className = "qga-author-filter-dropdown";

        const searchWrap = document.createElement("div");
        searchWrap.className = "qga-author-filter-search";
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "qga-author-filter-search-input";
        searchInput.placeholder = "Поиск по авторам";
        searchInput.setAttribute("aria-label", "Поиск по авторам");
        searchWrap.appendChild(searchInput);
        dropdown.appendChild(searchWrap);

        const controls = document.createElement("div");
        controls.className = "qga-author-filter-controls";

        const clearButton = document.createElement("button");
        clearButton.type = "button";
        clearButton.textContent = "Сбросить";
        clearButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            selected.clear();
            applyCleanerProjectsAuthorFilter();
            closeCleanerProjectsAuthorDropdown();
            refreshCleanerProjectsAuthorHeaderLabel(headerCell);
        });

        controls.appendChild(clearButton);
        dropdown.appendChild(controls);

        const list = document.createElement("div");
        list.className = "qga-author-filter-list";

        if (authors.length === 0) {
            const empty = document.createElement("div");
            empty.className = "qga-author-filter-empty";
            empty.textContent = "Авторы не найдены";
            list.appendChild(empty);
        }

        const itemNodes = [];
        for (const author of authors) {
            const key = normalizeCleanerProjectsAuthorKey(author);
            if (!key) continue;

            const item = document.createElement("label");
            item.className = "qga-author-filter-item";
            item.dataset.qgaAuthorKey = key;

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = selected.has(key);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selected.add(key);
                } else {
                    selected.delete(key);
                }
                applyCleanerProjectsAuthorFilter();
                refreshCleanerProjectsAuthorHeaderLabel(headerCell);
            });

            const text = document.createElement("span");
            text.textContent = author;

            item.appendChild(checkbox);
            item.appendChild(text);
            list.appendChild(item);
            itemNodes.push(item);
        }

        dropdown.appendChild(list);
        document.body.appendChild(dropdown);

        const rect = headerCell.getBoundingClientRect();
        const top = rect.bottom + window.scrollY + 4;
        const left = rect.left + window.scrollX;
        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;

        // Автофокус на поле поиска, чтобы не требовалось доп. кликов.
        setTimeout(() => {
            try {
                searchInput.focus();
                searchInput.select();
            } catch (e) {
                // Ничего страшного: на некоторых страницах select может бросать исключения.
            }
        }, 0);

        const applySearchFilter = () => {
            const q = normalizeCleanerProjectsAuthorKey(searchInput.value || "");
            for (const item of itemNodes) {
                const itemKey = String(item.dataset.qgaAuthorKey || "");
                const match = !q || itemKey.includes(q);
                item.style.display = match ? "" : "none";
            }
        };

        searchInput.addEventListener("input", applySearchFilter);
        applySearchFilter();

        searchInput.addEventListener("keydown", (event) => {
            if (!(event instanceof KeyboardEvent)) return;
            if (event.key !== "Enter") return;

            // Если в списке остался один видимый автор — отмечаем его.
            const visibleItems = itemNodes.filter((item) => item.style.display !== "none");
            if (visibleItems.length !== 1) return;

            event.preventDefault();
            event.stopPropagation();

            const item = visibleItems[0];
            const key = String(item.dataset.qgaAuthorKey || "");
            if (!key) return;

            const checkbox = item.querySelector("input[type='checkbox']");
            if (checkbox instanceof HTMLInputElement) {
                checkbox.checked = true;
            }

            selected.add(key);
            applyCleanerProjectsAuthorFilter();
            refreshCleanerProjectsAuthorHeaderLabel(headerCell);
            closeCleanerProjectsAuthorDropdown();
        });
    }

