"use strict";

var openEndsGroupsRefreshInterval =
    typeof openEndsGroupsRefreshInterval !== "undefined" ? openEndsGroupsRefreshInterval : null;
var openEndsGroupsRefreshObserver =
    typeof openEndsGroupsRefreshObserver !== "undefined" ? openEndsGroupsRefreshObserver : null;
var openEndsGroupsRefreshStopTimer =
    typeof openEndsGroupsRefreshStopTimer !== "undefined" ? openEndsGroupsRefreshStopTimer : null;
var openEndsGroupsRefreshDebounceTimer =
    typeof openEndsGroupsRefreshDebounceTimer !== "undefined" ? openEndsGroupsRefreshDebounceTimer : null;
var manualBfridsServerSyncTimer =
    typeof manualBfridsServerSyncTimer !== "undefined" ? manualBfridsServerSyncTimer : null;
var manualBfridsServerSyncInFlight =
    typeof manualBfridsServerSyncInFlight !== "undefined" ? manualBfridsServerSyncInFlight : null;
var MANUAL_BFRIDS_SERVER_SYNC_TTL_MS =
    typeof MANUAL_BFRIDS_SERVER_SYNC_TTL_MS !== "undefined" ? MANUAL_BFRIDS_SERVER_SYNC_TTL_MS : 30 * 1000;

    function getProjectIdForVerify() {
        const byId = document.getElementById("ProjectId");
        if (byId && "value" in byId && byId.value) {
            return byId.value;
        }

        const input = document.querySelector("input[name='ProjectId']");
        if (input && "value" in input && input.value) {
            return input.value;
        }

        return null;
    }

    /** ProjectId на странице редактирования проекта (/lk/Project/Edit/123). */
    function getProjectIdFromEditPage() {
        const path = (window.location.pathname || "").trim();
        const match = path.match(/\/lk\/project\/edit\/([^/]+)/i);
        return match && match[1] ? match[1] : null;
    }

    /** ID проекта для поиска сохранённых группировок: на странице проверки это ключ из localStorage (из URL Edit), а не ProjectId из формы. Ищем ссылку на /Project/Edit/ или путь. */
    function getProjectIdForGroupsLookup() {
        const path = (window.location.pathname || "").trim();
        let match = path.match(/\/lk\/project\/edit\/([^/]+)/i);
        if (match && match[1]) return match[1];
        const link = document.querySelector('a[href*="/Project/Edit/"], a[href*="/project/edit/"]');
        if (link && link.href) {
            match = link.href.match(/\/project\/edit\/([^/?#]+)/i);
            if (match && match[1]) return match[1];
        }
        return getProjectIdForVerify();
    }

    function loadOpenEndsGroups() {
        try {
            const raw = localStorage.getItem(OPENENDS_GROUPS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveOpenEndsGroups(allProjectsGroups) {
        try {
            localStorage.setItem(OPENENDS_GROUPS_STORAGE_KEY, JSON.stringify(allProjectsGroups || {}));
        } catch (e) {}
    }

    function clearScheduledOpenEndsGroupsRefresh() {
        if (openEndsGroupsRefreshInterval) {
            clearInterval(openEndsGroupsRefreshInterval);
            openEndsGroupsRefreshInterval = null;
        }

        if (openEndsGroupsRefreshStopTimer) {
            clearTimeout(openEndsGroupsRefreshStopTimer);
            openEndsGroupsRefreshStopTimer = null;
        }

        if (openEndsGroupsRefreshDebounceTimer) {
            clearTimeout(openEndsGroupsRefreshDebounceTimer);
            openEndsGroupsRefreshDebounceTimer = null;
        }

        if (openEndsGroupsRefreshObserver) {
            try {
                openEndsGroupsRefreshObserver.disconnect();
            } catch (error) {}
            openEndsGroupsRefreshObserver = null;
        }
    }

    function scheduleOpenEndsGroupsRefreshSync() {
        clearScheduledOpenEndsGroupsRefresh();

        if (!isOpenEndsHash()) {
            return;
        }

        const runCollect = () => {
            if (!isOpenEndsHash()) {
                clearScheduledOpenEndsGroupsRefresh();
                return;
            }

            collectOpenEndsGroupsFromPage();
        };

        runCollect();

        openEndsGroupsRefreshInterval = setInterval(runCollect, 1000);
        openEndsGroupsRefreshStopTimer = setTimeout(() => {
            clearScheduledOpenEndsGroupsRefresh();
        }, 7000);

        if (!document.body || typeof MutationObserver !== "function") {
            return;
        }

        openEndsGroupsRefreshObserver = new MutationObserver(() => {
            if (openEndsGroupsRefreshDebounceTimer) {
                clearTimeout(openEndsGroupsRefreshDebounceTimer);
            }

            openEndsGroupsRefreshDebounceTimer = setTimeout(() => {
                openEndsGroupsRefreshDebounceTimer = null;
                runCollect();
            }, 250);
        });

        openEndsGroupsRefreshObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function emitProjectEditStatsDirty(storageKey) {
        const key = String(storageKey || "").trim();
        if (
            !key ||
            typeof window === "undefined" ||
            typeof window.dispatchEvent !== "function" ||
            typeof CustomEvent !== "function"
        ) {
            return;
        }

        try {
            window.dispatchEvent(
                new CustomEvent(PROJECT_EDIT_STATS_DIRTY_EVENT_NAME, {
                    detail: { storageKey: key }
                })
            );
        } catch (error) {}
    }

    /** Собрать с текущей страницы (Project Edit #openEnds) список сгруппированных переменных из колонки «переменная» (Q1_1_other; Q1_2_other; …) и сохранить по projectId. */
    function collectOpenEndsGroupsFromPage() {
        if (!isOpenEndsHash()) return false;
        const projectId = getProjectIdFromEditPage();
        if (!projectId) return false;
        const root = document.querySelector("#divOpenEnds");
        if (!root) return false;
        const tbody = root.querySelector("#gridOpenEnds .k-grid-content tbody");
        if (!tbody) return false;
        const rows = tbody.querySelectorAll("tr.k-master-row");
        const variableSelector = state.settings.variableSelector || "td:nth-child(5)";
        const groupByCode = {};
        for (const row of rows) {
            const cell = row.querySelector(variableSelector);
            const text = (cell && (cell.textContent || cell.innerText || "").trim()) || "";
            const codes = parseVerifyVariableCodes(text);
            if (codes.length > 1) {
                for (const code of codes) {
                    groupByCode[code] = codes.slice();
                }
            }
        }
        const all = loadOpenEndsGroups();
        const previousGroups =
            all[projectId] && typeof all[projectId] === "object" ? all[projectId] : {};
        const previousSerialized = JSON.stringify(previousGroups);
        const nextSerialized = JSON.stringify(groupByCode);

        if (previousSerialized !== nextSerialized) {
            all[projectId] = groupByCode;
            saveOpenEndsGroups(all);
        }

        ensureManualGroupButtonHooked();
        return true;
    }

    function loadManualBfridsState() {
        try {
            const raw = localStorage.getItem(MANUAL_BFRIDS_STORAGE_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return {};
            }
            return parsed;
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать состояние bfrid для ручной чистки из localStorage:", error);
            return {};
        }
    }

    function saveManualBfridsState(stateObject) {
        const normalizedState =
            stateObject && typeof stateObject === "object" && !Array.isArray(stateObject) ? stateObject : {};
        manualBfridsState = normalizedState;
        try {
            localStorage.setItem(MANUAL_BFRIDS_STORAGE_KEY, JSON.stringify(normalizedState));
            emitProjectEditStatsDirty(MANUAL_BFRIDS_STORAGE_KEY);
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние bfrid для ручной чистки в localStorage:", error);
        }
    }

    function loadManualApiState() {
        try {
            const raw = localStorage.getItem(MANUAL_API_STATE_STORAGE_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return {};
            }
            return parsed;
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать состояние API ручной чистки из localStorage:", error);
            return {};
        }
    }

    function saveManualApiState(stateObject) {
        const normalizedState =
            stateObject && typeof stateObject === "object" && !Array.isArray(stateObject) ? stateObject : {};
        manualApiState = normalizedState;
        try {
            localStorage.setItem(MANUAL_API_STATE_STORAGE_KEY, JSON.stringify(normalizedState));
            emitProjectEditStatsDirty(MANUAL_API_STATE_STORAGE_KEY);
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние API ручной чистки в localStorage:", error);
        }
    }

    function getManualApiSyncedAt(projectId) {
        const key = String(projectId || "").trim();
        if (!key || !manualApiState || typeof manualApiState !== "object") {
            return 0;
        }
        const entry = manualApiState[key];
        const syncedAt = entry && Number(entry.syncedAt);
        return Number.isFinite(syncedAt) && syncedAt > 0 ? syncedAt : 0;
    }

    function setManualApiEntry(projectId, token, bfridsArray) {
        const key = String(projectId || "").trim();
        if (!key || !Array.isArray(bfridsArray)) {
            return false;
        }

        if (!manualApiState || typeof manualApiState !== "object" || Array.isArray(manualApiState)) {
            manualApiState = {};
        }

        const prev = manualApiState[key] && typeof manualApiState[key] === "object" ? manualApiState[key] : {};
        manualApiState[key] = {
            token: token || prev.token || "",
            bfrids: mergeManualBfridsLists([], bfridsArray).join("\n"),
            syncedAt: Date.now()
        };
        saveManualApiState(manualApiState);
        return true;
    }

    async function refreshManualBfridsStateForProject(projectId, options) {
        const key = String(projectId || "").trim();
        if (!key) {
            return false;
        }

        const force = !!(options && options.force);
        const ttlMs = Number.isFinite(options && options.ttlMs) ? Math.max(0, Number(options.ttlMs)) : MANUAL_BFRIDS_SERVER_SYNC_TTL_MS;
        const lastSyncedAt = getManualApiSyncedAt(key);
        if (!force && lastSyncedAt > 0 && Date.now() - lastSyncedAt < ttlMs) {
            return false;
        }

        if (manualBfridsServerSyncInFlight) {
            return await manualBfridsServerSyncInFlight;
        }

        manualBfridsServerSyncInFlight = (async () => {
            try {
                const snapshot = await loadActualManualStateSnapshot(key);
                const token = snapshot && typeof snapshot.token === "string" ? snapshot.token : "";
                const bfridsFromServer =
                    snapshot && snapshot.hasBfridsField
                        ? snapshot.bfrids.slice()
                        : await loadActualManualBfridsFromApi(key);

                if (!Array.isArray(bfridsFromServer)) {
                    return false;
                }

                setManualApiEntry(key, token, bfridsFromServer);
                return true;
            } catch (error) {
                console.warn("[QGA] Не удалось обновить manual bfrids с сервера:", error);
                return false;
            } finally {
                manualBfridsServerSyncInFlight = null;
            }
        })();

        return await manualBfridsServerSyncInFlight;
    }

    function setupManualBfridsServerSyncForVerifyMain(onSynced) {
        if (PAGE_KIND !== "openends_verify") {
            return;
        }

        const projectId = getProjectIdForVerify();
        if (!projectId) {
            return;
        }

        const runSync = async (force) => {
            const changed = await refreshManualBfridsStateForProject(projectId, { force: !!force });
            if (changed && typeof onSynced === "function") {
                onSynced();
            }
        };

        runSync(true);

        if (manualBfridsServerSyncTimer) {
            clearInterval(manualBfridsServerSyncTimer);
        }
        manualBfridsServerSyncTimer = setInterval(() => {
            runSync(false);
        }, MANUAL_BFRIDS_SERVER_SYNC_TTL_MS);

        if (!document.body || document.body.dataset.qgaManualBfridsSyncFocusBound === "1") {
            return;
        }
        document.body.dataset.qgaManualBfridsSyncFocusBound = "1";
        window.addEventListener("focus", () => {
            runSync(true);
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                runSync(true);
            }
        });
    }

    function loadRatingIncorrectIdsState() {
        try {
            const raw = localStorage.getItem(RATING_INCORRECT_IDS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать рейтинг некорректных ID из localStorage:", error);
            return {};
        }
    }

    function saveRatingIncorrectIdsState(stateObject) {
        const normalizedState =
            stateObject && typeof stateObject === "object" && !Array.isArray(stateObject) ? stateObject : {};
        ratingIncorrectIdsState = normalizedState;
        try {
            localStorage.setItem(RATING_INCORRECT_IDS_STORAGE_KEY, JSON.stringify(normalizedState));
            emitProjectEditStatsDirty(RATING_INCORRECT_IDS_STORAGE_KEY);
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить рейтинг некорректных ID в localStorage:", error);
        }
    }

    function loadVerifyIncorrectIdsState() {
        try {
            const raw = localStorage.getItem(VERIFY_INCORRECT_IDS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать локальные некорректные ID из localStorage:", error);
            return {};
        }
    }

    function saveVerifyIncorrectIdsState(stateObject) {
        const normalizedState =
            stateObject && typeof stateObject === "object" && !Array.isArray(stateObject) ? stateObject : {};
        verifyIncorrectIdsState = normalizedState;
        try {
            localStorage.setItem(VERIFY_INCORRECT_IDS_STORAGE_KEY, JSON.stringify(normalizedState));
            emitProjectEditStatsDirty(VERIFY_INCORRECT_IDS_STORAGE_KEY);
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить локальные некорректные ID в localStorage:", error);
        }
    }

    /** Множество ID, помеченных как некорректные (чекбокс + «Проверить страницу») по проекту. */
    function getVerifyIncorrectIdsSetForProject(projectId) {
        const set = new Set();
        if (!projectId) return set;
        const key = String(projectId);
        const arr = Array.isArray(verifyIncorrectIdsState[key]) ? verifyIncorrectIdsState[key] : [];
        arr.forEach((t) => {
            const s = String(t).trim();
            if (s) set.add(s);
        });
        return set;
    }

    /** Собирает ID со строк, где отмечен чекбокс «Некорректный», и сохраняет в локальное хранилище (вызывается перед verifyValues()). */
    function collectVerifyIncorrectIdsAndSave() {
        const projectId = getProjectIdForVerify();
        const gridRoot = document.querySelector("#grid, #gridOpenEnds");
        if (!projectId || !gridRoot || !state.verifyRespondentIndexLoaded) return;
        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        const collected = new Set();
        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            const { incorrect } = getVerifyRowIncorrectPostpone(gridRoot, row);
            if (!incorrect) continue;
            const ids = getRespondentIdsForVerifyRow(row);
            ids.forEach((id) => collected.add(String(id).trim()));
        }
        if (collected.size === 0) return;
        const key = String(projectId);
        const existing = Array.isArray(verifyIncorrectIdsState[key]) ? verifyIncorrectIdsState[key] : [];
        const merged = new Set([...existing.map((x) => String(x).trim()), ...collected].filter(Boolean));
        verifyIncorrectIdsState[key] = Array.from(merged);
        saveVerifyIncorrectIdsState(verifyIncorrectIdsState);
        console.info("[QGA] Локально сохранены некорректные ID (Проверить страницу), добавлено:", collected.size, "всего:", merged.size);
    }

    function addManualBfridsForProject(projectId, bfrids) {
        if (!projectId || !Array.isArray(bfrids) || bfrids.length === 0) {
            return;
        }
        const key = String(projectId);
        const currentPending = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        const merged = mergeManualBfridsLists(currentPending, bfrids);
        manualBfridsState[key] = merged.slice();
        saveManualBfridsState(manualBfridsState);
    }

    function consumeManualBfridsForProject(projectId) {
        if (!projectId) {
            return [];
        }
        const key = String(projectId);
        const current = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        if (!current.length) {
            return [];
        }
        delete manualBfridsState[key];
        saveManualBfridsState(manualBfridsState);
        return current.map((x) => String(x).trim()).filter(Boolean);
    }

    /** Множество ID респондентов, уже находящихся в ручной чистке по проекту (буфер + сохранённое поле Bfrids). */
    function getManualBfridsSetForProject(projectId) {
        const set = new Set();
        if (!projectId) {
            return set;
        }
        const key = String(projectId);
        const fromBuffer = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        for (const id of fromBuffer) {
            const n = String(id).trim();
            if (n) set.add(n);
        }
        const apiEntry = manualApiState && manualApiState[key];
        const bfridsStr = apiEntry && typeof apiEntry.bfrids === "string" ? apiEntry.bfrids : "";
        if (bfridsStr) {
            const fromApi = bfridsStr.split(/[\s,;]+/).map((x) => String(x).trim()).filter(Boolean);
            for (const id of fromApi) {
                set.add(id);
            }
        }
        return set;
    }

    function getManualBfridsListForProject(projectId) {
        if (!projectId) {
            return [];
        }
        const key = String(projectId);
        const apiEntry = manualApiState && manualApiState[key];
        const fromApi = parseManualBfridsValue(apiEntry && typeof apiEntry.bfrids === "string" ? apiEntry.bfrids : "");
        const fromBuffer = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        return mergeManualBfridsLists(fromApi, fromBuffer);
    }

    function mergeManualBfridsLists(existingIds, newIds) {
        const merged = [];
        const seen = new Set();

        const append = (ids) => {
            if (!Array.isArray(ids)) {
                return;
            }
            for (const id of ids) {
                const normalized = String(id).trim();
                if (!normalized || seen.has(normalized)) {
                    continue;
                }
                seen.add(normalized);
                merged.push(normalized);
            }
        };

        append(existingIds);
        append(newIds);

        return merged;
    }

    /** Есть ли сохранённый верификационный токен для ручной чистки по проекту (получен после открытия вкладки «Ручная чистка» и сохранения). */
    function hasVerificationTokenForProject(projectId) {
        if (!projectId) return false;
        const key = String(projectId);
        const entry = manualApiState && manualApiState[key];
        return !!(entry && typeof entry.token === "string" && entry.token.trim() !== "");
    }


    /**
     * Записывает один и тот же список bfrid в оба хранилища (manualBfridsState и manualApiState.bfrids),
     * чтобы кол-во и состав всегда совпадали.
     */
    function syncManualBfridsStores(projectId, bfridsArray) {
        if (!projectId || !Array.isArray(bfridsArray)) {
            return;
        }
        const key = String(projectId);
        const list = mergeManualBfridsLists([], bfridsArray);

        manualBfridsState[key] = list.slice();
        saveManualBfridsState(manualBfridsState);

        const prev =
            manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : {};
        manualApiState[key] = {
            token: prev.token || "",
            bfrids: list.join("\n")
        };
        saveManualApiState(manualApiState);
    }

    /**
     * Синхронизирует локальное хранилище (manualApiState и manualBfridsState)
     * с текущим содержимым поля ручной чистки (#Bfrids).
     * Вызывается только при явном сохранении формы.
     */
    function syncManualBfridsFromTextarea(projectId) {
        if (!projectId) {
            return;
        }
        const textarea = document.getElementById("Bfrids");
        if (!textarea) {
            return;
        }
        manualApiState = loadManualApiState();
        manualBfridsState = loadManualBfridsState();
        const idsInTextarea = parseManualBfridsValue(textarea.value || "");

        const key = String(projectId);

        const token = findVerificationTokenInDocument(document);
        const prev =
            manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : {};
        manualApiState[key] = {
            token: token || prev.token || "",
            bfrids: idsInTextarea.join("\n")
        };
        saveManualApiState(manualApiState);

        delete manualBfridsState[key];
        saveManualBfridsState(manualBfridsState);
        updateManualBfridsCounter(projectId, idsInTextarea);
    }

    function attachManualBfridsTextareaSync(projectId) {
        const textarea = document.getElementById("Bfrids");
        if (!textarea || !projectId) {
            return;
        }
        updateManualBfridsCounter(projectId, parseManualBfridsValue(textarea.value || ""));
        if (textarea.dataset.qgaBfridsSyncAttached === "1") {
            return;
        }
        textarea.dataset.qgaBfridsSyncAttached = "1";
        textarea.addEventListener("input", () => {
            updateManualBfridsCounter(projectId, parseManualBfridsValue(textarea.value || ""));
        });
    }

    function setupManualPageIntegration() {
        const projectId = getProjectIdForVerify();
        if (!projectId) {
            return;
        }

        const attach = () => {
            const button = document.getElementById("btnEditManual");
            if (!button) {
                return;
            }
            if (button.dataset.qgaManualBfridBound === "1") {
                attachManualBfridsTextareaSync(projectId);
                updateManualBfridsCounter(projectId);
                return;
            }
            button.dataset.qgaManualBfridBound = "1";

            button.addEventListener("click", () => {
                // Даём штатной логике editManual() переключить режим и показать textarea,
                // затем подставляем bfrid из буфера.
                setTimeout(() => {
                    try {
                        applyManualBfridsToTextarea(projectId);
                    } catch (error) {
                        console.error("[QGA] Ошибка при применении bfrid к ручной чистке:", error);
                    }
                }, 0);
            });
            attachManualBfridsTextareaSync(projectId);
            updateManualBfridsCounter(projectId);
        };

        attach();

        // Синхронизация в localStorage при нажатии «Сохранить» (отправка формы), даже если пользователь не вводил ничего в поле Bfrids
        if (!document.body.dataset.qgaManualSubmitSyncAttached) {
            document.body.dataset.qgaManualSubmitSyncAttached = "1";
            document.body.addEventListener("submit", (e) => {
                const form = e.target;
                if (!form || form.tagName !== "FORM") return;
                const textarea = form.querySelector("#Bfrids");
                if (!textarea) return;
                const pid = getProjectIdForVerify();
                if (!pid) return;
                syncManualBfridsFromTextarea(pid);
            }, true);
        }

        let manualAttachTimer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(manualAttachTimer);
            manualAttachTimer = setTimeout(attach, 200);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function applyManualBfridsToTextarea(projectId) {
        const textarea = document.getElementById("Bfrids");
        if (!textarea) {
            return;
        }

        const bfrids = consumeManualBfridsForProject(projectId);
        if (!bfrids.length) {
            return;
        }

        const mergedArray = mergeManualBfridsLists(parseManualBfridsValue(textarea.value || ""), bfrids);
        const merged = mergedArray.join("\n");
        textarea.value = merged;

        try {
            const key = String(projectId);
            manualBfridsState[key] = bfrids.slice();
            saveManualBfridsState(manualBfridsState);
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить pending-буфер ручной чистки:", error);
        }
        attachManualBfridsTextareaSync(projectId);
        updateManualBfridsCounter(projectId, mergedArray);
    }

    function parseManualBfridsValue(value) {
        return String(value || "")
            .split(/[\s,;]+/)
            .map((x) => String(x).trim())
            .filter(Boolean);
    }

    function countManualBfrids(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return 0;
        }
        return new Set(ids.map((id) => String(id).trim()).filter(Boolean)).size;
    }

    function getManualBfridsCounterHost() {
        return document.querySelector("#divManual > form > div > div.col-4 > div > div.row.c_table_header > div");
    }

    function ensureManualBfridsCounter() {
        const host = getManualBfridsCounterHost();
        if (!host) {
            return null;
        }

        let counter = host.querySelector("#qga-manual-bfrids-counter");
        if (counter) {
            return counter;
        }

        counter = document.createElement("span");
        counter.id = "qga-manual-bfrids-counter";
        counter.className = "qga-manual-bfrids-counter";
        counter.textContent = "0";
        host.appendChild(document.createTextNode(" "));
        host.appendChild(counter);
        return counter;
    }

    function updateManualBfridsCounter(projectId, idsOverride) {
        const counter = ensureManualBfridsCounter();
        if (!counter) {
            return;
        }

        const manualBfridsField = getManualBfridsFieldFromDocument(document);
        const ids = Array.isArray(idsOverride)
            ? idsOverride
            : manualBfridsField && "value" in manualBfridsField
                ? parseManualBfridsValue(manualBfridsField.value || "")
            : projectId
                ? getManualBfridsListForProject(projectId)
                : [];
        const count = countManualBfrids(ids);
        counter.textContent = String(count);
        counter.title = `ID в ручной чистке: ${count}`;
        counter.setAttribute("aria-label", `ID в ручной чистке: ${count}`);
    }

    function getManualBfridsFieldFromDocument(doc) {
        if (!doc || typeof doc.querySelector !== "function") {
            return null;
        }

        const selectors = [
            "#Bfrids",
            "textarea[name='Bfrids']",
            "input[name='Bfrids']"
        ];

        for (const selector of selectors) {
            const field = doc.querySelector(selector);
            if (field) {
                return field;
            }
        }

        return null;
    }

    function getManualStateSnapshotFromDocument(doc) {
        if (!doc || typeof doc.querySelector !== "function") {
            return null;
        }

        const bfridsField = getManualBfridsFieldFromDocument(doc);
        const verificationToken = findVerificationTokenInDocument(doc);
        if (!bfridsField && !verificationToken) {
            return null;
        }

        const rawValue =
            bfridsField && "value" in bfridsField
                ? bfridsField.value || ""
                : bfridsField
                    ? bfridsField.textContent || ""
                    : "";

        return {
            bfrids: parseManualBfridsValue(rawValue),
            hasBfridsField: !!bfridsField,
            token: verificationToken || ""
        };
    }

    function extractManualBfridsFromApiPayload(payload) {
        if (payload == null) {
            return null;
        }

        if (typeof payload === "string") {
            return parseManualBfridsValue(payload);
        }

        if (Array.isArray(payload)) {
            return payload
                .map((entry) => {
                    if (entry == null) {
                        return "";
                    }
                    if (typeof entry === "string" || typeof entry === "number") {
                        return String(entry).trim();
                    }
                    if (typeof entry === "object") {
                        const direct =
                            entry.Bfrid != null ? entry.Bfrid :
                            entry.bfrid != null ? entry.bfrid :
                            entry.Id != null ? entry.Id :
                            entry.id != null ? entry.id :
                            "";
                        return String(direct).trim();
                    }
                    return "";
                })
                .filter(Boolean);
        }

        if (typeof payload !== "object") {
            return null;
        }

        const directKeys = ["Bfrids", "bfrids", "ManualBfrids", "manualBfrids"];
        for (const key of directKeys) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
                return extractManualBfridsFromApiPayload(payload[key]);
            }
        }

        const nestedKeys = ["Data", "data", "Result", "result", "Model", "model"];
        for (const key of nestedKeys) {
            if (!Object.prototype.hasOwnProperty.call(payload, key)) {
                continue;
            }
            const nested = extractManualBfridsFromApiPayload(payload[key]);
            if (nested !== null) {
                return nested;
            }
        }

        return null;
    }

    async function loadActualManualBfridsFromApi(projectId) {
        const manualUrl = buildManualEditPostUrl(projectId);
        if (!manualUrl) {
            return null;
        }

        try {
            const response = await fetch(manualUrl, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Accept": "application/json,text/plain,text/html,*/*"
                }
            });

            if (!response.ok) {
                return null;
            }

            const contentType = String(response.headers.get("content-type") || "").toLowerCase();
            if (contentType.includes("json")) {
                const payload = await response.json();
                return extractManualBfridsFromApiPayload(payload);
            }

            const text = await response.text();
            if (!String(text || "").trim()) {
                return [];
            }

            const looksLikeHtml =
                contentType.includes("html") ||
                /<\s*html[\s>]/i.test(text) ||
                /<\s*form[\s>]/i.test(text);

            if (looksLikeHtml) {
                const parser = new DOMParser();
                const snapshot = getManualStateSnapshotFromDocument(parser.parseFromString(text, "text/html"));
                return snapshot && snapshot.hasBfridsField ? snapshot.bfrids.slice() : null;
            }

            return parseManualBfridsValue(text);
        } catch (error) {
            console.warn("[QGA] Не удалось загрузить текущий список bfrid через API:", error);
            return null;
        }
    }

    async function loadActualManualStateSnapshot(projectId) {
        if (!projectId) {
            return null;
        }

        const currentProjectId = getProjectIdFromEditPage();
        if (currentProjectId && String(currentProjectId) === String(projectId)) {
            const currentSnapshot = getManualStateSnapshotFromDocument(document);
            if (currentSnapshot && currentSnapshot.hasBfridsField) {
                return currentSnapshot;
            }
        }

        const manualPageUrl = buildManualEditPageUrl(projectId);
        if (!manualPageUrl) {
            return null;
        }

        try {
            const response = await fetch(manualPageUrl, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
            });

            if (!response.ok) {
                throw new Error(`Manual state snapshot request failed with status ${response.status}`);
            }

            const html = await response.text();
            if (!String(html || "").trim()) {
                return null;
            }

            const parser = new DOMParser();
            return getManualStateSnapshotFromDocument(parser.parseFromString(html, "text/html"));
        } catch (error) {
            console.warn("[QGA] Не удалось загрузить актуальное состояние ручной чистки:", error);
            return null;
        }
    }

    async function sendManualBfridsToServer(projectId, bfrids) {
        if (!projectId || !Array.isArray(bfrids) || bfrids.length === 0) {
            return;
        }

        const manualUrl = buildManualEditPostUrl(projectId);
        if (!manualUrl) {
            console.warn("[QGA] Не удалось определить URL для ручной чистки.");
            return;
        }

        const key = String(projectId);
        const stored =
            manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : null;
        const actualSnapshot = await loadActualManualStateSnapshot(projectId);
        const currentNewBfrids = mergeManualBfridsLists([], bfrids);
        const storedBfrids = parseManualBfridsValue(
            stored && typeof stored.bfrids === "string" ? stored.bfrids : ""
        );
        const storedBfridsBeforeCurrentAdd = storedBfrids.filter((id) => {
            return !currentNewBfrids.includes(String(id).trim());
        });
        const actualServerBfrids =
            actualSnapshot && actualSnapshot.hasBfridsField
                ? actualSnapshot.bfrids.slice()
                : await loadActualManualBfridsFromApi(projectId);
        const existingBfrids = Array.isArray(actualServerBfrids)
            ? mergeManualBfridsLists(actualServerBfrids, storedBfridsBeforeCurrentAdd)
            : storedBfridsBeforeCurrentAdd;

        let verificationToken =
            (actualSnapshot && typeof actualSnapshot.token === "string" ? actualSnapshot.token : "") ||
            (stored && typeof stored.token === "string" ? stored.token : "") ||
            findVerificationTokenInDocument(document);

        if (!Array.isArray(actualServerBfrids) && storedBfridsBeforeCurrentAdd.length === 0) {
            console.warn(
                "[QGA] Не удалось определить текущий список ручной чистки для проекта, отменяем отправку чтобы не перезаписать серверное состояние:",
                projectId
            );
            alert(
                "Не удалось прочитать текущий список ручной чистки. " +
                    "Чтобы не перезаписать уже добавленные ID, откройте вкладку «Ручная чистка» проекта, " +
                    "проверьте список и повторите попытку."
            );
            return;
        }

        if (!verificationToken) {
            console.warn(
                "[QGA] Не удалось найти __RequestVerificationToken для проекта",
                projectId
            );
            alert(
                "Не удалось найти токен для ручной чистки. " +
                    "Откройте вкладку «Ручная чистка» этого проекта хотя бы один раз, " +
                    "а затем попробуйте снова."
            );
            return;
        }

        const mergedArray = mergeManualBfridsLists(existingBfrids, currentNewBfrids);

        try {
            const postManualBfrids = async (bfridsArray, requestVerificationToken) => {
                const body = new URLSearchParams();
                body.set("ProjectId", String(projectId));
                body.set("Bfrids", mergeManualBfridsLists([], bfridsArray).join("\n"));
                body.set("__RequestVerificationToken", requestVerificationToken);

                const response = await fetch(manualUrl, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    body: body.toString()
                });

                if (!response.ok) {
                    throw new Error(`Manual cleanup save failed: ${response.status} ${response.statusText}`);
                }
            };

            const loadPersistedManualState = async (fallbackToken) => {
                const snapshot = await loadActualManualStateSnapshot(projectId);
                const refreshedBfrids =
                    snapshot && snapshot.hasBfridsField
                        ? snapshot.bfrids.slice()
                        : await loadActualManualBfridsFromApi(projectId);
                const normalizedRefreshedBfrids = Array.isArray(refreshedBfrids)
                    ? mergeManualBfridsLists([], refreshedBfrids)
                    : mergeManualBfridsLists([], existingBfrids);
                const confirmedIds = new Set(
                    Array.isArray(refreshedBfrids)
                        ? normalizedRefreshedBfrids
                        : []
                );
                const isCurrentAddConfirmed = currentNewBfrids.every((id) => confirmedIds.has(String(id).trim()));

                return {
                    token:
                        (snapshot && typeof snapshot.token === "string" ? snapshot.token : "") ||
                        fallbackToken ||
                        "",
                    bfrids: normalizedRefreshedBfrids,
                    isCurrentAddConfirmed
                };
            };

            await postManualBfrids(mergedArray, verificationToken);

            const persistedState = await loadPersistedManualState(verificationToken);
            const finalBfridsArray = persistedState.bfrids.slice();
            const finalToken = persistedState.token;
            const finalBfrids = finalBfridsArray.join("\n");

            try {
                const key = String(projectId);
                const prev =
                    manualApiState && typeof manualApiState[key] === "object"
                        ? manualApiState[key]
                        : {};
                manualApiState[key] = {
                    token: finalToken || verificationToken || prev.token || "",
                    bfrids: finalBfrids
                };
                saveManualApiState(manualApiState);
                delete manualBfridsState[key];
                saveManualBfridsState(manualBfridsState);
            } catch (updateError) {
                console.warn("[QGA] Не удалось обновить локальный снимок API ручной чистки:", updateError);
            }

            if (!persistedState.isCurrentAddConfirmed) {
                console.warn(
                    "[QGA] Сервер не подтвердил сохранение всех добавленных bfrid в ручной чистке:",
                    projectId,
                    currentNewBfrids
                );
            }

            console.info(
                "[QGA] Успешно обновлена ручная чистка через API для проекта",
                projectId,
                "кол-во новых bfrid:",
                bfrids.length
            );
        } catch (error) {
            console.error("[QGA] Ошибка при запросе сохранения ручной чистки:", error);
        }
    }

    function findVerificationTokenInDocument(doc) {
        if (!doc || typeof doc.querySelector !== "function") {
            return "";
        }

        const selectors = [
            "input[name='__RequestVerificationToken']",
            "input[name$='RequestVerificationToken']",
            "input[name*='RequestVerificationToken']"
        ];

        for (const selector of selectors) {
            const input = doc.querySelector(selector);
            if (input && "value" in input && input.value) {
                return String(input.value);
            }
        }

        return "";
    }

    function buildManualEditPostUrl(projectId) {
        if (!projectId) {
            return null;
        }
        const origin = window.location.origin || "";
        const base = origin.replace(/\/+$/, "");
        // POST /api/Project/Manual/{ProjectId} — как в стандартном запросе.
        return base + "/api/Project/Manual/" + encodeURIComponent(String(projectId));
    }

    function buildManualEditPageUrl(projectId) {
        const editProjectId =
            typeof getProjectIdForGroupsLookup === "function"
                ? getProjectIdForGroupsLookup()
                : null;
        const resolvedProjectId = editProjectId || projectId;

        if (!resolvedProjectId) {
            return null;
        }
        const origin = window.location.origin || "";
        const base = origin.replace(/\/+$/, "");
        return base + "/lk/Project/Edit/" + encodeURIComponent(String(resolvedProjectId));
    }
