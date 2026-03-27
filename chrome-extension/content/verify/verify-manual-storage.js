"use strict";

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

    /** Собрать с текущей страницы (Project Edit #openEnds) список сгруппированных переменных из колонки «переменная» (Q1_1_other; Q1_2_other; …) и сохранить по projectId. */
    function collectOpenEndsGroupsFromPage() {
        if (!isOpenEndsHash()) return;
        const projectId = getProjectIdFromEditPage();
        if (!projectId) return;
        const root = document.querySelector("#divOpenEnds");
        if (!root) return;
        const rows = root.querySelectorAll("#gridOpenEnds .k-grid-content tbody tr.k-master-row");
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
        all[projectId] = groupByCode;
        saveOpenEndsGroups(all);
        ensureManualGroupButtonHooked();
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
        try {
            localStorage.setItem(MANUAL_BFRIDS_STORAGE_KEY, JSON.stringify(stateObject || {}));
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
        try {
            localStorage.setItem(MANUAL_API_STATE_STORAGE_KEY, JSON.stringify(stateObject || {}));
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние API ручной чистки в localStorage:", error);
        }
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
        try {
            localStorage.setItem(RATING_INCORRECT_IDS_STORAGE_KEY, JSON.stringify(stateObject || {}));
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
        try {
            localStorage.setItem(VERIFY_INCORRECT_IDS_STORAGE_KEY, JSON.stringify(stateObject || {}));
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
        const merged = Array.from(getManualBfridsSetForProject(projectId));
        for (const id of bfrids) {
            const normalized = String(id).trim();
            if (normalized) {
                merged.push(normalized);
            }
        }
        const uniq = Array.from(new Set(merged));
        syncManualBfridsStores(projectId, uniq);
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
        const list = bfridsArray.map((x) => String(x).trim()).filter(Boolean);

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
     * Вызывается при ручном удалении/изменении айдишек в textarea.
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
        const raw = (textarea.value || "").trim();
        const idsInTextarea = raw
            .split(/[\s,;]+/)
            .map((x) => String(x).trim())
            .filter(Boolean);

        const key = String(projectId);

        const token = findVerificationTokenInDocument(document);
        const prev =
            manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : {};
        manualApiState[key] = {
            token: token || prev.token || "",
            bfrids: idsInTextarea.join("\n")
        };
        saveManualApiState(manualApiState);

        manualBfridsState[key] = idsInTextarea.slice();
        saveManualBfridsState(manualBfridsState);
    }

    function attachManualBfridsTextareaSync(projectId) {
        const textarea = document.getElementById("Bfrids");
        if (!textarea || !projectId || textarea.dataset.qgaBfridsSyncAttached === "1") {
            return;
        }
        textarea.dataset.qgaBfridsSyncAttached = "1";
        const sync = () => syncManualBfridsFromTextarea(projectId);
        textarea.addEventListener("input", sync);
        textarea.addEventListener("blur", sync);
        textarea.addEventListener("change", sync);
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

        const existingRaw = textarea.value || "";
        const existingSet = new Set(
            existingRaw
                .split(/[\s,;]+/)
                .map((x) => x.trim())
                .filter(Boolean)
        );

        for (const id of bfrids) {
            existingSet.add(String(id).trim());
        }

        const mergedArray = Array.from(existingSet);
        const merged = mergedArray.join("\n");
        textarea.value = merged;

        try {
            const token = findVerificationTokenInDocument(document);
            const key = String(projectId);
            const prev =
                manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : {};
            manualApiState[key] = {
                token: token || prev.token || "",
                bfrids: merged
            };
            saveManualApiState(manualApiState);
            manualBfridsState[key] = mergedArray.slice();
            saveManualBfridsState(manualBfridsState);
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние API ручной чистки:", error);
        }
        attachManualBfridsTextareaSync(projectId);
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

        const existingBfridsRaw =
            stored && typeof stored.bfrids === "string" ? stored.bfrids : "";

        let verificationToken =
            (stored && typeof stored.token === "string" ? stored.token : "") ||
            findVerificationTokenInDocument(document);

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

        const mergedSet = new Set(
            existingBfridsRaw
                .split(/[\s,;]+/)
                .map((x) => x.trim())
                .filter(Boolean)
        );

        for (const id of bfrids) {
            const normalized = String(id).trim();
            if (normalized) {
                mergedSet.add(normalized);
            }
        }

        const mergedBfrids = Array.from(mergedSet).join("\n");

        const body = new URLSearchParams();
        body.set("ProjectId", String(projectId));
        body.set("Bfrids", mergedBfrids);
        body.set("__RequestVerificationToken", verificationToken);

        try {
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
                console.error(
                    "[QGA] Не удалось сохранить данные ручной чистки через API:",
                    response.status,
                    response.statusText
                );
                return;
            }

            try {
                const key = String(projectId);
                const prev =
                    manualApiState && typeof manualApiState[key] === "object"
                        ? manualApiState[key]
                        : {};
                manualApiState[key] = {
                    token: verificationToken || prev.token || "",
                    bfrids: mergedBfrids
                };
                saveManualApiState(manualApiState);
                const mergedArray = mergedBfrids.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
                manualBfridsState[key] = mergedArray;
                saveManualBfridsState(manualBfridsState);
            } catch (updateError) {
                console.warn("[QGA] Не удалось обновить локальный снимок API ручной чистки:", updateError);
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
