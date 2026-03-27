(function () {
    if (window.__qgaProjectEditPenaltyPageBridgeInstalled === true) {
        return;
    }

    window.__qgaProjectEditPenaltyPageBridgeInstalled = true;

    const CHANNEL = "qga-project-edit-penalty";
    const GRID_SELECTOR = "#gridOpenEnds";
    const UPDATE_URL = "/lk/OpenEnds2/GroupUpdate";
    const PENALTY_ENTRY_ID = 1;
    const PENALTY_ENTRY_VALUE = "Penalty";

    window.addEventListener("message", (event) => {
        if (event.source !== window) {
            return;
        }

        const message = event.data;
        if (!message || message.source !== CHANNEL || message.direction !== "request") {
            return;
        }

        if (message.action === "toggle") {
            handleToggleRequest(message);
        }
    });

    async function handleToggleRequest(message) {
        const requestId = String(message && message.requestId || "").trim();
        const payload = message && message.payload && typeof message.payload === "object" ? message.payload : {};
        const rowUid = String(payload.rowUid || "").trim();
        const checked = payload.checked === true;

        try {
            if (!rowUid) {
                throw new Error("Penalty bridge rowUid is missing");
            }

            const gridRoot = document.querySelector(GRID_SELECTOR);
            const grid = getGrid(gridRoot);
            if (!grid) {
                throw new Error("Penalty bridge grid is unavailable");
            }

            const dataItem = getDataItemByRowUid(grid, rowUid);
            if (!dataItem) {
                throw new Error(`Penalty bridge dataItem is unavailable for rowUid ${rowUid}`);
            }

            const previousAutoCheckData = getAutoCheckEntries(dataItem);
            const previousAutoCheckString = getAutoCheckStringValue(dataItem);
            const previousChecked = getInitialState(dataItem);
            const nextAutoCheckData = buildNextAutoCheckData(previousAutoCheckData, checked);
            const nextAutoCheckString = buildRequestAutoCheckString(nextAutoCheckData);

            applyDataItemState(dataItem, nextAutoCheckData, nextAutoCheckString, checked);

            try {
                const response = await sendGroupUpdate(dataItem, nextAutoCheckData, nextAutoCheckString);
                const responseItem = getResponseItem(response, dataItem);
                if (responseItem) {
                    syncDataItemFromResponse(dataItem, responseItem);
                } else {
                    applyDataItemState(dataItem, nextAutoCheckData, nextAutoCheckString, checked);
                }

                const resolvedAutoCheckData = getAutoCheckEntries(dataItem);
                const resolvedAutoCheckString = getAutoCheckStringValue(dataItem);
                const resolvedChecked = getInitialState(dataItem);

                postResponse(requestId, true, {
                    checked: resolvedChecked,
                    autoCheckData: resolvedAutoCheckData,
                    autoCheckString: resolvedAutoCheckString
                });
            } catch (error) {
                applyDataItemState(dataItem, previousAutoCheckData, previousAutoCheckString, previousChecked);
                throw error;
            }
        } catch (error) {
            postResponse(requestId, false, null, serializeError(error));
        }
    }

    function postResponse(requestId, success, payload, error) {
        window.postMessage(
            {
                source: CHANNEL,
                direction: "response",
                requestId: requestId || "",
                success: success === true,
                payload: payload || null,
                error: error || null
            },
            "*"
        );
    }

    function serializeError(error) {
        if (!error) {
            return "Unknown penalty bridge error";
        }

        if (typeof error === "string") {
            return error;
        }

        if (typeof error.message === "string" && error.message) {
            return error.message;
        }

        return String(error);
    }

    function getGrid(gridRoot) {
        if (!(gridRoot instanceof HTMLElement)) {
            return null;
        }

        if (typeof window.jQuery === "function") {
            try {
                const grid = window.jQuery(gridRoot).data("kendoGrid");
                if (isGridLike(grid)) {
                    return grid;
                }
            } catch (error) {
            }
        }

        if (window.kendo && typeof window.kendo.widgetInstance === "function") {
            try {
                const grid = window.kendo.widgetInstance(gridRoot);
                if (isGridLike(grid)) {
                    return grid;
                }
            } catch (error) {
            }
        }

        return null;
    }

    function isGridLike(candidate) {
        return !!(
            candidate &&
            typeof candidate === "object" &&
            typeof candidate.dataItem === "function" &&
            candidate.dataSource &&
            typeof candidate.dataSource === "object"
        );
    }

    function getDataItemByRowUid(grid, rowUid) {
        if (!grid || !grid.dataSource || !rowUid) {
            return null;
        }

        if (typeof grid.dataSource.getByUid === "function") {
            try {
                const item = grid.dataSource.getByUid(rowUid);
                if (item) {
                    return item;
                }
            } catch (error) {
            }
        }

        return getDataSourceItems(grid.dataSource).find((item) => {
            return String(item && item.uid || "").trim() === rowUid;
        }) || null;
    }

    function getDataSourceItems(dataSource) {
        if (!dataSource || typeof dataSource !== "object") {
            return [];
        }

        try {
            if (typeof dataSource.data === "function") {
                return Array.from(dataSource.data() || []);
            }
        } catch (error) {
        }

        return Array.isArray(dataSource._data) ? dataSource._data.slice() : [];
    }

    function normalizeText(value) {
        return String(value == null ? "" : value)
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function getInitialState(dataItem) {
        if (!dataItem || typeof dataItem !== "object") {
            return false;
        }

        const autoCheckData = getAutoCheckEntries(dataItem);
        if (autoCheckData.some((entry) => isPenaltyAutoCheckEntry(entry))) {
            return true;
        }

        return normalizeText(dataItem.AutoCheckString).includes("penalty");
    }

    function getAutoCheckEntries(dataItem) {
        const rawEntries =
            dataItem && typeof dataItem === "object"
                ? Array.isArray(dataItem.AutoCheckData)
                    ? dataItem.AutoCheckData
                    : dataItem.AutoCheckData && typeof dataItem.AutoCheckData.toJSON === "function"
                        ? dataItem.AutoCheckData.toJSON()
                        : []
                : [];

        const normalizedEntries = rawEntries
            .map((entry) => normalizeAutoCheckEntry(entry))
            .filter((entry) => entry && entry.Value);

        if (normalizedEntries.length > 0) {
            return normalizedEntries;
        }

        return parseAutoCheckStringEntries(getAutoCheckStringValue(dataItem));
    }

    function getAutoCheckStringValue(dataItem) {
        return String(dataItem && dataItem.AutoCheckString != null ? dataItem.AutoCheckString : "").trim();
    }

    function normalizeAutoCheckEntry(entry) {
        if (!entry) {
            return null;
        }

        const numericId = Number(entry.Id != null ? entry.Id : entry.id);
        const value = String(entry.Value != null ? entry.Value : entry.value != null ? entry.value : "").trim();
        if (!value) {
            return null;
        }

        return {
            Id: Number.isFinite(numericId) ? numericId : 0,
            Value: value
        };
    }

    function parseAutoCheckStringEntries(value) {
        return String(value || "")
            .split(/[;,]/)
            .map((entryValue) => buildAutoCheckEntryFromValue(entryValue))
            .filter((entry) => entry && entry.Value);
    }

    function buildAutoCheckEntryFromValue(value) {
        const trimmedValue = String(value || "").trim();
        if (!trimmedValue) {
            return null;
        }

        const normalizedValue = normalizeText(trimmedValue);
        if (normalizedValue === normalizeText(PENALTY_ENTRY_VALUE)) {
            return {
                Id: PENALTY_ENTRY_ID,
                Value: PENALTY_ENTRY_VALUE
            };
        }

        if (normalizedValue === "brand") {
            return {
                Id: 2,
                Value: "Brand"
            };
        }

        return {
            Id: 0,
            Value: trimmedValue
        };
    }

    function isPenaltyAutoCheckEntry(entry) {
        const normalizedEntry = normalizeAutoCheckEntry(entry);
        if (!normalizedEntry) {
            return false;
        }

        return (
            normalizedEntry.Id === Number(PENALTY_ENTRY_ID) ||
            normalizeText(normalizedEntry.Value) === normalizeText(PENALTY_ENTRY_VALUE)
        );
    }

    function buildNextAutoCheckData(entries, includePenalty) {
        const nextEntries = Array.isArray(entries)
            ? entries
                .map((entry) => normalizeAutoCheckEntry(entry))
                .filter((entry) => entry && !isPenaltyAutoCheckEntry(entry))
            : [];

        if (includePenalty) {
            nextEntries.push({
                Id: Number(PENALTY_ENTRY_ID),
                Value: String(PENALTY_ENTRY_VALUE)
            });
        }

        return nextEntries.sort((left, right) => {
            const leftId = Number.isFinite(left && left.Id) ? left.Id : Number.MAX_SAFE_INTEGER;
            const rightId = Number.isFinite(right && right.Id) ? right.Id : Number.MAX_SAFE_INTEGER;
            if (leftId !== rightId) {
                return leftId - rightId;
            }

            return String(left && left.Value || "").localeCompare(String(right && right.Value || ""));
        });
    }

    function buildRequestAutoCheckString(entries) {
        if (!Array.isArray(entries) || entries.length !== 1) {
            return "";
        }

        return String(entries[0] && entries[0].Value || "").trim();
    }

    function applyDataItemState(dataItem, autoCheckData, autoCheckString, isChecked) {
        if (!dataItem || typeof dataItem !== "object") {
            return;
        }

        setDataItemField(
            dataItem,
            "AutoCheckData",
            autoCheckData.map((entry) => ({
                Id: entry.Id,
                Value: entry.Value
            }))
        );
        setDataItemField(dataItem, "AutoCheckString", autoCheckString);
        setDataItemField(dataItem, "QgaPenalty", isChecked === true);
    }

    function setDataItemField(dataItem, fieldName, value) {
        if (!dataItem || typeof dataItem !== "object" || !fieldName) {
            return;
        }

        if (typeof dataItem.set === "function") {
            try {
                dataItem.set(fieldName, value);
                return;
            } catch (error) {
            }
        }

        dataItem[fieldName] = value;
    }

    async function sendGroupUpdate(dataItem, autoCheckData, autoCheckString) {
        const payload = buildGroupUpdatePayload(dataItem, autoCheckData, autoCheckString);
        const response = await fetch(UPDATE_URL, {
            method: "POST",
            credentials: "include",
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest"
            },
            body: payload
        });

        const responseText = await response.text();
        const responseData = parseResponseText(responseText);
        if (!response.ok) {
            throw responseData || new Error(`Penalty bridge request failed with status ${response.status}`);
        }

        return responseData;
    }

    function parseResponseText(responseText) {
        const text = String(responseText || "").trim();
        if (!text) {
            return null;
        }

        try {
            return JSON.parse(text);
        } catch (error) {
            return text;
        }
    }

    function buildGroupUpdatePayload(dataItem, autoCheckData, autoCheckString) {
        const params = new URLSearchParams();
        const normalizedAutoCheckData = Array.isArray(autoCheckData) ? autoCheckData : [];
        const shouldSendAutoCheckData = normalizedAutoCheckData.length > 1;

        params.set("sort", "");
        params.set("group", "");
        params.set("filter", "");
        params.set("Id", stringifyPayloadValue(dataItem && dataItem.Id));
        params.set("Name", stringifyPayloadValue(dataItem && dataItem.Name));
        params.set("Label", stringifyPayloadValue(dataItem && dataItem.Label));
        params.set("Vars", stringifyPayloadValue(dataItem && dataItem.Vars));
        params.set("NotVerifiedCount", stringifyPayloadValue(dataItem && dataItem.NotVerifiedCount));
        params.set("NotVerifiedInterviewCount", stringifyPayloadValue(dataItem && dataItem.NotVerifiedInterviewCount));
        params.set("Order", stringifyPayloadValue(dataItem && dataItem.Order));
        params.set("IsCheck", stringifyBoolean(dataItem && dataItem.IsCheck));
        params.set("AutoCheckString", stringifyPayloadValue(autoCheckString));
        params.set("IsMultiCheck", stringifyBoolean(dataItem && dataItem.IsMultiCheck));
        params.set("BrandTagsString", stringifyPayloadValue(dataItem && dataItem.BrandTagsString));

        if (shouldSendAutoCheckData) {
            normalizedAutoCheckData.forEach((entry, index) => {
                params.set(`AutoCheckData[${index}].Id`, stringifyPayloadValue(entry && entry.Id));
                params.set(`AutoCheckData[${index}].Value`, stringifyPayloadValue(entry && entry.Value));
            });
        }

        getBrandTags(dataItem).forEach((entry, index) => {
            params.set(`BrandTags[${index}].id`, stringifyPayloadValue(entry && entry.id));
            params.set(`BrandTags[${index}].description`, stringifyPayloadValue(entry && entry.description));
        });

        return params.toString();
    }

    function getBrandTags(dataItem) {
        const rawTags =
            dataItem && typeof dataItem === "object"
                ? Array.isArray(dataItem.BrandTags)
                    ? dataItem.BrandTags
                    : dataItem.BrandTags && typeof dataItem.BrandTags.toJSON === "function"
                        ? dataItem.BrandTags.toJSON()
                        : []
                : [];

        return rawTags
            .map((entry) => {
                const id = entry && (entry.id != null ? entry.id : entry.Id);
                const description = entry && (entry.description != null ? entry.description : entry.Description);

                return {
                    id: id == null ? "" : id,
                    description: description == null ? "" : description
                };
            })
            .filter((entry) => entry.id !== "" || entry.description !== "");
    }

    function stringifyPayloadValue(value) {
        return value == null ? "" : String(value);
    }

    function stringifyBoolean(value) {
        return value === true || String(value).toLowerCase() === "true" ? "true" : "false";
    }

    function getResponseItem(response, dataItem) {
        const rows = response && Array.isArray(response.Data) ? response.Data : [];
        if (!rows.length) {
            return null;
        }

        const targetId = stringifyPayloadValue(dataItem && dataItem.Id);
        return rows.find((row) => stringifyPayloadValue(row && row.Id) === targetId) || rows[0] || null;
    }

    function syncDataItemFromResponse(dataItem, responseItem) {
        if (!dataItem || typeof dataItem !== "object" || !responseItem || typeof responseItem !== "object") {
            return;
        }

        [
            "Id",
            "Name",
            "Label",
            "Vars",
            "NotVerifiedCount",
            "NotVerifiedInterviewCount",
            "Order",
            "IsCheck",
            "IsMultiCheck"
        ].forEach((fieldName) => {
            if (Object.prototype.hasOwnProperty.call(responseItem, fieldName)) {
                setDataItemField(dataItem, fieldName, responseItem[fieldName]);
            }
        });

        setDataItemField(dataItem, "QgaPenalty", getInitialState(dataItem));
    }
})();
