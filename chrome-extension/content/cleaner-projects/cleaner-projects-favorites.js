"use strict";

    const CLEANER_PROJECTS_FAVORITES_SYNC_EVENT = "qga-cleaner-projects-favorites-sync";
    const CLEANER_PROJECTS_FAVORITES_READY_EVENT = "qga-cleaner-projects-favorites-ready";
    const CLEANER_PROJECTS_FAVORITES_STATUS_EVENT = "qga-cleaner-projects-favorites-status";
    const CLEANER_PROJECTS_FAVORITES_BRIDGE_NODE_ID = "qga-cleaner-projects-favorites-bridge";

    function setupCleanerProjectsFavorites() {
        if (state.cleanerProjectsFavoritesBound) {
            syncCleanerProjectsFavoritesUI();
            return;
        }

        state.cleanerProjectsFavoritesBound = true;
        state.cleanerProjectsFavoritesSet = loadCleanerProjectsFavoritesSet();
        ensureCleanerProjectsFavoritesPageBridge();
        ensureCleanerProjectsFavoritesSearchBinding();

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

    function isCleanerProjectsReloadNavigation() {
        if (!window.performance || typeof window.performance.getEntriesByType !== "function") {
            return false;
        }

        const entries = window.performance.getEntriesByType("navigation");
        if (!Array.isArray(entries) || entries.length === 0) {
            return false;
        }

        return entries[0] && entries[0].type === "reload";
    }

    function prepareCleanerProjectsNameSearchInput(searchInput) {
        if (!(searchInput instanceof HTMLInputElement)) return;

        searchInput.setAttribute("autocomplete", "off");
        searchInput.autocomplete = "off";
        searchInput.setAttribute("autocorrect", "off");
        searchInput.setAttribute("autocapitalize", "off");
        searchInput.setAttribute("spellcheck", "false");

        if (searchInput.dataset.qgaFavoritesSearchPrepared === "1") return;
        searchInput.dataset.qgaFavoritesSearchPrepared = "1";

        if (!searchInput.value || !isCleanerProjectsReloadNavigation()) return;

        // Браузер может восстанавливать последнее введённое значение после reload.
        // Для локального поиска избранного стартуем с пустого поля, чтобы старый запрос не возвращался сам.
        searchInput.value = "";
    }

    function ensureCleanerProjectsFavoritesSearchBinding() {
        const searchInput = findCleanerProjectsNameSearchInput();
        if (!(searchInput instanceof HTMLInputElement)) return;
        prepareCleanerProjectsNameSearchInput(searchInput);
        if (searchInput.dataset.qgaFavoritesSearchBound === "1") return;

        searchInput.dataset.qgaFavoritesSearchBound = "1";
        searchInput.addEventListener("input", (event) => {
            if (!state.cleanerProjectsFavoritesOnlyEnabled) return;
            event.stopImmediatePropagation();
            applyCleanerProjectsFavoritesOnlyFilter();
        }, true);
    }

    function ensureCleanerProjectsFavoritesPageBridge() {
        bindCleanerProjectsFavoritesPageBridgeEvents();
        getCleanerProjectsFavoritesBridgeNode();

        if (state.cleanerProjectsFavoritesPageBridgeInjected) return;

        if (typeof chrome === "undefined" || !chrome.runtime || typeof chrome.runtime.getURL !== "function") {
            return;
        }

        const existing = document.getElementById("qga-cleaner-projects-favorites-page-bridge");
        if (existing) {
            state.cleanerProjectsFavoritesPageBridgeInjected = true;
            return;
        }

        const script = document.createElement("script");
        script.id = "qga-cleaner-projects-favorites-page-bridge";
        script.src = chrome.runtime.getURL("content/cleaner-projects/cleaner-projects-favorites-page.js");
        script.async = false;
        script.onload = () => {
            script.remove();
        };

        (document.head || document.documentElement || document.body).appendChild(script);
        state.cleanerProjectsFavoritesPageBridgeInjected = true;
    }

    function getCleanerProjectsFavoritesBridgeNode() {
        let node = document.getElementById(CLEANER_PROJECTS_FAVORITES_BRIDGE_NODE_ID);
        if (node instanceof HTMLElement) {
            return node;
        }

        node = document.createElement("div");
        node.id = CLEANER_PROJECTS_FAVORITES_BRIDGE_NODE_ID;
        node.hidden = true;
        node.style.display = "none";
        (document.documentElement || document.body).appendChild(node);
        return node;
    }

    function syncCleanerProjectsFavoritesBridgeStateFromNode(node) {
        if (!(node instanceof HTMLElement)) return;

        state.cleanerProjectsFavoritesPageBridgeReady = node.dataset.qgaPageReady === "1";
        if (node.dataset.qgaStrategy) {
            state.cleanerProjectsFavoritesOnlyStrategy = node.dataset.qgaStrategy;
        }
        state.cleanerProjectsFavoritesOnlySnapshotLoading = node.dataset.qgaLoading === "1";
    }

    function bindCleanerProjectsFavoritesPageBridgeEvents() {
        if (state.cleanerProjectsFavoritesPageBridgeEventsBound) return;
        state.cleanerProjectsFavoritesPageBridgeEventsBound = true;

        document.addEventListener(CLEANER_PROJECTS_FAVORITES_READY_EVENT, () => {
            state.cleanerProjectsFavoritesPageBridgeReady = true;
            if (state.cleanerProjectsFavoritesOnlyEnabled) {
                applyCleanerProjectsFavoritesOnlyFilter();
            }
        });

        document.addEventListener(CLEANER_PROJECTS_FAVORITES_STATUS_EVENT, (event) => {
            const detail = event instanceof CustomEvent ? event.detail : null;
            if (!detail || typeof detail !== "object") return;

            if (typeof detail.strategy === "string" && detail.strategy) {
                state.cleanerProjectsFavoritesOnlyStrategy = detail.strategy;
            }
            state.cleanerProjectsFavoritesOnlySnapshotLoading = detail.strategy === "snapshot_loading";
        });

        const bridgeNode = getCleanerProjectsFavoritesBridgeNode();
        const observer = new MutationObserver((mutations) => {
            const wasReady = state.cleanerProjectsFavoritesPageBridgeReady;
            syncCleanerProjectsFavoritesBridgeStateFromNode(bridgeNode);
            const becameReady =
                !wasReady &&
                state.cleanerProjectsFavoritesPageBridgeReady &&
                Array.isArray(mutations);

            if (becameReady && state.cleanerProjectsFavoritesOnlyEnabled) {
                applyCleanerProjectsFavoritesOnlyFilter();
            }
        });
        observer.observe(bridgeNode, { attributes: true });
        syncCleanerProjectsFavoritesBridgeStateFromNode(bridgeNode);
    }

    function syncCleanerProjectsFavoritesOnlyViaPageBridge() {
        ensureCleanerProjectsFavoritesPageBridge();
        ensureCleanerProjectsFavoritesSearchBinding();
        const bridgeNode = getCleanerProjectsFavoritesBridgeNode();
        syncCleanerProjectsFavoritesBridgeStateFromNode(bridgeNode);

        if (!state.cleanerProjectsFavoritesPageBridgeInjected) {
            return { supported: false, pending: false };
        }

        if (!state.cleanerProjectsFavoritesPageBridgeReady) {
            return { supported: true, pending: true };
        }

        const favorites = Array.from(getCleanerProjectsFavoritesSet()).sort((a, b) => String(a).localeCompare(String(b)));
        const searchInput = findCleanerProjectsNameSearchInput();
        const searchValue = searchInput instanceof HTMLInputElement ? searchInput.value || "" : "";
        const enabledValue = state.cleanerProjectsFavoritesOnlyEnabled ? "1" : "0";
        const favoritesJson = JSON.stringify(favorites);
        const signature = `${enabledValue}|${favoritesJson}|${searchValue}`;

        if (state.cleanerProjectsFavoritesPageBridgeLastSignature === signature) {
            return { supported: true, pending: false };
        }

        bridgeNode.dataset.qgaEnabled = enabledValue;
        bridgeNode.dataset.qgaFavorites = favoritesJson;
        bridgeNode.dataset.qgaSearch = searchValue;
        bridgeNode.dataset.qgaSyncSeq = String(
            Number.parseInt(bridgeNode.dataset.qgaSyncSeq || "0", 10) + 1
        );
        state.cleanerProjectsFavoritesPageBridgeLastSignature = signature;

        return { supported: true, pending: false };
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

    function sanitizeCleanerProjectsPossibleId(value) {
        const text = normalizeSingleLine(String(value || ""));
        if (!text) return "";

        if (typeof sanitizeProjectId === "function") {
            const sanitized = sanitizeProjectId(text);
            if (sanitized) return sanitized;
        }

        const match = text.match(/\d+/);
        return match ? match[0] : "";
    }

    function getCleanerProjectsDataSource(gridRoot) {
        const grid = getCleanerProjectsGridInstance(gridRoot);
        return grid && grid.dataSource ? grid.dataSource : null;
    }

    function getCleanerProjectsDataSourceOptions(gridRoot) {
        const dataSource = getCleanerProjectsDataSource(gridRoot);
        return dataSource && dataSource.options ? dataSource.options : null;
    }

    function getCleanerProjectsSourceDataSourceForFavoritesOnly(gridRoot) {
        return state.cleanerProjectsFavoritesOnlyOriginalDataSource || getCleanerProjectsDataSource(gridRoot);
    }

    function getCleanerProjectsDataItemByRow(gridRoot, row) {
        if (!(row instanceof HTMLTableRowElement)) return null;
        const grid = getCleanerProjectsGridInstance(gridRoot);
        if (!grid || typeof grid.dataItem !== "function") return null;

        try {
            return grid.dataItem(row) || null;
        } catch (e) {
            return null;
        }
    }

    function getCleanerProjectsDataItemValue(dataItem, fieldName) {
        if (!dataItem || !fieldName) return undefined;

        if (typeof dataItem.get === "function") {
            try {
                const value = dataItem.get(fieldName);
                if (typeof value !== "undefined") return value;
            } catch (e) {}
        }

        if (Object.prototype.hasOwnProperty.call(dataItem, fieldName)) {
            return dataItem[fieldName];
        }

        if (!fieldName.includes(".")) {
            return dataItem[fieldName];
        }

        const parts = fieldName.split(".");
        let current = dataItem;
        for (const part of parts) {
            if (current == null) return undefined;
            if (typeof current.get === "function") {
                try {
                    current = current.get(part);
                    continue;
                } catch (e) {}
            }
            current = current[part];
        }

        return current;
    }

    function getCleanerProjectsPlainDataItem(dataItem) {
        if (!dataItem || typeof dataItem !== "object") return null;

        if (typeof dataItem.toJSON === "function") {
            try {
                const json = dataItem.toJSON();
                if (json && typeof json === "object") {
                    return json;
                }
            } catch (e) {}
        }

        return dataItem;
    }

    function getCleanerProjectsProjectIdByDataItem(dataItem, fieldName) {
        if (!dataItem || !fieldName) return "";
        return sanitizeCleanerProjectsPossibleId(getCleanerProjectsDataItemValue(dataItem, fieldName));
    }

    function getCleanerProjectsCurrentNumericPageSize(gridRoot, dataSource) {
        const pageSizeFromUi = Number.parseInt(getCleanerProjectsCurrentPageSizeValue(gridRoot), 10);
        if (Number.isFinite(pageSizeFromUi) && pageSizeFromUi > 0) {
            return pageSizeFromUi;
        }

        const sourceDataSource = dataSource || getCleanerProjectsSourceDataSourceForFavoritesOnly(gridRoot);
        const pageSize = sourceDataSource && typeof sourceDataSource.pageSize === "function"
            ? Number.parseInt(sourceDataSource.pageSize(), 10)
            : NaN;

        return Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20;
    }

    function getCleanerProjectsIdFieldNameFromGridColumns(gridRoot) {
        const grid = getCleanerProjectsGridInstance(gridRoot);
        if (!grid || !Array.isArray(grid.columns)) return "";

        if (state.cleanerProjectsIdColumnIndex < 0) {
            state.cleanerProjectsIdColumnIndex = findCleanerProjectsIdHeaderIndex(gridRoot);
        }
        const idColumnIndex = state.cleanerProjectsIdColumnIndex;
        if (idColumnIndex < 0 || idColumnIndex >= grid.columns.length) return "";

        const column = grid.columns[idColumnIndex];
        return column && typeof column.field === "string" ? column.field : "";
    }

    function detectCleanerProjectsIdFieldNameFromRows(gridRoot) {
        const rows = Array.from(gridRoot.querySelectorAll(".k-grid-content tbody tr"));
        if (!rows.length) return "";

        if (state.cleanerProjectsIdColumnIndex < 0) {
            state.cleanerProjectsIdColumnIndex = findCleanerProjectsIdHeaderIndex(gridRoot);
        }
        const idColumnIndex = state.cleanerProjectsIdColumnIndex;
        if (idColumnIndex < 0) return "";

        const stats = new Map();
        let sampledRows = 0;

        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) continue;

            const projectId = getCleanerProjectsProjectIdByRow(row, idColumnIndex);
            if (!projectId) continue;

            const dataItem = getCleanerProjectsDataItemByRow(gridRoot, row);
            const plainDataItem = getCleanerProjectsPlainDataItem(dataItem);
            if (!plainDataItem) continue;

            sampledRows += 1;

            for (const key of Object.keys(plainDataItem)) {
                const value = getCleanerProjectsDataItemValue(dataItem, key);
                const candidateId = sanitizeCleanerProjectsPossibleId(value);
                if (!candidateId || candidateId !== projectId) continue;

                const entry = stats.get(key) || {
                    key,
                    matches: 0,
                    bonus: 0
                };

                entry.matches += 1;
                if (/project/i.test(key)) entry.bonus += 2;
                if (/^id$/i.test(key) || /id/i.test(key)) entry.bonus += 1;

                stats.set(key, entry);
            }

            if (sampledRows >= 8) break;
        }

        if (!stats.size) return "";

        const ranked = Array.from(stats.values()).sort((a, b) => {
            if (b.matches !== a.matches) return b.matches - a.matches;
            if (b.bonus !== a.bonus) return b.bonus - a.bonus;
            return String(a.key).localeCompare(String(b.key));
        });

        const best = ranked[0];
        if (!best || best.matches < 1) return "";
        return best.key;
    }

    function getCleanerProjectsIdFieldName(gridRoot) {
        if (!gridRoot) return "";

        if (
            state.cleanerProjectsFavoritesIdFieldGridRoot === gridRoot &&
            state.cleanerProjectsFavoritesIdFieldName
        ) {
            return state.cleanerProjectsFavoritesIdFieldName;
        }

        const fromColumns = getCleanerProjectsIdFieldNameFromGridColumns(gridRoot);
        const detected = fromColumns || detectCleanerProjectsIdFieldNameFromRows(gridRoot);

        state.cleanerProjectsFavoritesIdFieldGridRoot = gridRoot;
        state.cleanerProjectsFavoritesIdFieldName = detected || "";

        return state.cleanerProjectsFavoritesIdFieldName;
    }

    function cloneCleanerProjectsDataSourceOptions(dataSource) {
        const options = dataSource && dataSource.options ? dataSource.options : null;
        if (!options || typeof options !== "object") return null;

        const clone = { ...options };

        if (options.transport && typeof options.transport === "object") {
            clone.transport = { ...options.transport };
            if (options.transport.read && typeof options.transport.read === "object") {
                clone.transport.read = { ...options.transport.read };
            }
        }

        if (options.schema && typeof options.schema === "object") {
            clone.schema = { ...options.schema };
            if (options.schema.model && typeof options.schema.model === "object") {
                clone.schema.model = { ...options.schema.model };
            }
        }

        delete clone.data;
        delete clone.page;

        return clone;
    }

    function canUseCleanerProjectsFavoritesOnlyDataSourceStrategy(gridRoot) {
        const dataSource = getCleanerProjectsDataSource(gridRoot);
        if (!dataSource || typeof dataSource.filter !== "function") return false;

        const idFieldName = getCleanerProjectsIdFieldName(gridRoot);
        if (!idFieldName) return false;

        const data = typeof dataSource.data === "function" ? dataSource.data() : null;
        const dataLength = data && typeof data.length === "number" ? data.length : NaN;
        const total = typeof dataSource.total === "function" ? Number.parseInt(dataSource.total(), 10) : NaN;

        if (!Number.isFinite(dataLength)) return false;
        if (!Number.isFinite(total)) return dataLength > 0;
        if (total === 0) return true;

        return dataLength >= total;
    }

    function canUseCleanerProjectsFavoritesOnlySnapshotStrategy(gridRoot) {
        if (!gridRoot) return false;
        if (!window.kendo || !window.kendo.data || typeof window.kendo.data.DataSource !== "function") {
            return false;
        }

        const sourceDataSource = getCleanerProjectsSourceDataSourceForFavoritesOnly(gridRoot);
        if (!sourceDataSource) return false;

        const idFieldName = getCleanerProjectsIdFieldName(gridRoot);
        if (!idFieldName) return false;

        const options = cloneCleanerProjectsDataSourceOptions(sourceDataSource);
        if (!options || !options.transport || !options.transport.read) {
            return false;
        }

        const data = typeof sourceDataSource.data === "function" ? sourceDataSource.data() : null;
        const dataLength = data && typeof data.length === "number" ? data.length : NaN;
        const total = typeof sourceDataSource.total === "function"
            ? Number.parseInt(sourceDataSource.total(), 10)
            : NaN;

        return (
            Number.isFinite(dataLength) &&
            Number.isFinite(total) &&
            total > 0 &&
            dataLength > 0 &&
            dataLength < total
        );
    }

    function isCleanerProjectsFavoritesOnlyDataSourceFilter(filter) {
        return Boolean(filter && filter.__qgaFavoritesOnly === true);
    }

    function hasCleanerProjectsFavoritesOnlyDataSourceFilter(filter) {
        if (!filter) return false;
        if (Array.isArray(filter)) {
            return filter.some((entry) => hasCleanerProjectsFavoritesOnlyDataSourceFilter(entry));
        }
        if (isCleanerProjectsFavoritesOnlyDataSourceFilter(filter)) return true;
        if (Array.isArray(filter.filters)) {
            return filter.filters.some((entry) => hasCleanerProjectsFavoritesOnlyDataSourceFilter(entry));
        }
        return false;
    }

    function stripCleanerProjectsFavoritesOnlyDataSourceFilter(filter) {
        if (!filter) return null;

        if (Array.isArray(filter)) {
            const next = filter
                .map((entry) => stripCleanerProjectsFavoritesOnlyDataSourceFilter(entry))
                .filter(Boolean);
            return next.length ? next : null;
        }

        if (isCleanerProjectsFavoritesOnlyDataSourceFilter(filter)) {
            return null;
        }

        if (!Array.isArray(filter.filters)) {
            return filter;
        }

        const nextFilters = filter.filters
            .map((entry) => stripCleanerProjectsFavoritesOnlyDataSourceFilter(entry))
            .filter(Boolean);

        if (!nextFilters.length) return null;
        if (nextFilters.length === 1) return nextFilters[0];

        return {
            ...filter,
            filters: nextFilters
        };
    }

    function buildCleanerProjectsFavoritesOnlyDataSourceFilter(gridRoot) {
        const idFieldName = getCleanerProjectsIdFieldName(gridRoot);
        if (!idFieldName) return null;

        const favorites = new Set(getCleanerProjectsFavoritesSet());

        return {
            field: idFieldName,
            operator: function(itemValue) {
                const projectId = sanitizeCleanerProjectsPossibleId(itemValue);
                return projectId ? favorites.has(projectId) : false;
            },
            value: true,
            __qgaFavoritesOnly: true
        };
    }

    function mergeCleanerProjectsFavoritesOnlyDataSourceFilter(baseFilter, favoritesFilter) {
        if (!favoritesFilter) return stripCleanerProjectsFavoritesOnlyDataSourceFilter(baseFilter);

        const strippedBase = stripCleanerProjectsFavoritesOnlyDataSourceFilter(baseFilter);
        if (!strippedBase) return favoritesFilter;

        if (Array.isArray(strippedBase)) {
            return {
                logic: "and",
                filters: [...strippedBase, favoritesFilter]
            };
        }

        if (Array.isArray(strippedBase.filters) && (strippedBase.logic || "and") === "and") {
            return {
                ...strippedBase,
                filters: [...strippedBase.filters, favoritesFilter]
            };
        }

        return {
            logic: "and",
            filters: [strippedBase, favoritesFilter]
        };
    }

    function normalizeCleanerProjectsDataSourceFilterValue(filter) {
        if (!filter) return null;
        if (!Array.isArray(filter)) return filter;
        if (filter.length === 0) return null;
        if (filter.length === 1) return filter[0];

        return {
            logic: "and",
            filters: filter
        };
    }

    function clearCleanerProjectsFavoritesOnlyDataSourceState(gridRoot) {
        const dataSource = getCleanerProjectsDataSource(gridRoot);
        if (!dataSource || typeof dataSource.filter !== "function") {
            state.cleanerProjectsFavoritesOnlyDataSourceRevision = -1;
            state.cleanerProjectsFavoritesOnlyDataSourceFieldName = "";
            return { changed: false };
        }

        const currentFilter = dataSource.filter();
        const hasFavoritesFilter = hasCleanerProjectsFavoritesOnlyDataSourceFilter(currentFilter);

        state.cleanerProjectsFavoritesOnlyDataSourceRevision = -1;
        state.cleanerProjectsFavoritesOnlyDataSourceFieldName = "";

        if (!hasFavoritesFilter) {
            return { changed: false };
        }

        const nextFilter = normalizeCleanerProjectsDataSourceFilterValue(
            stripCleanerProjectsFavoritesOnlyDataSourceFilter(currentFilter)
        );
        dataSource.filter(nextFilter);
        return { changed: true };
    }

    function ensureCleanerProjectsFavoritesOnlyDataSourceState(gridRoot) {
        if (!canUseCleanerProjectsFavoritesOnlyDataSourceStrategy(gridRoot)) {
            return { supported: false, changed: clearCleanerProjectsFavoritesOnlyDataSourceState(gridRoot).changed };
        }

        const dataSource = getCleanerProjectsDataSource(gridRoot);
        const currentFilter = dataSource ? dataSource.filter() : null;
        const hasFavoritesFilter = hasCleanerProjectsFavoritesOnlyDataSourceFilter(currentFilter);
        const idFieldName = getCleanerProjectsIdFieldName(gridRoot);
        const needsRefresh =
            !hasFavoritesFilter ||
            state.cleanerProjectsFavoritesOnlyDataSourceRevision !== state.cleanerProjectsFavoritesRevision ||
            state.cleanerProjectsFavoritesOnlyDataSourceFieldName !== idFieldName;

        if (!needsRefresh) {
            return { supported: true, changed: false };
        }

        const favoritesFilter = buildCleanerProjectsFavoritesOnlyDataSourceFilter(gridRoot);
        const nextFilter = normalizeCleanerProjectsDataSourceFilterValue(
            mergeCleanerProjectsFavoritesOnlyDataSourceFilter(currentFilter, favoritesFilter)
        );

        state.cleanerProjectsFavoritesOnlyDataSourceRevision = state.cleanerProjectsFavoritesRevision;
        state.cleanerProjectsFavoritesOnlyDataSourceFieldName = idFieldName;

        dataSource.filter(nextFilter);
        return { supported: true, changed: true };
    }

    function clearCleanerProjectsFavoritesOnlyHiddenRows(gridRoot) {
        if (!gridRoot) return;
        const rows = gridRoot.querySelectorAll(".k-grid-content tbody tr");
        for (const row of Array.from(rows)) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            row.classList.remove("qga-cleaner-project-fav-only-hidden-row");
        }
    }

    async function collectCleanerProjectsFavoriteItemsFromAllPages(gridRoot, sourceDataSource, requestId) {
        if (!gridRoot || !sourceDataSource) return [];

        const idFieldName = getCleanerProjectsIdFieldName(gridRoot);
        if (!idFieldName) return [];

        const options = cloneCleanerProjectsDataSourceOptions(sourceDataSource);
        if (!options) return [];

        const pageSize = getCleanerProjectsCurrentNumericPageSize(gridRoot, sourceDataSource);
        const total = typeof sourceDataSource.total === "function"
            ? Number.parseInt(sourceDataSource.total(), 10)
            : NaN;
        if (!Number.isFinite(total) || total < 1 || !Number.isFinite(pageSize) || pageSize < 1) {
            return [];
        }

        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const sort = typeof sourceDataSource.sort === "function" ? sourceDataSource.sort() : undefined;
        const filter = stripCleanerProjectsFavoritesOnlyDataSourceFilter(
            typeof sourceDataSource.filter === "function" ? sourceDataSource.filter() : null
        );
        const group = typeof sourceDataSource.group === "function" ? sourceDataSource.group() : undefined;
        const aggregate = typeof sourceDataSource.aggregate === "function"
            ? sourceDataSource.aggregate()
            : undefined;

        const tempDataSource = new window.kendo.data.DataSource(options);
        const favorites = new Set(getCleanerProjectsFavoritesSet());
        if (!favorites.size) return [];

        const foundIds = new Set();
        const results = [];

        for (let page = 1; page <= totalPages; page += 1) {
            if (
                state.cleanerProjectsFavoritesOnlySnapshotRequestId !== requestId ||
                !state.cleanerProjectsFavoritesOnlyEnabled
            ) {
                return [];
            }

            await tempDataSource.query({
                page,
                pageSize,
                sort,
                filter,
                group,
                aggregate
            });

            const items = typeof tempDataSource.data === "function"
                ? Array.from(tempDataSource.data() || [])
                : [];

            for (const item of items) {
                const projectId = getCleanerProjectsProjectIdByDataItem(item, idFieldName);
                if (!projectId || !favorites.has(projectId) || foundIds.has(projectId)) {
                    continue;
                }

                foundIds.add(projectId);
                results.push(getCleanerProjectsPlainDataItem(item));
            }

            if (foundIds.size >= favorites.size) {
                break;
            }
        }

        return results;
    }

    function createCleanerProjectsFavoritesSnapshotDataSource(gridRoot, items, sourceDataSource) {
        if (!window.kendo || !window.kendo.data || typeof window.kendo.data.DataSource !== "function") {
            return null;
        }

        const sourceOptions = sourceDataSource && sourceDataSource.options ? sourceDataSource.options : {};
        const pageSize = getCleanerProjectsCurrentNumericPageSize(gridRoot, sourceDataSource);
        const schemaModel = sourceOptions && sourceOptions.schema ? sourceOptions.schema.model : null;

        const options = {
            data: Array.isArray(items) ? items : [],
            pageSize,
            serverPaging: false,
            serverFiltering: false,
            serverSorting: false,
            serverGrouping: false,
            serverAggregates: false
        };

        if (schemaModel) {
            options.schema = { model: schemaModel };
        }

        return new window.kendo.data.DataSource(options);
    }

    function clearCleanerProjectsFavoritesOnlySnapshotStateValues() {
        state.cleanerProjectsFavoritesOnlyOriginalDataSource = null;
        state.cleanerProjectsFavoritesOnlySnapshotLoading = false;
        state.cleanerProjectsFavoritesOnlySnapshotRevision = -1;
    }

    function restoreCleanerProjectsFavoritesOnlySnapshotState(gridRoot) {
        const hadSnapshotReference =
            Boolean(state.cleanerProjectsFavoritesOnlyOriginalDataSource) ||
            state.cleanerProjectsFavoritesOnlySnapshotLoading ||
            state.cleanerProjectsFavoritesOnlyStrategy === "snapshot";

        state.cleanerProjectsFavoritesOnlySnapshotRequestId += 1;

        if (!hadSnapshotReference) {
            clearCleanerProjectsFavoritesOnlySnapshotStateValues();
            return { changed: false };
        }

        const grid = getCleanerProjectsGridInstance(gridRoot);
        const originalDataSource = state.cleanerProjectsFavoritesOnlyOriginalDataSource;
        const shouldRestoreGrid =
            grid &&
            originalDataSource &&
            state.cleanerProjectsFavoritesOnlyStrategy === "snapshot";

        clearCleanerProjectsFavoritesOnlySnapshotStateValues();

        if (!shouldRestoreGrid) {
            return { changed: false };
        }

        grid.setDataSource(originalDataSource);
        return { changed: true };
    }

    function ensureCleanerProjectsFavoritesOnlySnapshotState(gridRoot) {
        const sourceDataSource = getCleanerProjectsSourceDataSourceForFavoritesOnly(gridRoot);
        const snapshotActive = state.cleanerProjectsFavoritesOnlyStrategy === "snapshot";
        const snapshotFresh =
            snapshotActive &&
            !state.cleanerProjectsFavoritesOnlySnapshotLoading &&
            state.cleanerProjectsFavoritesOnlySnapshotRevision === state.cleanerProjectsFavoritesRevision;

        if (!canUseCleanerProjectsFavoritesOnlySnapshotStrategy(gridRoot)) {
            return {
                supported: false,
                active: snapshotFresh,
                pending: state.cleanerProjectsFavoritesOnlySnapshotLoading,
                changed: false
            };
        }

        if (snapshotFresh) {
            return { supported: true, active: true, pending: false, changed: false };
        }

        if (state.cleanerProjectsFavoritesOnlySnapshotLoading) {
            return { supported: true, active: false, pending: true, changed: false };
        }

        if (!state.cleanerProjectsFavoritesOnlyOriginalDataSource) {
            state.cleanerProjectsFavoritesOnlyOriginalDataSource = sourceDataSource;
            state.cleanerProjectsFavoritesOnlyPreviousPageSize = getCleanerProjectsCurrentPageSizeValue(gridRoot);
            state.cleanerProjectsFavoritesOnlyPreviousPage = getCleanerProjectsCurrentPage(gridRoot);
        }

        const grid = getCleanerProjectsGridInstance(gridRoot);
        if (!grid) {
            return { supported: false, active: false, pending: false, changed: false };
        }

        state.cleanerProjectsFavoritesOnlySnapshotLoading = true;
        const requestId = state.cleanerProjectsFavoritesOnlySnapshotRequestId + 1;
        state.cleanerProjectsFavoritesOnlySnapshotRequestId = requestId;

        const originalDataSource = state.cleanerProjectsFavoritesOnlyOriginalDataSource;
        const targetRevision = state.cleanerProjectsFavoritesRevision;

        (async () => {
            try {
                const items = await collectCleanerProjectsFavoriteItemsFromAllPages(
                    gridRoot,
                    originalDataSource,
                    requestId
                );

                if (
                    state.cleanerProjectsFavoritesOnlySnapshotRequestId !== requestId ||
                    !state.cleanerProjectsFavoritesOnlyEnabled
                ) {
                    return;
                }

                const snapshotDataSource = createCleanerProjectsFavoritesSnapshotDataSource(
                    gridRoot,
                    items,
                    originalDataSource
                );
                if (!snapshotDataSource) {
                    return;
                }

                grid.setDataSource(snapshotDataSource);
                state.cleanerProjectsFavoritesOnlyStrategy = "snapshot";
                state.cleanerProjectsFavoritesOnlySnapshotRevision = targetRevision;
            } catch (e) {
                console.warn("[QGA] Не удалось собрать избранные проекты для отдельного dataSource:", e);
            } finally {
                if (state.cleanerProjectsFavoritesOnlySnapshotRequestId === requestId) {
                    state.cleanerProjectsFavoritesOnlySnapshotLoading = false;
                    if (
                        state.cleanerProjectsFavoritesOnlyEnabled &&
                        state.cleanerProjectsFavoritesOnlyStrategy !== "snapshot"
                    ) {
                        state.cleanerProjectsFavoritesOnlyStrategy = "none";
                    }
                }

                if (state.cleanerProjectsFavoritesOnlyEnabled) {
                    syncCleanerProjectsFavoritesUI();
                }
            }
        })();

        return { supported: true, active: false, pending: true, changed: false };
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

    function ensureCleanerProjectsFavoritesOnlyDomGridState(gridRoot) {
        if (!gridRoot) return { ensured: false, changed: false };
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

    function restoreCleanerProjectsFavoritesOnlyDomGridState(gridRoot) {
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

    function syncCleanerProjectsFavoritesOnlyFilterState(gridRoot) {
        if (!gridRoot) {
            state.cleanerProjectsFavoritesOnlyStrategy = "none";
            return { changed: false, strategy: "none" };
        }

        const pageBridgeResult = syncCleanerProjectsFavoritesOnlyViaPageBridge();
        if (pageBridgeResult.supported) {
            if (state.cleanerProjectsFavoritesOnlyAllModeActive) {
                const domRestoreResult = restoreCleanerProjectsFavoritesOnlyDomGridState(gridRoot);
                if (domRestoreResult.changed) {
                    return { changed: true, strategy: "page" };
                }
            }

            return {
                changed: false,
                strategy: pageBridgeResult.pending ? "dom" : "page"
            };
        }

        if (!state.cleanerProjectsFavoritesOnlyEnabled) {
            const dataSourceClearResult = clearCleanerProjectsFavoritesOnlyDataSourceState(gridRoot);
            const snapshotRestoreResult = restoreCleanerProjectsFavoritesOnlySnapshotState(gridRoot);
            if (dataSourceClearResult.changed || snapshotRestoreResult.changed) {
                state.cleanerProjectsFavoritesOnlyStrategy = "none";
                return { changed: true, strategy: "none" };
            }

            const domRestoreResult = restoreCleanerProjectsFavoritesOnlyDomGridState(gridRoot);
            state.cleanerProjectsFavoritesOnlyStrategy = "none";
            return { changed: domRestoreResult.changed, strategy: "none" };
        }

        if (
            state.cleanerProjectsFavoritesOnlyStrategy === "snapshot" ||
            state.cleanerProjectsFavoritesOnlySnapshotLoading ||
            state.cleanerProjectsFavoritesOnlyOriginalDataSource
        ) {
            const snapshotResult = ensureCleanerProjectsFavoritesOnlySnapshotState(gridRoot);
            if (snapshotResult.supported) {
                state.cleanerProjectsFavoritesOnlyStrategy = snapshotResult.active
                    ? "snapshot"
                    : state.cleanerProjectsFavoritesOnlyStrategy;
                return {
                    changed: snapshotResult.changed,
                    strategy: snapshotResult.active ? "snapshot" : "dom"
                };
            }

            const snapshotRestoreResult = restoreCleanerProjectsFavoritesOnlySnapshotState(gridRoot);
            if (snapshotRestoreResult.changed) {
                state.cleanerProjectsFavoritesOnlyStrategy = "none";
                return { changed: true, strategy: "none" };
            }
        }

        {
            const dataSourceResult = ensureCleanerProjectsFavoritesOnlyDataSourceState(gridRoot);
            if (dataSourceResult.supported) {
                state.cleanerProjectsFavoritesOnlyStrategy = "datasource";

                const snapshotRestoreResult = restoreCleanerProjectsFavoritesOnlySnapshotState(gridRoot);
                if (snapshotRestoreResult.changed) {
                    return { changed: true, strategy: "datasource" };
                }

                const domRestoreResult = restoreCleanerProjectsFavoritesOnlyDomGridState(gridRoot);
                if (domRestoreResult.changed) {
                    return { changed: true, strategy: "datasource" };
                }

                return { changed: dataSourceResult.changed, strategy: "datasource" };
            }

            if (dataSourceResult.changed) {
                state.cleanerProjectsFavoritesOnlyStrategy = "none";
                return { changed: true, strategy: "none" };
            }

            const snapshotRestoreResult = restoreCleanerProjectsFavoritesOnlySnapshotState(gridRoot);
            if (snapshotRestoreResult.changed) {
                state.cleanerProjectsFavoritesOnlyStrategy = "none";
                return { changed: true, strategy: "none" };
            }
        }

        const snapshotResult = ensureCleanerProjectsFavoritesOnlySnapshotState(gridRoot);
        if (snapshotResult.supported) {
            const domRestoreResult = restoreCleanerProjectsFavoritesOnlyDomGridState(gridRoot);
            if (domRestoreResult.changed) {
                return { changed: true, strategy: "dom" };
            }

            state.cleanerProjectsFavoritesOnlyStrategy = snapshotResult.active
                ? "snapshot"
                : state.cleanerProjectsFavoritesOnlyStrategy;

            return {
                changed: snapshotResult.changed,
                strategy: snapshotResult.active ? "snapshot" : "dom"
            };
        }

        const domResult = ensureCleanerProjectsFavoritesOnlyDomGridState(gridRoot);
        state.cleanerProjectsFavoritesOnlyStrategy = "dom";
        return { changed: domResult.changed, strategy: "dom" };
    }

    function applyCleanerProjectsFavoritesOnlyFilter() {
        const gridRoot = getCleanerProjectsGridRootForFavorites();
        if (!gridRoot) return;

        const filterState = syncCleanerProjectsFavoritesOnlyFilterState(gridRoot);
        if (filterState.changed) return;
        if (filterState.strategy !== "dom") {
            clearCleanerProjectsFavoritesOnlyHiddenRows(gridRoot);
            return;
        }

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
            state.cleanerProjectsFavoritesRevision += 1;
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

        const editLink = row.querySelector("a[href*='/Project/Edit/'], a[href*='/project/edit/']");
        if (editLink && editLink instanceof HTMLAnchorElement) {
            const rawHref = editLink.getAttribute("href") || editLink.href || "";
            const match = rawHref.match(/\/Project\/Edit\/(\d+)/i);
            if (match && match[1]) {
                return match[1];
            }

            const linkId = sanitizeCleanerProjectsPossibleId(rawHref);
            if (linkId) return linkId;
        }

        const anyLink = row.querySelector("a[href*='/project/'], a[href*='/Project/']");
        if (anyLink && anyLink instanceof HTMLAnchorElement) {
            const rawHref = anyLink.getAttribute("href") || anyLink.href || "";
            const linkId = sanitizeCleanerProjectsPossibleId(rawHref);
            if (linkId) return linkId;
        }

        const cells = row.querySelectorAll("td");
        if (!cells.length) return "";

        if (idColumnIndex < cells.length) {
            const idValue = sanitizeCleanerProjectsPossibleId(cells[idColumnIndex].textContent || "");
            if (idValue) return idValue;
        }

        // Резервный вариант: ищем номер внутри всей строки
        return sanitizeCleanerProjectsPossibleId(row.textContent || "");
    }

    function syncCleanerProjectsFavoritesUI() {
        const gridRoot = getCleanerProjectsGridRootForFavorites();
        if (!gridRoot) return;

        const filterState = syncCleanerProjectsFavoritesOnlyFilterState(gridRoot);
        if (filterState.changed) return;

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
            if (filterState.strategy === "dom" && state.cleanerProjectsFavoritesOnlyEnabled) {
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

                    if (state.cleanerProjectsFavoritesOnlyEnabled) {
                        applyCleanerProjectsFavoritesOnlyFilter();
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

