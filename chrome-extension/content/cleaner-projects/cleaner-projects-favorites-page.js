"use strict";

(function() {
    const SYNC_EVENT = "qga-cleaner-projects-favorites-sync";
    const READY_EVENT = "qga-cleaner-projects-favorites-ready";
    const STATUS_EVENT = "qga-cleaner-projects-favorites-status";
    const FAVORITES_FILTER_TAG = "__qgaFavoritesOnly";
    const SEARCH_FILTER_TAG = "__qgaFavoritesOnlySearch";
    const BRIDGE_NODE_ID = "qga-cleaner-projects-favorites-bridge";

    if (window.__qgaCleanerProjectsFavoritesPageBridgeLoaded) {
        document.dispatchEvent(new CustomEvent(READY_EVENT));
        return;
    }
    window.__qgaCleanerProjectsFavoritesPageBridgeLoaded = true;

    const bridgeState = {
        strategy: "none",
        originalDataSource: null,
        originalPage: 1,
        requestId: 0,
        snapshotItems: [],
        snapshotCacheSignature: ""
    };

    function getBridgeNode() {
        let node = document.getElementById(BRIDGE_NODE_ID);
        if (node instanceof HTMLElement) {
            return node;
        }

        node = document.createElement("div");
        node.id = BRIDGE_NODE_ID;
        node.hidden = true;
        node.style.display = "none";
        (document.documentElement || document.body).appendChild(node);
        return node;
    }

    function emitStatus(extra) {
        const node = getBridgeNode();
        node.dataset.qgaPageReady = "1";
        node.dataset.qgaStrategy = bridgeState.strategy;
        node.dataset.qgaLoading = bridgeState.strategy === "snapshot_loading" ? "1" : "0";
        if (extra && typeof extra.total !== "undefined") {
            node.dataset.qgaTotal = String(extra.total);
        }
        if (extra && typeof extra.message === "string") {
            node.dataset.qgaMessage = extra.message;
        }

        document.dispatchEvent(new CustomEvent(STATUS_EVENT, {
            detail: {
                strategy: bridgeState.strategy,
                ...extra
            }
        }));
    }

    function getGridRoot() {
        return document.querySelector("#grid, [data-role='grid']");
    }

    function getGrid() {
        const gridRoot = getGridRoot();
        if (!gridRoot || typeof window.jQuery !== "function") return null;
        try {
            return window.jQuery(gridRoot).data("kendoGrid") || null;
        } catch (e) {
            return null;
        }
    }

    function getDataSource() {
        const grid = getGrid();
        return grid && grid.dataSource ? grid.dataSource : null;
    }

    function getSyncDetailFromBridgeNode() {
        const node = getBridgeNode();
        let favorites = [];
        try {
            const raw = node.dataset.qgaFavorites || "[]";
            const parsed = JSON.parse(raw);
            favorites = Array.isArray(parsed) ? parsed : [];
        } catch (e) {}

        return {
            enabled: node.dataset.qgaEnabled === "1",
            favorites,
            search: node.dataset.qgaSearch || ""
        };
    }

    function getIdFieldName(grid) {
        if (!grid || !grid.dataSource || !grid.dataSource.options) return "Id";

        const model = grid.dataSource.options.schema && grid.dataSource.options.schema.model;
        if (model && typeof model.id === "string" && model.id) {
            return model.id;
        }

        const columns = Array.isArray(grid.columns) ? grid.columns : [];
        const idColumn = columns.find((column) => column && typeof column.field === "string" && column.field === "Id");
        return idColumn && idColumn.field ? idColumn.field : "Id";
    }

    function sanitizeId(value) {
        const text = String(value == null ? "" : value).trim();
        if (!text) return "";
        const match = text.match(/\d+/);
        return match ? match[0] : "";
    }

    function normalizeSearchText(value) {
        return String(value == null ? "" : value)
            .toLowerCase()
            .replace(/ё/g, "е")
            .replace(/\s+/g, " ")
            .trim();
    }

    function cloneOptions(dataSource) {
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

    function isTaggedFilter(filter, tag) {
        return Boolean(filter && filter[tag] === true);
    }

    function isFavoritesFilter(filter) {
        return isTaggedFilter(filter, FAVORITES_FILTER_TAG);
    }

    function isSearchFilter(filter) {
        return isTaggedFilter(filter, SEARCH_FILTER_TAG);
    }

    function hasTaggedFilter(filter, tag) {
        if (!filter) return false;
        if (Array.isArray(filter)) return filter.some((entry) => hasTaggedFilter(entry, tag));
        if (isTaggedFilter(filter, tag)) return true;
        if (Array.isArray(filter.filters)) return filter.filters.some((entry) => hasTaggedFilter(entry, tag));
        return false;
    }

    function hasFavoritesFilter(filter) {
        return hasTaggedFilter(filter, FAVORITES_FILTER_TAG);
    }

    function hasSearchFilter(filter) {
        return hasTaggedFilter(filter, SEARCH_FILTER_TAG);
    }

    function stripTaggedFilter(filter, tag) {
        if (!filter) return null;
        if (Array.isArray(filter)) {
            const next = filter.map((entry) => stripTaggedFilter(entry, tag)).filter(Boolean);
            return next.length ? next : null;
        }
        if (isTaggedFilter(filter, tag)) return null;
        if (!Array.isArray(filter.filters)) return filter;

        const nextFilters = filter.filters.map((entry) => stripTaggedFilter(entry, tag)).filter(Boolean);
        if (!nextFilters.length) return null;
        if (nextFilters.length === 1) return nextFilters[0];

        return {
            ...filter,
            filters: nextFilters
        };
    }

    function stripFavoritesFilter(filter) {
        return stripTaggedFilter(filter, FAVORITES_FILTER_TAG);
    }

    function stripSearchFilter(filter) {
        return stripTaggedFilter(filter, SEARCH_FILTER_TAG);
    }

    function stripExtensionFilters(filter) {
        return stripSearchFilter(stripFavoritesFilter(filter));
    }

    function isProjectNameSearchFilter(filter, fieldName) {
        if (!fieldName || !filter || isSearchFilter(filter) || Array.isArray(filter)) {
            return false;
        }

        if (Array.isArray(filter.filters)) {
            return false;
        }

        if (filter.field !== fieldName) {
            return false;
        }

        return typeof filter.operator === "string";
    }

    function hasProjectNameSearchFilter(filter, fieldName) {
        if (!filter) return false;
        if (Array.isArray(filter)) return filter.some((entry) => hasProjectNameSearchFilter(entry, fieldName));
        if (isProjectNameSearchFilter(filter, fieldName)) return true;
        if (Array.isArray(filter.filters)) {
            return filter.filters.some((entry) => hasProjectNameSearchFilter(entry, fieldName));
        }
        return false;
    }

    function stripProjectNameSearchFilter(filter, fieldName) {
        if (!filter) return null;
        if (Array.isArray(filter)) {
            const next = filter
                .map((entry) => stripProjectNameSearchFilter(entry, fieldName))
                .filter(Boolean);
            return next.length ? next : null;
        }
        if (isProjectNameSearchFilter(filter, fieldName)) return null;
        if (!Array.isArray(filter.filters)) return filter;

        const nextFilters = filter.filters
            .map((entry) => stripProjectNameSearchFilter(entry, fieldName))
            .filter(Boolean);

        if (!nextFilters.length) return null;
        if (nextFilters.length === 1) return nextFilters[0];

        return {
            ...filter,
            filters: nextFilters
        };
    }

    function normalizeFilterValue(filter) {
        if (!filter) return null;
        if (!Array.isArray(filter)) return filter;
        if (filter.length === 0) return null;
        if (filter.length === 1) return filter[0];
        return {
            logic: "and",
            filters: filter
        };
    }

    function buildFavoritesFilter(fieldName, favoritesSet) {
        return {
            field: fieldName,
            operator: function(itemValue) {
                const id = sanitizeId(itemValue);
                return id ? favoritesSet.has(id) : false;
            },
            value: true,
            [FAVORITES_FILTER_TAG]: true
        };
    }

    function getProjectNameFieldName(grid, dataSource) {
        const columns = Array.isArray(grid && grid.columns) ? grid.columns : [];
        const exactColumn = columns.find((column) => column && column.field === "ProjectName");
        if (exactColumn && exactColumn.field) {
            return exactColumn.field;
        }

        const model = dataSource && dataSource.options && dataSource.options.schema
            ? dataSource.options.schema.model
            : null;
        const fields = model && model.fields && typeof model.fields === "object"
            ? Object.keys(model.fields)
            : [];

        if (fields.includes("ProjectName")) {
            return "ProjectName";
        }

        const candidate = fields.find((field) => /name/i.test(field));
        return candidate || "ProjectName";
    }

    function buildSearchFilter(fieldName, searchQuery) {
        const normalizedSearch = normalizeSearchText(searchQuery);
        if (!fieldName || !normalizedSearch) return null;

        return {
            field: fieldName,
            operator: function(itemValue) {
                return normalizeSearchText(itemValue).includes(normalizedSearch);
            },
            value: normalizedSearch,
            [SEARCH_FILTER_TAG]: true
        };
    }

    function mergeFilter(baseFilter, extraFilter) {
        const strippedBase = stripExtensionFilters(baseFilter);
        if (!extraFilter) return normalizeFilterValue(strippedBase);
        if (!strippedBase) return extraFilter;

        if (Array.isArray(strippedBase)) {
            return {
                logic: "and",
                filters: [...strippedBase, extraFilter]
            };
        }

        if (Array.isArray(strippedBase.filters) && (strippedBase.logic || "and") === "and") {
            return {
                ...strippedBase,
                filters: [...strippedBase.filters, extraFilter]
            };
        }

        return {
            logic: "and",
            filters: [strippedBase, extraFilter]
        };
    }

    function mergeFilters(baseFilter, extraFilters) {
        const normalizedFilters = Array.isArray(extraFilters)
            ? extraFilters.filter(Boolean)
            : [];
        let nextFilter = stripExtensionFilters(baseFilter);

        for (const extraFilter of normalizedFilters) {
            nextFilter = mergeFilter(nextFilter, extraFilter);
        }

        return normalizeFilterValue(nextFilter);
    }

    function restoreOriginalGrid() {
        const grid = getGrid();
        if (!grid || !bridgeState.originalDataSource) {
            bridgeState.strategy = "none";
            return false;
        }

        const currentDataSource = grid.dataSource;
        if (currentDataSource !== bridgeState.originalDataSource) {
            grid.setDataSource(bridgeState.originalDataSource);
        }

        if (typeof bridgeState.originalDataSource.page === "function") {
            bridgeState.originalDataSource.page(bridgeState.originalPage || 1);
        }

        bridgeState.strategy = "none";
        return true;
    }

    function clearExtensionFiltersFromOriginal() {
        const dataSource = bridgeState.originalDataSource || getDataSource();
        if (!dataSource || typeof dataSource.filter !== "function") return false;

        const currentFilter = dataSource.filter();
        if (!hasFavoritesFilter(currentFilter) && !hasSearchFilter(currentFilter)) return false;

        dataSource.filter(normalizeFilterValue(stripExtensionFilters(currentFilter)));
        return true;
    }

    function clearProjectNameSearchFilterFromOriginal(fieldName) {
        const dataSource = bridgeState.originalDataSource || getDataSource();
        if (!dataSource || typeof dataSource.filter !== "function" || !fieldName) return false;

        const currentFilter = dataSource.filter();
        if (!hasProjectNameSearchFilter(currentFilter, fieldName)) return false;

        dataSource.filter(normalizeFilterValue(stripProjectNameSearchFilter(currentFilter, fieldName)));
        return true;
    }

    function createSerializableFilter(filter) {
        if (!filter) return null;
        if (Array.isArray(filter)) {
            return filter.map((entry) => createSerializableFilter(entry)).filter(Boolean);
        }
        if (Array.isArray(filter.filters)) {
            return {
                logic: filter.logic || "and",
                filters: filter.filters.map((entry) => createSerializableFilter(entry)).filter(Boolean)
            };
        }

        return {
            field: filter.field || null,
            operator: typeof filter.operator === "string" ? filter.operator : null,
            value: typeof filter.value === "undefined" ? null : filter.value
        };
    }

    function createSnapshotCacheSignature(grid, dataSource, favoritesSet) {
        const favorites = Array.from(favoritesSet).sort((a, b) => String(a).localeCompare(String(b)));
        const nameFieldName = getProjectNameFieldName(grid, dataSource);
        const filter = typeof dataSource.filter === "function"
            ? normalizeFilterValue(
                stripProjectNameSearchFilter(
                    stripExtensionFilters(dataSource.filter()),
                    nameFieldName
                )
            )
            : null;

        return JSON.stringify({
            idField: getIdFieldName(grid),
            nameField: nameFieldName,
            total: typeof dataSource.total === "function" ? dataSource.total() : null,
            pageSize: typeof dataSource.pageSize === "function" ? dataSource.pageSize() : null,
            sort: typeof dataSource.sort === "function" ? dataSource.sort() : null,
            filter: createSerializableFilter(filter),
            group: typeof dataSource.group === "function" ? dataSource.group() : null,
            aggregate: typeof dataSource.aggregate === "function" ? dataSource.aggregate() : null,
            favorites
        });
    }

    function filterItemsByProjectName(items, fieldName, searchQuery) {
        const normalizedSearch = normalizeSearchText(searchQuery);
        if (!normalizedSearch) return Array.isArray(items) ? items.slice() : [];

        const sourceItems = Array.isArray(items) ? items : [];
        return sourceItems.filter((item) => {
            const value = item && typeof item === "object" ? item[fieldName] : "";
            return normalizeSearchText(value).includes(normalizedSearch);
        });
    }

    async function collectFavoritesSnapshotItems(grid, dataSource, favoritesSet, requestId) {
        const options = cloneOptions(dataSource);
        if (!options) return [];

        const tempDataSource = new window.kendo.data.DataSource(options);
        const total = typeof dataSource.total === "function" ? Number.parseInt(dataSource.total(), 10) : NaN;
        const pageSize = typeof dataSource.pageSize === "function" ? Number.parseInt(dataSource.pageSize(), 10) : NaN;
        if (!Number.isFinite(total) || !Number.isFinite(pageSize) || total < 1 || pageSize < 1) {
            return [];
        }

        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const fieldName = getIdFieldName(grid);
        const nameFieldName = getProjectNameFieldName(grid, dataSource);
        const sort = typeof dataSource.sort === "function" ? dataSource.sort() : undefined;
        const filter = normalizeFilterValue(
            stripProjectNameSearchFilter(
                stripExtensionFilters(typeof dataSource.filter === "function" ? dataSource.filter() : null),
                nameFieldName
            )
        );
        const group = typeof dataSource.group === "function" ? dataSource.group() : undefined;
        const aggregate = typeof dataSource.aggregate === "function" ? dataSource.aggregate() : undefined;

        const result = [];
        const foundIds = new Set();

        for (let page = 1; page <= totalPages; page += 1) {
            if (bridgeState.requestId !== requestId) {
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

            const items = Array.from(tempDataSource.data() || []);
            for (const item of items) {
                const json = item && typeof item.toJSON === "function" ? item.toJSON() : item;
                const id = sanitizeId(json && json[fieldName]);
                if (!id || !favoritesSet.has(id) || foundIds.has(id)) continue;

                foundIds.add(id);
                result.push(json);
            }

            if (foundIds.size >= favoritesSet.size) {
                break;
            }
        }

        return result;
    }

    function createSnapshotDataSource(grid, items, dataSource) {
        const options = {
            data: items,
            // В режиме only-favorites собираем все найденные элементы на одной странице.
            pageSize: Math.max(1, Array.isArray(items) ? items.length : 0),
            serverPaging: false,
            serverFiltering: false,
            serverSorting: false,
            serverGrouping: false,
            serverAggregates: false
        };

        const schemaModel = dataSource && dataSource.options && dataSource.options.schema
            ? dataSource.options.schema.model
            : null;
        if (schemaModel) {
            options.schema = { model: schemaModel };
        }

        return new window.kendo.data.DataSource(options);
    }

    function canUseLocalFilter(dataSource) {
        if (!dataSource || typeof dataSource.data !== "function" || typeof dataSource.total !== "function") {
            return false;
        }

        const dataLength = dataSource.data().length;
        const total = dataSource.total();
        return Number.isFinite(dataLength) && Number.isFinite(total) && dataLength >= total;
    }

    async function handleSync(detail) {
        const effectiveDetail = detail && typeof detail === "object"
            ? detail
            : getSyncDetailFromBridgeNode();

        const grid = getGrid();
        const dataSource = getDataSource();
        if (!grid || !dataSource) {
            emitStatus({ handled: false, reason: "grid_not_found" });
            return;
        }

        const enabled = Boolean(effectiveDetail && effectiveDetail.enabled);
        const favoritesSet = new Set(
            Array.isArray(effectiveDetail && effectiveDetail.favorites)
                ? effectiveDetail.favorites
                : []
        );
        const searchQuery = normalizeSearchText(effectiveDetail && effectiveDetail.search);

        if (!bridgeState.originalDataSource) {
            bridgeState.originalDataSource = dataSource;
            bridgeState.originalPage = typeof dataSource.page === "function" ? dataSource.page() : 1;
        }

        const nameFieldName = getProjectNameFieldName(grid, bridgeState.originalDataSource);

        if (!enabled) {
            bridgeState.requestId += 1;
            restoreOriginalGrid();
            clearExtensionFiltersFromOriginal();
            if (!searchQuery) {
                clearProjectNameSearchFilterFromOriginal(nameFieldName);
            }
            emitStatus({ handled: true, strategy: "none" });
            return;
        }

        if (canUseLocalFilter(bridgeState.originalDataSource)) {
            restoreOriginalGrid();
            const idFieldName = getIdFieldName(grid);
            const currentFilter = bridgeState.originalDataSource.filter
                ? stripProjectNameSearchFilter(bridgeState.originalDataSource.filter(), nameFieldName)
                : null;
            const nextFilter = mergeFilters(
                currentFilter,
                [
                    buildFavoritesFilter(idFieldName, favoritesSet),
                    buildSearchFilter(nameFieldName, searchQuery)
                ]
            );
            bridgeState.originalDataSource.filter(nextFilter);
            bridgeState.strategy = "datasource";
            emitStatus({ handled: true, strategy: "datasource" });
            return;
        }

        const snapshotCacheSignature = createSnapshotCacheSignature(
            grid,
            bridgeState.originalDataSource,
            favoritesSet
        );

        if (bridgeState.snapshotCacheSignature !== snapshotCacheSignature) {
            const requestId = bridgeState.requestId + 1;
            bridgeState.requestId = requestId;
            bridgeState.strategy = "snapshot_loading";
            emitStatus({ handled: true, strategy: "snapshot_loading" });

            const items = await collectFavoritesSnapshotItems(
                grid,
                bridgeState.originalDataSource,
                favoritesSet,
                requestId
            );

            if (bridgeState.requestId !== requestId) {
                return;
            }

            bridgeState.snapshotItems = Array.isArray(items) ? items : [];
            bridgeState.snapshotCacheSignature = snapshotCacheSignature;
        }

        const filteredItems = filterItemsByProjectName(
            bridgeState.snapshotItems,
            nameFieldName,
            searchQuery
        );
        const snapshotDataSource = createSnapshotDataSource(grid, filteredItems, bridgeState.originalDataSource);
        grid.setDataSource(snapshotDataSource);
        if (typeof snapshotDataSource.page === "function") {
            snapshotDataSource.page(1);
        }
        bridgeState.strategy = "snapshot";
        emitStatus({
            handled: true,
            strategy: "snapshot",
            total: filteredItems.length
        });
    }

    document.addEventListener(SYNC_EVENT, (event) => {
        const detail = event instanceof CustomEvent ? event.detail : null;
        Promise.resolve(handleSync(detail)).catch((error) => {
            emitStatus({
                handled: false,
                strategy: "error",
                message: String(error)
            });
        });
    });

    const bridgeNode = getBridgeNode();
    const bridgeObserver = new MutationObserver((mutations) => {
        const shouldSync = mutations.some((mutation) => mutation.attributeName === "data-qga-sync-seq");
        if (!shouldSync) return;

        Promise.resolve(handleSync(null)).catch((error) => {
            emitStatus({
                handled: false,
                strategy: "error",
                message: String(error)
            });
        });
    });
    bridgeObserver.observe(bridgeNode, { attributes: true });

    bridgeNode.dataset.qgaPageReady = "1";
    document.dispatchEvent(new CustomEvent(READY_EVENT));
})();
