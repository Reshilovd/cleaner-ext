"use strict";

    var projectEditFavoriteUiSyncTimer =
        typeof projectEditFavoriteUiSyncTimer !== "undefined" ? projectEditFavoriteUiSyncTimer : null;

    function setupProjectEditFavoriteToggle() {
        scheduleProjectEditFavoriteToggleSync(0);
    }

    function scheduleProjectEditFavoriteToggleSync(delayMs) {
        if (projectEditFavoriteUiSyncTimer) {
            clearTimeout(projectEditFavoriteUiSyncTimer);
        }
        const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 120;
        projectEditFavoriteUiSyncTimer = setTimeout(() => {
            projectEditFavoriteUiSyncTimer = null;
            syncProjectEditFavoriteToggle();
        }, delay);
    }

    function syncProjectEditFavoriteToggle() {
        if (PAGE_KIND !== "openends") {
            return;
        }

        const projectId = sanitizeProjectId(
            typeof getProjectIdFromEditPage === "function" ? getProjectIdFromEditPage() : ""
        );
        if (!projectId) {
            return;
        }

        const anchor = findProjectEditFavoriteAnchor();
        if (!(anchor instanceof HTMLElement)) {
            return;
        }

        let wrap = document.getElementById("qga-project-edit-fav-wrap");
        if (!(wrap instanceof HTMLElement)) {
            wrap = document.createElement("span");
            wrap.id = "qga-project-edit-fav-wrap";
            wrap.className = "qga-project-edit-fav-btn-wrap";
        }

        let btn = wrap.querySelector(".qga-cleaner-project-fav-btn");
        if (!(btn instanceof HTMLElement)) {
            btn = document.createElement("div");
            btn.className = "qga-cleaner-project-fav-btn qga-project-edit-fav-btn";
            btn.setAttribute("role", "button");
            btn.setAttribute("tabindex", "0");

            const toggle = (event) => {
                if (event instanceof Event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                const pid = sanitizeProjectId(btn.dataset.qgaCleanerProjectId || "");
                if (!pid) {
                    return;
                }

                const favorites = getCleanerProjectsFavoritesSet();
                if (favorites.has(pid)) {
                    favorites.delete(pid);
                } else {
                    favorites.add(pid);
                }
                saveCleanerProjectsFavoritesSet(favorites);
                updateProjectEditFavoriteButtonState(btn, pid);
            };

            btn.addEventListener("click", toggle);
            btn.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    toggle(event);
                }
            });
            wrap.appendChild(btn);
        }

        btn.dataset.qgaCleanerProjectId = projectId;
        updateProjectEditFavoriteButtonState(btn, projectId);

        if (wrap.parentElement !== anchor.parentElement || wrap.previousElementSibling !== anchor) {
            anchor.insertAdjacentElement("afterend", wrap);
        }
    }

    function updateProjectEditFavoriteButtonState(button, projectId) {
        if (!(button instanceof HTMLElement) || !projectId) {
            return;
        }
        const favorites = getCleanerProjectsFavoritesSet();
        const isFav = favorites.has(projectId);
        button.textContent = isFav ? "\u2605" : "\u2606";
        button.classList.toggle("qga-cleaner-project-fav-btn--fav", isFav);
        button.setAttribute("aria-label", isFav ? "Убрать из избранного" : "Добавить в избранное");
        button.title = isFav ? "Убрать из избранного" : "Добавить в избранное";
    }

    function findProjectEditFavoriteAnchor() {
        const statusAliases = ["запущен", "остановлен", "пауза", "paused", "active", "draft", "черновик"];
        const candidates = Array.from(document.querySelectorAll("span, div, a, label")).filter((node) => {
            if (!(node instanceof HTMLElement)) {
                return false;
            }
            if (!isElementVisible(node)) {
                return false;
            }
            if (node.children.length > 0) {
                return false;
            }
            const text = normalizeSingleLine(node.textContent || "").toLowerCase();
            if (!text) {
                return false;
            }
            return statusAliases.some((alias) => text.includes(alias));
        });

        if (candidates.length > 0) {
            return candidates[0];
        }

        const idCandidates = Array.from(document.querySelectorAll("span, div, a, label")).filter((node) => {
            if (!(node instanceof HTMLElement)) {
                return false;
            }
            if (!isElementVisible(node)) {
                return false;
            }
            if (node.children.length > 0) {
                return false;
            }
            const text = normalizeSingleLine(node.textContent || "");
            return /^id\s*\d+/i.test(text);
        });

        return idCandidates[0] || null;
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

    function getCleanerProjectsGridInstance(gridRoot) {
        if (!gridRoot || typeof window.jQuery !== "function") return null;
        try {
            return window.jQuery(gridRoot).data("kendoGrid") || null;
        } catch (e) {
            return null;
        }
    }

    function getCleanerProjectsPagerSelect(gridRoot) {
        if (!(gridRoot instanceof Element)) return null;
        const pager = gridRoot.querySelector(".k-pager-wrap, .k-grid-pager");
        if (!(pager instanceof Element)) return null;

        const sizesContainer =
            pager.querySelector(".k-pager-sizes") ||
            pager.querySelector("[data-role='dropdownlist']") ||
            pager;

        const select = sizesContainer.querySelector("select");
        return select instanceof HTMLSelectElement ? select : null;
    }

    function normalizeCleanerProjectsPagerValue(value) {
        return normalizeSingleLine(String(value || "")).toLowerCase();
    }

    function isCleanerProjectsAllPageSizeOption(option) {
        if (!(option instanceof HTMLOptionElement)) return false;
        const text = normalizeCleanerProjectsPagerValue(option.textContent || "");
        const value = normalizeCleanerProjectsPagerValue(option.value || "");
        if (!text && !value) return false;

        return (
            text === "all" ||
            text === "все" ||
            text.includes("all") ||
            text.includes("все") ||
            value === "all"
        );
    }

    function findCleanerProjectsAllPageSizeOption(select) {
        if (!(select instanceof HTMLSelectElement)) return null;
        const options = Array.from(select.options || []);
        return options.find((option) => isCleanerProjectsAllPageSizeOption(option)) || null;
    }

    function findCleanerProjectsLargestNumericPageSizeOption(select) {
        if (!(select instanceof HTMLSelectElement)) return null;
        const options = Array.from(select.options || []);

        let best = null;
        let bestValue = -Infinity;
        for (const option of options) {
            const numeric = Number.parseInt(option.value, 10);
            if (!Number.isFinite(numeric)) continue;
            if (numeric > bestValue) {
                bestValue = numeric;
                best = option;
            }
        }

        return best;
    }

    function getCleanerProjectsCurrentPageSizeValue(gridRoot, select) {
        const pagerSelect = select instanceof HTMLSelectElement ? select : getCleanerProjectsPagerSelect(gridRoot);
        if (pagerSelect instanceof HTMLSelectElement) {
            return String(pagerSelect.value || "");
        }

        const grid = getCleanerProjectsGridInstance(gridRoot);
        const pageSize = grid && grid.dataSource && typeof grid.dataSource.pageSize === "function"
            ? Number.parseInt(grid.dataSource.pageSize(), 10)
            : NaN;

        return Number.isFinite(pageSize) && pageSize > 0 ? String(pageSize) : "";
    }

    function getCleanerProjectsCurrentPage(gridRoot) {
        const grid = getCleanerProjectsGridInstance(gridRoot);
        const page = grid && grid.dataSource && typeof grid.dataSource.page === "function"
            ? Number.parseInt(grid.dataSource.page(), 10)
            : NaN;

        return Number.isFinite(page) && page > 0 ? page : 1;
    }

    function setCleanerProjectsGridPage(gridRoot, pageNumber) {
        const targetPage = Number.parseInt(pageNumber, 10);
        if (!Number.isFinite(targetPage) || targetPage < 1) return false;

        const grid = getCleanerProjectsGridInstance(gridRoot);
        if (!grid || !grid.dataSource || typeof grid.dataSource.page !== "function") return false;

        try {
            const currentPage = Number.parseInt(grid.dataSource.page(), 10);
            if (Number.isFinite(currentPage) && currentPage === targetPage) {
                return false;
            }
            grid.dataSource.page(targetPage);
            return true;
        } catch (e) {
            return false;
        }
    }

    function scheduleCleanerProjectsGridPageRestore(gridRoot, pageNumber) {
        const targetPage = Number.parseInt(pageNumber, 10);
        if (!Number.isFinite(targetPage) || targetPage < 2) return;

        const grid = getCleanerProjectsGridInstance(gridRoot);
        if (!grid || typeof grid.one !== "function") return;

        grid.one("dataBound", () => {
            setTimeout(() => {
                setCleanerProjectsGridPage(gridRoot, targetPage);
            }, 0);
        });
    }

    function setCleanerProjectsPagerSelectValue(select, targetValue) {
        if (!(select instanceof HTMLSelectElement)) return { ensured: false, changed: false };

        const currentValue = normalizeCleanerProjectsPagerValue(select.value || "");
        const normalizedTarget = normalizeCleanerProjectsPagerValue(targetValue);
        if (!normalizedTarget) return { ensured: false, changed: false };

        if (currentValue === normalizedTarget) {
            return { ensured: true, changed: false };
        }

        const options = Array.from(select.options || []);
        const targetOption = options.find((option) => {
            const optionValue = normalizeCleanerProjectsPagerValue(option.value || "");
            const optionText = normalizeCleanerProjectsPagerValue(option.textContent || "");
            return optionValue === normalizedTarget || optionText === normalizedTarget;
        });

        if (!targetOption) {
            return { ensured: false, changed: false };
        }

        select.value = targetOption.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("input", { bubbles: true }));
        return { ensured: true, changed: true };
    }

    function setCleanerProjectsGridPageSize(gridRoot, targetValue) {
        const select = getCleanerProjectsPagerSelect(gridRoot);
        const selectResult = setCleanerProjectsPagerSelectValue(select, targetValue);
        if (selectResult.ensured) {
            return selectResult;
        }

        const numericTarget = Number.parseInt(targetValue, 10);
        if (!Number.isFinite(numericTarget) || numericTarget < 1) {
            return { ensured: false, changed: false };
        }

        const grid = getCleanerProjectsGridInstance(gridRoot);
        if (!grid || !grid.dataSource || typeof grid.dataSource.pageSize !== "function") {
            return { ensured: false, changed: false };
        }

        try {
            const currentPageSize = Number.parseInt(grid.dataSource.pageSize(), 10);
            if (Number.isFinite(currentPageSize) && currentPageSize === numericTarget) {
                return { ensured: true, changed: false };
            }
            if (typeof grid.dataSource.page === "function") {
                grid.dataSource.page(1);
            }
            grid.dataSource.pageSize(numericTarget);
            return { ensured: true, changed: true };
        } catch (e) {
            return { ensured: false, changed: false };
        }
    }

    function isCleanerProjectsGridShowingAll(gridRoot) {
        const select = getCleanerProjectsPagerSelect(gridRoot);
        if (select instanceof HTMLSelectElement) {
            const selectedOption = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
            if (isCleanerProjectsAllPageSizeOption(selectedOption)) {
                return true;
            }
        }

        const grid = getCleanerProjectsGridInstance(gridRoot);
        const pageSize = grid && grid.dataSource && typeof grid.dataSource.pageSize === "function"
            ? Number.parseInt(grid.dataSource.pageSize(), 10)
            : NaN;
        const total = grid && grid.dataSource && typeof grid.dataSource.total === "function"
            ? Number.parseInt(grid.dataSource.total(), 10)
            : NaN;

        return (
            Number.isFinite(pageSize) &&
            pageSize > 0 &&
            Number.isFinite(total) &&
            total >= 0 &&
            pageSize >= total
        );
    }

    function ensureCleanerProjectsGridPageSizeAll(gridRoot) {
        const select = getCleanerProjectsPagerSelect(gridRoot);
        const allOption = findCleanerProjectsAllPageSizeOption(select);
        if (allOption) {
            return setCleanerProjectsPagerSelectValue(select, allOption.value);
        }

        const grid = getCleanerProjectsGridInstance(gridRoot);
        const total = grid && grid.dataSource && typeof grid.dataSource.total === "function"
            ? Number.parseInt(grid.dataSource.total(), 10)
            : NaN;
        if (Number.isFinite(total) && total > 0) {
            return setCleanerProjectsGridPageSize(gridRoot, String(total));
        }

        const largestOption = findCleanerProjectsLargestNumericPageSizeOption(select);
        if (largestOption) {
            return setCleanerProjectsPagerSelectValue(select, largestOption.value);
        }

        return { ensured: false, changed: false };
    }

    function syncCleanerProjectsFavoritesOnlyGridState(gridRoot) {
        if (!gridRoot) return { ensured: false, changed: false };

        if (state.cleanerProjectsFavoritesOnlyEnabled) {
            if (isCleanerProjectsGridShowingAll(gridRoot)) {
                return { ensured: true, changed: false };
            }

            if (!state.cleanerProjectsFavoritesOnlyAllModeActive) {
                state.cleanerProjectsFavoritesOnlyPreviousPageSize = getCleanerProjectsCurrentPageSizeValue(gridRoot);
                state.cleanerProjectsFavoritesOnlyPreviousPage = getCleanerProjectsCurrentPage(gridRoot);
            }

            const result = ensureCleanerProjectsGridPageSizeAll(gridRoot);
            if (result.changed) {
                state.cleanerProjectsFavoritesOnlyAllModeActive = true;
            }
            return result;
        }

        if (!state.cleanerProjectsFavoritesOnlyAllModeActive) {
            return { ensured: true, changed: false };
        }

        const restorePageSize = state.cleanerProjectsFavoritesOnlyPreviousPageSize;
        const restorePage = state.cleanerProjectsFavoritesOnlyPreviousPage;

        state.cleanerProjectsFavoritesOnlyAllModeActive = false;
        state.cleanerProjectsFavoritesOnlyPreviousPageSize = null;
        state.cleanerProjectsFavoritesOnlyPreviousPage = null;

        if (!restorePageSize) {
            return { ensured: true, changed: false };
        }

        const currentPageSize = getCleanerProjectsCurrentPageSizeValue(gridRoot);
        const shouldSchedulePageRestore =
            normalizeCleanerProjectsPagerValue(currentPageSize) !==
            normalizeCleanerProjectsPagerValue(restorePageSize);
        if (shouldSchedulePageRestore) {
            scheduleCleanerProjectsGridPageRestore(gridRoot, restorePage);
        }

        const restoreResult = setCleanerProjectsGridPageSize(gridRoot, restorePageSize);
        if (restoreResult.changed) {
            return restoreResult;
        }

        setCleanerProjectsGridPage(gridRoot, restorePage);
        return restoreResult;
    }

    function applyCleanerProjectsFavoritesOnlyFilter() {
        const gridRoot = getCleanerProjectsGridRootForFavorites();
        if (!gridRoot) return;

        const gridStateResult = syncCleanerProjectsFavoritesOnlyGridState(gridRoot);
        if (gridStateResult.changed) return;

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

        const gridStateResult = syncCleanerProjectsFavoritesOnlyGridState(gridRoot);
        if (gridStateResult.changed) return;

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

