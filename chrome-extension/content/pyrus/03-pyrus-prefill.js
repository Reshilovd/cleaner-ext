"use strict";

    function buildCleanerAutoFillUrl(payload, options = {}) {
        const url = new URL("https://clr.env7.biz/lk");
        url.searchParams.set(CLEANER_AUTO_FILL_QUERY_KEY, "1");
        url.searchParams.set("_t", Date.now().toString());

        if (options.includePayload) {
            const serializedPayload = serializeProjectPayloadForQuery(payload);
            if (serializedPayload) {
                url.searchParams.set(PROJECT_PREFILL_QUERY_KEY, serializedPayload);
            }
        }

        return url.toString();
    }

    function serializeProjectPayloadForQuery(payload) {
        const normalizedPayload = normalizeTransferredProjectPayload(payload);
        if (!normalizedPayload) {
            return "";
        }

        try {
            return JSON.stringify(normalizedPayload);
        } catch (error) {
            console.warn("[QGA] Failed to serialize project payload for URL fallback:", error);
            return "";
        }
    }

    function readProjectPayloadFromQuery() {
        let raw = "";

        try {
            const url = new URL(window.location.href);
            raw = url.searchParams.get(PROJECT_PREFILL_QUERY_KEY) || "";
        } catch (error) {
            return null;
        }

        if (!raw) {
            return null;
        }

        try {
            return normalizeTransferredProjectPayload(JSON.parse(raw));
        } catch (error) {
            console.warn("[QGA] Failed to read project payload from URL fallback:", error);
            return null;
        }
    }

    function normalizeTransferredProjectPayload(payload) {
        if (!payload || typeof payload !== "object") {
            return null;
        }

        const normalized = {};
        const projectName = normalizeSingleLine(payload.projectName || "");
        const projectId = sanitizeProjectId(payload.projectId || "");
        const plan = sanitizePlan(payload.plan || "");
        const dbName = sanitizeDbName(payload.dbName || "");
        const notFoundByXPath = Array.isArray(payload.notFoundByXPath)
            ? Array.from(
                new Set(
                    payload.notFoundByXPath
                        .map((item) => normalizeSingleLine(item))
                        .filter(Boolean)
                )
            )
            : [];

        if (projectName) {
            normalized.projectName = projectName;
        }
        if (projectId) {
            normalized.projectId = projectId;
        }
        if (plan) {
            normalized.plan = plan;
        }
        if (dbName) {
            normalized.dbName = dbName;
        }
        if (notFoundByXPath.length > 0) {
            normalized.notFoundByXPath = notFoundByXPath;
        }

        return Object.keys(normalized).length > 0 ? normalized : null;
    }

    async function saveProjectPayload(payload) {
        saveProjectPayloadToLocalStorage(payload);

        const chromeStorageResult = await writeProjectPayloadToChromeStorage(payload);
        if (chromeStorageResult.ok) {
            return { ok: true, mode: "chrome_storage" };
        }

        if (chromeStorageResult.error) {
            console.warn(
                "[QGA] Failed to save project payload to chrome.storage, using URL fallback:",
                chromeStorageResult.error
            );
        }

        return { ok: true, mode: "url" };
    }

    function writeProjectPayloadToChromeStorage(payload) {
        const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
        if (!storage) {
            return Promise.resolve({ ok: false, error: "chrome.storage.local unavailable" });
        }

        return new Promise((resolve) => {
            try {
                storage.set({ [PROJECT_PREFILL_STORAGE_KEY]: payload }, () => {
                    const lastErrorMessage = getChromeRuntimeLastErrorMessage();
                    if (lastErrorMessage) {
                        resolve({ ok: false, error: lastErrorMessage });
                        return;
                    }

                    resolve({ ok: true });
                });
            } catch (error) {
                resolve({
                    ok: false,
                    error: String(error && error.message ? error.message : error)
                });
            }
        });
    }

    function readStoredProjectPayload() {
        const queryPayload = readProjectPayloadFromQuery();
        if (queryPayload) {
            saveProjectPayloadToLocalStorage(queryPayload);
            void writeProjectPayloadToChromeStorage(queryPayload);
            return Promise.resolve(queryPayload);
        }

        const fallbackPayload = readProjectPayloadFromLocalStorage();

        const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
        if (!storage) {
            return Promise.resolve(fallbackPayload);
        }

        return new Promise((resolve) => {
            try {
                storage.get(PROJECT_PREFILL_STORAGE_KEY, (result) => {
                    const lastErrorMessage = getChromeRuntimeLastErrorMessage();
                    if (lastErrorMessage) {
                        console.warn("[QGA] Failed to read project payload from chrome.storage:", lastErrorMessage);
                        resolve(fallbackPayload);
                        return;
                    }

                    if (!result || typeof result !== "object") {
                        resolve(fallbackPayload);
                        return;
                    }

                    const payload = result[PROJECT_PREFILL_STORAGE_KEY];
                    if (!payload || typeof payload !== "object") {
                        resolve(fallbackPayload);
                        return;
                    }

                    saveProjectPayloadToLocalStorage(payload);
                    resolve(payload);
                });
            } catch (error) {
                console.warn("[QGA] Failed to read project payload from chrome.storage, using localStorage fallback:", error);
                resolve(fallbackPayload);
            }
        });
    }

    function getChromeRuntimeLastErrorMessage() {
        try {
            if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError) {
                return chrome.runtime.lastError.message || "unknown runtime error";
            }
        } catch (error) {
            return String(error && error.message ? error.message : error);
        }
        return "";
    }

    function saveProjectPayloadToLocalStorage(payload) {
        if (!payload || typeof payload !== "object") {
            return;
        }

        const serialized = JSON.stringify(payload);
        if (!serialized) {
            return;
        }

        try {
            localStorage.setItem(PROJECT_PREFILL_STORAGE_FALLBACK_KEY, serialized);
            localStorage.setItem(PROJECT_PREFILL_STORAGE_KEY, serialized);
        } catch (error) {
            console.warn("[QGA] Failed to save project payload to localStorage fallback:", error);
        }
    }

    function readProjectPayloadFromLocalStorage() {
        const candidates = [
            PROJECT_PREFILL_STORAGE_KEY,
            PROJECT_PREFILL_STORAGE_FALLBACK_KEY
        ];

        for (const key of candidates) {
            let raw = null;
            try {
                raw = localStorage.getItem(key);
            } catch (error) {
                raw = null;
            }
            if (!raw) {
                continue;
            }

            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    return parsed;
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }
