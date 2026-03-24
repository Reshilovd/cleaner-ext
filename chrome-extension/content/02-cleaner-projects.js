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

    function setupCleanerProjectsFavorites() {
        if (state.cleanerProjectsFavoritesBound) {
            syncCleanerProjectsFavoritesUI();
            return;
        }

        state.cleanerProjectsFavoritesBound = true;
        state.cleanerProjectsFavoritesSet = loadCleanerProjectsFavoritesSet();

        // Первичная синхронизация сразу после инициализации.
        syncCleanerProjectsFavoritesUI();

        const observer = new MutationObserver((mutations) => {
            if (!Array.isArray(mutations) || mutations.length === 0) return;

            // Обновляем UI только если в гриде появились/заменились строки.
            const isRelevant = mutations.some((m) => {
                const target = m && m.target instanceof Element ? m.target : null;
                if (!target) return false;
                if (target.closest(".k-grid-content")) return true;
                if (target.closest(".k-grid-header")) return true;
                if (Array.isArray(m.addedNodes) && m.addedNodes.length > 0) {
                    for (const node of m.addedNodes) {
                        const el = node instanceof Element ? node : null;
                        if (!el) continue;
                        if (el.closest(".k-grid-content")) return true;
                        if (el.closest(".k-grid-header")) return true;
                    }
                }
                return false;
            });

            if (!isRelevant) return;

            if (state.cleanerProjectsFavoritesUiScheduled) return;
            state.cleanerProjectsFavoritesUiScheduled = true;

            const delay = Number.isFinite(state.cleanerProjectsFavoritesObserverThrottleMs)
                ? Math.max(0, state.cleanerProjectsFavoritesObserverThrottleMs)
                : 160;

            setTimeout(() => {
                state.cleanerProjectsFavoritesUiScheduled = false;
                syncCleanerProjectsFavoritesUI();
            }, delay);
        });

        observer.observe(document.body, { childList: true, subtree: true });
        state.cleanerProjectsFavoritesObserver = observer;
    }

    function loadCleanerProjectsFavoritesOnlyEnabled() {
        try {
            const raw = localStorage.getItem(CLEANER_PROJECTS_FAVORITES_ONLY_STORAGE_KEY);
            if (raw === "1") return true;
            if (raw === "0") return false;
            return false;
        } catch (e) {
            return false;
        }
    }

    function saveCleanerProjectsFavoritesOnlyEnabled(enabled) {
        try {
            localStorage.setItem(CLEANER_PROJECTS_FAVORITES_ONLY_STORAGE_KEY, enabled ? "1" : "0");
        } catch (e) {
            console.warn("[QGA] Не удалось сохранить only-favorites настройку:", e);
        }
    }

    function findCleanerProjectsNameSearchInput() {
        const candidates = Array.from(document.querySelectorAll("input"));
        for (const input of candidates) {
            if (!(input instanceof HTMLInputElement)) continue;
            if (!isElementVisible(input)) continue;

            const placeholder = input.getAttribute("placeholder") || "";
            const aria = input.getAttribute("aria-label") || "";
            const title = input.getAttribute("title") || "";
            const text = normalizeSingleLine(`${placeholder} ${aria} ${title}`)
                .toLowerCase()
                .replace(/ё/g, "е");

            if (!text) continue;
            if (text.includes("наимен") && text.includes("по")) return input;
            if (text.includes("наимен")) return input;
            if (text.includes("project") && text.includes("name")) return input;
        }
        return null;
    }

    function applyCleanerProjectsFavoritesOnlyFilter() {
        const gridRoot = getCleanerProjectsGridRootForFavorites();
        if (!gridRoot) return;

        if (state.cleanerProjectsIdColumnIndex < 0) {
            state.cleanerProjectsIdColumnIndex = findCleanerProjectsIdHeaderIndex(gridRoot);
        }
        const idColumnIndex = state.cleanerProjectsIdColumnIndex;
        if (idColumnIndex < 0) return;

        const favorites = getCleanerProjectsFavoritesSet();
        const enabled = state.cleanerProjectsFavoritesOnlyEnabled;
        const rows = gridRoot.querySelectorAll(".k-grid-content tbody tr");

        for (const row of Array.from(rows)) {
            if (!(row instanceof HTMLTableRowElement)) continue;

            const projectId = getCleanerProjectsProjectIdByRow(row, idColumnIndex);
            if (!projectId) {
                row.classList.remove("qga-cleaner-project-fav-only-hidden-row");
                continue;
            }

            const isFav = favorites.has(projectId);
            row.classList.toggle("qga-cleaner-project-fav-only-hidden-row", enabled && !isFav);
        }
    }

    window.onFavoritesOnlyChange = function(checked) {
        state.cleanerProjectsFavoritesOnlyEnabled = Boolean(checked);
        saveCleanerProjectsFavoritesOnlyEnabled(state.cleanerProjectsFavoritesOnlyEnabled);
        applyCleanerProjectsFavoritesOnlyFilter();
    };

    function syncFavoritesOnlySwitchUI(root, checked) {
        if (!(root instanceof HTMLElement)) return;
        const switchBox = root.querySelector("#qga-favorites-only-switch") || root;
        const isChecked = Boolean(checked);
        switchBox.className = isChecked ? "k-switch k-widget k-switch-on" : "k-switch k-widget k-switch-off";
        switchBox.setAttribute("aria-checked", String(isChecked));
        const input = root.querySelector("input[type='checkbox']");
        if (input instanceof HTMLInputElement) {
            input.checked = isChecked;
        }
    }

    function setupCleanerProjectsFavoritesOnlyToggle() {
        if (state.cleanerProjectsFavoritesOnlyToggleBound) {
            applyCleanerProjectsFavoritesOnlyFilter();
            return;
        }

        state.cleanerProjectsFavoritesOnlyToggleBound = true;
        state.cleanerProjectsFavoritesOnlyEnabled = loadCleanerProjectsFavoritesOnlyEnabled();

        const searchInput = findCleanerProjectsNameSearchInput();
        if (!searchInput) {
            // Если пока не успело подгрузиться — попробуем позже ещё пару раз.
            let attempts = 0;
            const tryLater = () => {
                attempts += 1;
                const again = findCleanerProjectsNameSearchInput();
                if (!again || attempts > 20) {
                    return;
                }
                setupCleanerProjectsFavoritesOnlyToggle();
            };
            setTimeout(tryLater, 400);
            return;
        }

        const existing = document.getElementById("qga-cleaner-only-favorites-toggle");
        if (existing) {
            syncFavoritesOnlySwitchUI(existing, state.cleanerProjectsFavoritesOnlyEnabled);
            applyCleanerProjectsFavoritesOnlyFilter();
            return;
        }

        const filterText = document.createElement("span");
        filterText.id = "qga-cleaner-only-favorites-toggle";
        filterText.className = "filter_text";

        const switchSpan = document.createElement("span");
        switchSpan.id = "qga-favorites-only-switch";
        switchSpan.className = "k-switch k-widget";
        switchSpan.setAttribute("role", "switch");
        switchSpan.setAttribute("tabindex", "0");

        const input = document.createElement("input");
        input.type = "checkbox";
        input.style.display = "none";

        const container = document.createElement("span");
        container.className = "k-switch-container";

        const labelOn = document.createElement("span");
        labelOn.className = "k-switch-label-on";
        labelOn.textContent = "On";

        const labelOff = document.createElement("span");
        labelOff.className = "k-switch-label-off";
        labelOff.textContent = "Off";

        const handle = document.createElement("span");
        handle.className = "k-switch-handle";

        container.appendChild(labelOn);
        container.appendChild(labelOff);
        container.appendChild(handle);

        switchSpan.appendChild(input);
        switchSpan.appendChild(container);

        const text = document.createElement("span");
        text.textContent = "Только избранные";

        filterText.appendChild(switchSpan);
        filterText.appendChild(document.createTextNode("\u00A0\u00A0"));
        filterText.appendChild(text);

        const dropdownRight = document.querySelector(".dropdown.float-right");
        if (dropdownRight instanceof HTMLElement) {
            dropdownRight.insertBefore(filterText, dropdownRight.firstElementChild);
        } else {
            const myProjectsElement = Array.from(document.querySelectorAll("label, span, div, a, p")).find((el) => {
                const txt = (el.textContent || "").trim();
                return txt === "Мои проекты" || txt === "Мои проекты:" || txt.startsWith("Мои проекты");
            });

            if (myProjectsElement && myProjectsElement.parentElement) {
                myProjectsElement.parentElement.insertBefore(filterText, myProjectsElement);
            } else {
                searchInput.insertAdjacentElement("afterend", filterText);
            }
        }

        const toggleSwitchState = () => {
            const checked = !state.cleanerProjectsFavoritesOnlyEnabled;
            window.onFavoritesOnlyChange(checked);
            syncFavoritesOnlySwitchUI(switchSpan, checked);
        };

        switchSpan.addEventListener("click", toggleSwitchState);
        switchSpan.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter" || evt.key === " ") {
                evt.preventDefault();
                toggleSwitchState();
            }
        });

        syncFavoritesOnlySwitchUI(filterText, state.cleanerProjectsFavoritesOnlyEnabled);

        applyCleanerProjectsFavoritesOnlyFilter();
    }
    function getCleanerProjectsFavoritesSet() {
        if (!state.cleanerProjectsFavoritesSet) {
            state.cleanerProjectsFavoritesSet = loadCleanerProjectsFavoritesSet();
        }
        return state.cleanerProjectsFavoritesSet;
    }

    function loadCleanerProjectsFavoritesSet() {
        try {
            const raw = localStorage.getItem(CLEANER_PROJECTS_FAVORITES_STORAGE_KEY);
            if (!raw) return new Set();
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return new Set();
            const set = new Set();
            for (const v of parsed) {
                const id = sanitizeProjectId(v);
                if (id) set.add(id);
            }
            return set;
        } catch (e) {
            console.warn("[QGA] Не удалось прочитать favorites проектов:", e);
            return new Set();
        }
    }

    function saveCleanerProjectsFavoritesSet(set) {
        try {
            if (!set || !(set instanceof Set)) return;
            localStorage.setItem(
                CLEANER_PROJECTS_FAVORITES_STORAGE_KEY,
                JSON.stringify(Array.from(set).sort((a, b) => String(a).localeCompare(String(b))))
            );
        } catch (e) {
            console.warn("[QGA] Не удалось сохранить favorites проектов:", e);
        }
    }

    function getCleanerProjectsGridRootForFavorites() {
        // Для простоты используем тот же грид, что и для фильтра авторов.
        const binding = findCleanerProjectsAuthorHeaderBinding();
        if (!binding) return null;
        return binding.gridRoot;
    }

    function findCleanerProjectsIdHeaderIndex(gridRoot) {
        if (!gridRoot) return -1;
        const headerCells = gridRoot.querySelectorAll(".k-grid-header th[role='columnheader']");
        if (!headerCells || !headerCells.length) return -1;
        for (let i = 0; i < headerCells.length; i += 1) {
            const t = normalizeSearchText(headerCells[i].textContent || "");
            if (!t) continue;
            if (t === "id" || t.includes("id") || t.includes("номер")) {
                return i;
            }
        }
        return -1;
    }

    function getCleanerProjectsProjectIdByRow(row, idColumnIndex) {
        if (!(row instanceof HTMLTableRowElement)) return "";
        if (idColumnIndex < 0) return "";

        const extractNumeric = (value) => {
            if (!value) return "";
            const normalized = normalizeSingleLine(String(value));
            if (!normalized) return "";
            const m = normalized.match(/\d+/);
            return m ? m[0] : "";
        };

        const editLink = row.querySelector("a[href*='/Project/Edit/'], a[href*='/project/edit/']");
        if (editLink && editLink instanceof HTMLAnchorElement) {
            const rawHref = editLink.getAttribute("href") || editLink.href || "";
            const match = rawHref.match(/\/Project\/Edit\/(\d+)/i);
            if (match && match[1]) {
                return match[1];
            }

            const linkId = extractNumeric(rawHref);
            if (linkId) return linkId;
        }

        const anyLink = row.querySelector("a[href*='/project/'], a[href*='/Project/']");
        if (anyLink && anyLink instanceof HTMLAnchorElement) {
            const rawHref = anyLink.getAttribute("href") || anyLink.href || "";
            const linkId = extractNumeric(rawHref);
            if (linkId) return linkId;
        }

        const cells = row.querySelectorAll("td");
        if (!cells.length) return "";

        if (idColumnIndex < cells.length) {
            const idValue = extractNumeric(cells[idColumnIndex].textContent || "");
            if (idValue) return idValue;
        }

        // Резервный вариант: ищем номер внутри всей строки
        const wholeText = row.textContent || "";
        const allMatch = wholeText.match(/(\d+)/);
        if (allMatch && allMatch[1]) {
            return allMatch[1];
        }

        return "";
    }

    function syncCleanerProjectsFavoritesUI() {
        const gridRoot = getCleanerProjectsGridRootForFavorites();
        if (!gridRoot) return;

        if (state.cleanerProjectsIdColumnIndex < 0) {
            state.cleanerProjectsIdColumnIndex = findCleanerProjectsIdHeaderIndex(gridRoot);
        }

        const idColumnIndex = state.cleanerProjectsIdColumnIndex;
        if (idColumnIndex < 0) return;

        const favorites = getCleanerProjectsFavoritesSet();

        const rows = gridRoot.querySelectorAll(".k-grid-content tbody tr");
        for (const row of Array.from(rows)) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            const projectId = getCleanerProjectsProjectIdByRow(row, idColumnIndex);
            if (!projectId) {
                row.classList.remove("qga-cleaner-project-fav-only-hidden-row");
                continue;
            }

            const isFav = favorites.has(projectId);
            // row.classList.toggle("qga-cleaner-project-fav-row", isFav);
            if (state.cleanerProjectsFavoritesOnlyEnabled) {
                row.classList.toggle("qga-cleaner-project-fav-only-hidden-row", !isFav);
            } else {
                row.classList.remove("qga-cleaner-project-fav-only-hidden-row");
            }

            let btn = row.querySelector(".qga-cleaner-project-fav-btn");
            if (!(btn instanceof HTMLElement)) {
                const cells = row.querySelectorAll("td");
                const firstCell = cells.length > 0 ? cells[0] : null;

                btn = document.createElement("div");
                btn.className = "qga-cleaner-project-fav-btn";
                btn.dataset.qgaCleanerProjectId = projectId;
                btn.setAttribute("aria-label", isFav ? "Убрать из избранного" : "Добавить в избранное");
                btn.setAttribute("role", "button");
                btn.setAttribute("tabindex", "0");

                const handleFavToggle = (event) => {
                    if (!(event instanceof Event)) return;
                    event.preventDefault();
                    event.stopPropagation();

                    const rawProjectId = event.currentTarget instanceof HTMLElement ? event.currentTarget.dataset.qgaCleanerProjectId : "";
                    const pid = sanitizeProjectId(rawProjectId || "");
                    if (!pid) return;

                    const favSet = getCleanerProjectsFavoritesSet();
                    if (favSet.has(pid)) {
                        favSet.delete(pid);
                    } else {
                        favSet.add(pid);
                    }
                    saveCleanerProjectsFavoritesSet(favSet);

                    const currentRow = (event.currentTarget instanceof HTMLElement ? event.currentTarget.closest("tr") : null);
                    if (currentRow instanceof HTMLTableRowElement) {
                        currentRow.classList.toggle("qga-cleaner-project-fav-row", favSet.has(pid));
                        if (state.cleanerProjectsFavoritesOnlyEnabled) {
                            currentRow.classList.toggle(
                                "qga-cleaner-project-fav-only-hidden-row",
                                !favSet.has(pid)
                            );
                        } else {
                            currentRow.classList.remove("qga-cleaner-project-fav-only-hidden-row");
                        }
                    }

                    const currentBtn = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
                    if (currentBtn) {
                        currentBtn.classList.add("qga-cleaner-project-fav-btn-clicked");
                        setTimeout(() => currentBtn.classList.remove("qga-cleaner-project-fav-btn-clicked"), 150);

                        currentBtn.textContent = favSet.has(pid) ? "\u2605" : "\u2606";
                        currentBtn.setAttribute(
                            "aria-label",
                            favSet.has(pid) ? "Убрать из избранного" : "Добавить в избранное"
                        );
                        currentBtn.classList.toggle("qga-cleaner-project-fav-btn--fav", favSet.has(pid));
                    }
                };

                btn.addEventListener("click", handleFavToggle);
                btn.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        handleFavToggle(event);
                    }
                });

                if (firstCell) {
                    // Убираем картинку из первой ячейки
                    const img = firstCell.querySelector("img");
                    if (img) {
                        img.remove();
                    }
                    firstCell.appendChild(btn);
                } else {
                    // Fallback: если не нашли первую ячейку, вставим к первому найденному editLink.
                    const editLink = row.querySelector("a[href*='/Project/Edit/'], a[href*='/project/edit/']");
                    if (editLink && editLink instanceof HTMLAnchorElement) {
                        const wrap = document.createElement("span");
                        wrap.className = "qga-cleaner-project-fav-btn-wrap";
                        editLink.insertAdjacentElement("afterend", wrap);
                        wrap.appendChild(btn);
                    } else {
                        row.appendChild(btn);
                    }
                }
            }

            btn.dataset.qgaCleanerProjectId = projectId;
            btn.textContent = isFav ? "\u2605" : "\u2606";
            btn.setAttribute("aria-label", isFav ? "Убрать из избранного" : "Добавить в избранное");
            btn.classList.toggle("qga-cleaner-project-fav-btn--fav", isFav);
        }
    }
