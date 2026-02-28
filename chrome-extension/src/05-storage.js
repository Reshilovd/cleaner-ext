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
        const key = String(projectId);
        const current = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        const set = new Set(current.map((x) => String(x).trim()).filter(Boolean));
        for (const id of bfrids) {
            const normalized = String(id).trim();
            if (normalized) {
                set.add(normalized);
            }
        }
        manualBfridsState[key] = Array.from(set);
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

        const currentBuffer = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        if (currentBuffer.length > 0) {
            const textareaSet = new Set(idsInTextarea);
            const stillPresent = currentBuffer.filter((id) => textareaSet.has(String(id).trim()));
            if (stillPresent.length === 0) {
                delete manualBfridsState[key];
            } else {
                manualBfridsState[key] = stillPresent;
            }
            saveManualBfridsState(manualBfridsState);
        }
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

        const observer = new MutationObserver(() => {
            attach();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function applyManualBfridsToTextarea(projectId) {