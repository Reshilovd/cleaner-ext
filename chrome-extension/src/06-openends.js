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

        const merged = Array.from(existingSet).join("\n");
        textarea.value = merged;

        // Сохраняем актуальное состояние Bfrids и токен для этого проекта,
        // чтобы затем вызывать API с VerifyMain без дополнительных запросов.
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
            stored && typeof stored.token === "string" ? stored.token : "" ||
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

            // Успешно сохранили на сервере: обновляем локальный снимок,
            // чтобы в следующих запросах не затирать уже добавленные id
            // и не слать повторно одни и те же bfrid.
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

    function buildProjectEditUrl(projectId) {
        if (!projectId) {
            return null;
        }
        const origin = window.location.origin || "";
        const base = origin.replace(/\/+$/, "");
        // Страница редактирования проекта, где есть вкладка «Ручная чистка» и форма с токеном.
        return base + "/lk/Project/Edit/" + encodeURIComponent(String(projectId));
    }

    function parseOpenEndsFromXlsx(arrayBuffer) {
        if (!(arrayBuffer instanceof ArrayBuffer)) {
            return { ok: false, error: "Неверный формат данных при загрузке OpenEnds (ожидался ArrayBuffer)." };
        }

        if (typeof XLSX === "undefined" || typeof XLSX.read !== "function") {
            return {
                ok: false,
                error:
                    "Для разбора файла OpenEnds (XLSX) не найдена библиотека XLSX. " +
                    "Убедитесь, что на страницу подключён XLSX (например, xlsx.full.min.js) и доступен глобальный объект XLSX."
            };
        }

        let workbook = null;
        try {
            workbook = XLSX.read(arrayBuffer, { type: "array" });
        } catch (error) {
            console.error("[QGA] Ошибка XLSX.read при разборе OpenEnds:", error);
            return { ok: false, error: "Не удалось прочитать XLSX-файл OpenEnds (ошибка XLSX.read)." };
        }

        if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
            return { ok: false, error: "Файл OpenEnds не содержит листов или имеет некорректный формат." };
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            return { ok: false, error: "Не удалось найти первый лист в файле OpenEnds." };
        }

        let rows;
        try {
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        } catch (error) {
            console.error("[QGA] Ошибка XLSX.utils.sheet_to_json при разборе OpenEnds:", error);
            return { ok: false, error: "Не удалось преобразовать XLSX в строки (sheet_to_json)." };
        }

        if (!Array.isArray(rows) || rows.length < 2) {
            return { ok: false, error: "Выгрузка OpenEnds пуста или содержит только заголовок." };
        }

        const headerCells = rows[0].map((cell) => String(cell || "").trim());
        const headerNormalized = headerCells.map((cell) => cell.toLowerCase());
        console.info("[QGA] VerifyMain: заголовок OpenEnds XLSX:", headerCells);

        const respondentIndex = headerNormalized.findIndex((name) => {
            return name === "bfrid" || name.includes("respondent") || name.includes("респондент");
        });

        const questionIndex = headerNormalized.findIndex((name) => {
            return (
                name === "имя переменной" ||
                name === "variable" ||
                name.includes("question") ||
                name.includes("qcode") ||
                name.includes("var") ||
                name.includes("variable") ||
                name.includes("вопрос")
            );
        });

        const valueIndex = headerNormalized.findIndex((name) => {
            return (
                name === "значение" ||
                name === "value" ||
                name.includes("text") ||
                name.includes("answer") ||
                name.includes("ответ") ||
                name.includes("openend")
            );
        });

        if (respondentIndex === -1 || questionIndex === -1 || valueIndex === -1) {
            return {
                ok: false,
                error:
                    "Не удалось автоматически определить столбцы респондента/переменной/значения в выгрузке OpenEnds. " +
                    "Проверьте формат файла и, при необходимости, обновите логику парсинга в расширении."
            };
        }

        /** Один openEndId в выгрузке может соответствовать многим респондентам (один и тот же ответ у нескольких человек). */
        const respondentIdsByOpenEndId = new Map();
        const answersByRespondentId = new Map();
        const respondentIdsByQuestionAndValue = new Map();
        const respondentIdsByValueOnly = new Map();

        for (let i = 1; i < rows.length; i += 1) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            if (row.length === 0) {
                continue;
            }

            const respondentIdRaw = String(row[respondentIndex] || "").trim();
            if (!respondentIdRaw) {
                continue;
            }

            const respondentId = respondentIdRaw;
            const openEndIdCell = row.find((_, idx) => {
                const name = headerNormalized[idx];
                if (!name) {
                    return false;
                }
                return (
                    name === "id" ||
                    name === "openid" ||
                    name === "openend_id" ||
                    name.includes("openendid") ||
                    (name.endsWith("id") && name.includes("open"))
                );
            });
            const openEndId = openEndIdCell != null ? String(openEndIdCell).trim() || null : null;

            let question = "";
            let value = "";

            if (questionIndex >= 0 && questionIndex < row.length) {
                question = String(row[questionIndex] || "").trim();
            }
            if (valueIndex >= 0 && valueIndex < row.length) {
                value = String(row[valueIndex] || "").trim();
            }

            if (openEndId) {
                if (!respondentIdsByOpenEndId.has(openEndId)) {
                    respondentIdsByOpenEndId.set(openEndId, []);
                }
                respondentIdsByOpenEndId.get(openEndId).push(respondentId);
            }

            // Ключ только по полному коду переменной (Q1_1_other||значение). При сгруппированном вопросе поиск идёт по списку переменных из заголовка.
            if (question && value) {
                const fullKey = buildVerifyQuestionValueKey(question, value);
                if (!respondentIdsByOpenEndId.has(fullKey)) {
                    respondentIdsByOpenEndId.set(fullKey, []);
                }
                const fullArr = respondentIdsByOpenEndId.get(fullKey);
                if (!fullArr.includes(respondentId)) fullArr.push(respondentId);
            }

            if (!answersByRespondentId.has(respondentId)) {
                answersByRespondentId.set(respondentId, []);
            }

            answersByRespondentId.get(respondentId).push({
                openEndId,
                question,
                value
            });

            if (question && value) {
                const fullKey = buildVerifyQuestionValueKey(question, value);
                if (!respondentIdsByQuestionAndValue.has(fullKey)) {
                    respondentIdsByQuestionAndValue.set(fullKey, []);
                }
                respondentIdsByQuestionAndValue.get(fullKey).push(respondentId);
            }

            if (value) {
                const valueKey = buildVerifyValueOnlyKey(value);
                if (!respondentIdsByValueOnly.has(valueKey)) {
                    respondentIdsByValueOnly.set(valueKey, []);
                }
                respondentIdsByValueOnly.get(valueKey).push(respondentId);
            }
        }

        return {
            ok: true,
            respondentIdsByOpenEndId,
            answersByRespondentId,
            respondentIdsByQuestionAndValue,
            respondentIdsByValueOnly
        };
    }

    /**
     * Парсит Excel рейтинга (кнопка «Рейтинг»): колонки Token, ReasonCodes.
     * Некорректные ID — строки с ReasonCodes === 1.
     * Возвращает { ok: true, incorrectTokens: string[] } или { ok: false, error }.
     */
    function parseRatingXlsx(arrayBuffer) {
        if (!(arrayBuffer instanceof ArrayBuffer)) {
            return { ok: false, error: "Неверный формат данных (ожидался ArrayBuffer)." };
        }
        if (typeof XLSX === "undefined" || typeof XLSX.read !== "function") {
            return { ok: false, error: "Библиотека XLSX недоступна." };
        }
        let workbook;
        try {
            workbook = XLSX.read(arrayBuffer, { type: "array" });
        } catch (error) {
            console.warn("[QGA] Ошибка XLSX.read при разборе рейтинга:", error);
            return { ok: false, error: "Не удалось прочитать XLSX рейтинга." };
        }
        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
            return { ok: false, error: "Файл рейтинга пуст или некорректен." };
        }
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) return { ok: false, error: "Лист не найден." };
        let rows;
        try {
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        } catch (error) {
            return { ok: false, error: "Не удалось преобразовать лист рейтинга в данные." };
        }
        if (!Array.isArray(rows) || rows.length < 2) {
            return { ok: true, incorrectTokens: [] };
        }
        const headerCells = rows[0].map((cell) => String(cell || "").trim());
        const headerLower = headerCells.map((h) => h.toLowerCase());
        const tokenCol = headerLower.findIndex((h) => h === "token");
        const reasonCol = headerLower.findIndex((h) => h === "reasoncodes" || h === "reason codes");
        if (tokenCol === -1 || reasonCol === -1) {
            return { ok: false, error: "В рейтинге не найдены колонки Token или ReasonCodes." };
        }
        const incorrectTokens = [];
        for (let i = 1; i < rows.length; i += 1) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            const reason = row[reasonCol];
            const reasonNum = reason === 1 || reason === "1" || String(reason).trim() === "1";
            if (!reasonNum) continue;
            const token = String(row[tokenCol] || "").trim();
            if (token) incorrectTokens.push(token);
        }
        return { ok: true, incorrectTokens };
    }

    /** Множество Token (ID) с ReasonCodes=1 из рейтинга по проекту. */
    function getRatingIncorrectIdsSetForProject(projectId) {
        const set = new Set();
        if (!projectId) return set;
        const key = String(projectId);
        const arr = Array.isArray(ratingIncorrectIdsState[key]) ? ratingIncorrectIdsState[key] : [];
        arr.forEach((t) => {
            const s = String(t).trim();
            if (s) set.add(s);
        });
        return set;
    }

    /** Загружает Excel рейтинга по projectId (URL: /lk/Project/Ratings/{id}), парсит некорректные ID (ReasonCodes=1). */
    async function ensureRatingIncorrectIdsLoaded(projectId) {
        if (!projectId) return false;
        const key = String(projectId);
        const url = `/lk/Project/Ratings/${encodeURIComponent(key)}`;
        const referrerUrl = `${window.location.origin}/lk/Project/Edit/${encodeURIComponent(key)}`;
        const acceptHeader = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
        try {
            const response = await fetch(url, {
                credentials: "include",
                referrer: referrerUrl,
                referrerPolicy: "unsafe-url",
                headers: {
                    Accept: acceptHeader
                }
            });
            if (!response.ok) {
                console.warn("[QGA] Рейтинг: ответ сервера", response.status, response.statusText);
                return false;
            }
            const buffer = await response.arrayBuffer();
            const parsed = parseRatingXlsx(buffer);
            if (!parsed.ok) {
                console.warn("[QGA] Рейтинг: не удалось разобрать файл", parsed.error);
                return false;
            }
            ratingIncorrectIdsState[key] = parsed.incorrectTokens || [];
            saveRatingIncorrectIdsState(ratingIncorrectIdsState);
            console.info("[QGA] Рейтинг: загружены некорректные ID (ReasonCodes=1), кол-во:", (parsed.incorrectTokens || []).length);
            return true;
        } catch (e) {
            console.warn("[QGA] Рейтинг: ошибка загрузки", e);
            return false;
        }
    }

    function buildVerifyQuestionValueKey(questionCode, valueText) {
        const q = String(questionCode || "").trim();
        const v = String(valueText || "")
            .replace(/\s+/g, " ")
            .trim();
        return `${q}||${v}`;
    }

    function buildVerifyValueOnlyKey(valueText) {
        return String(valueText || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    /** Список переменных группы для questionCode. Сначала из данных, собранных на странице Project Edit #openEnds (ключ — ID из URL Edit); иначе из заголовка на странице проверки. */
    function getVerifyGroupedVariableCodes(questionCode) {
        const code = String(questionCode || "").trim();
        const projectKey = getProjectIdForGroupsLookup();
        if (projectKey && code) {
            const all = loadOpenEndsGroups();
            const projectGroups = all[projectKey];
            if (projectGroups && projectGroups[code] && Array.isArray(projectGroups[code]) && projectGroups[code].length > 1) {
                return projectGroups[code];
            }
        }
        const gridEl = document.querySelector("#grid, #gridOpenEnds");
        let text = "";
        if (gridEl) {
            const prev = gridEl.previousElementSibling;
            if (prev && prev.textContent) text = prev.textContent;
            if (!text && gridEl.parentElement) {
                const parentPrev = gridEl.parentElement.previousElementSibling;
                if (parentPrev && parentPrev.textContent) text = parentPrev.textContent;
            }
            if (!text && gridEl.parentElement) {
                const wrapper = gridEl.parentElement.closest("div");
                if (wrapper && wrapper.previousElementSibling && wrapper.previousElementSibling.textContent) {
                    text = wrapper.previousElementSibling.textContent;
                }
            }
        }
        const parts = text.split(";").map((s) => s.trim()).filter(Boolean);
        const variableCodes = parts
            .map((p) => {
                const m = p.match(/^(Q[0-9A-Za-z_.]+(_other)?)/);
                return m ? m[1] : "";
            })
            .filter(Boolean);
        return variableCodes.length > 1 ? variableCodes : [];
    }

    /** Есть ли на странице список переменных через «;» (Q1_1_other; Q1_2_other; …) — тогда вопрос сгруппирован. */
    function isVerifyQuestionGrouped(questionCode) {
        const code = String(questionCode || "").trim();
        if (!code) return false;
        const variableCodes = getVerifyGroupedVariableCodes(code);
        return variableCodes.length > 1 && variableCodes.includes(code);
    }

    /** Код вопроса для ключа: если не сгруппирован — целиком (Q1_3_other, Q13.1); при сгруппированном поиск идёт по списку переменных из заголовка. */
    function getVerifyQuestionBaseCode(questionCode) {
        return String(questionCode || "").trim();
    }

    function getVerifyQuestionCode() {
        if (typeof state.verifyQuestionCode === "string" && state.verifyQuestionCode) {
            return state.verifyQuestionCode;
        }

        let candidate = "";

        const headerNode = document.querySelector("#grid, #gridOpenEnds")?.previousElementSibling;
        const sources = [];
        if (headerNode && headerNode.textContent) {
            sources.push(headerNode.textContent);
        }
        const titleNode = document.querySelector("body");
        if (titleNode && titleNode.textContent) {
            sources.push(titleNode.textContent);
        }

        const combined = sources.join("\n");
        const match = combined.match(/(Q[0-9A-Za-z_.]+(?:_other)?)/);
        if (match && match[1]) {
            candidate = match[1];
        }

        state.verifyQuestionCode = candidate || null;
        return state.verifyQuestionCode;
    }

    function getVerifyQuestionElement() {
        const gridEl = document.querySelector("#grid, #gridOpenEnds");
        return gridEl ? gridEl.previousElementSibling : null;
    }

    function highlightVerifyQuestion(highlight) {
        const el = getVerifyQuestionElement();
        if (!el) return;
        if (highlight) {
            el.classList.add("qga-verify-question-highlight-incorrect");
        } else {
            el.classList.remove("qga-verify-question-highlight-incorrect");
        }
    }

    function showVerifyRespondentModal(respondentId, answers, context, rowState) {
        let modal = document.querySelector(".qga-verify-modal");
        if (!modal) {
            modal = document.createElement("aside");
            modal.className = "qga-verify-modal";
            modal.innerHTML = `
                <div class="qga-verify-modal__header">
                    <div class="qga-verify-modal__title"></div>
                    <button type="button" class="qga-verify-modal__close" aria-label="Закрыть">×</button>
                </div>
                <div class="qga-verify-modal__body">
                    <ul class="qga-verify-modal__list"></ul>
                    <div class="qga-verify-modal__footer"></div>
                </div>
            `;

            const closeButton = modal.querySelector(".qga-verify-modal__close");
            if (closeButton) {
                closeButton.addEventListener("click", () => {
                    modal.style.display = "none";
                    highlightVerifyQuestion(false);
                });
            }

            document.documentElement.appendChild(modal);
        }

        const titleNode = modal.querySelector(".qga-verify-modal__title");
        const listNode = modal.querySelector(".qga-verify-modal__list");
        const footerNode = modal.querySelector(".qga-verify-modal__footer");

        if (titleNode) {
            titleNode.textContent = String(respondentId);
        }

        const respondentIdStr = String(respondentId).trim();
        const projectIdForModal = getProjectIdForVerify();
        const verifyIncorrectSetForModal = projectIdForModal ? getVerifyIncorrectIdsSetForProject(projectIdForModal) : new Set();
        const ratingIncorrectSetForModal = projectIdForModal ? getRatingIncorrectIdsSetForProject(projectIdForModal) : new Set();
        const isIncorrectFromRating = verifyIncorrectSetForModal.has(respondentIdStr) || ratingIncorrectSetForModal.has(respondentIdStr);

        modal.classList.remove("qga-verify-modal--row-incorrect");
        if (isIncorrectFromRating) {
            modal.classList.add("qga-verify-modal--row-incorrect");
            highlightVerifyQuestion(true);
        }

        if (listNode) {
            listNode.innerHTML = "";

            if (!answers || answers.length === 0) {
                const empty = document.createElement("li");
                empty.className = "qga-verify-modal__item";
                empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                listNode.appendChild(empty);
            } else {
                for (const answer of answers) {
                    const item = document.createElement("li");
                    item.className = "qga-verify-modal__item";

                    const q = document.createElement("div");
                    q.className = "qga-verify-modal__q";
                    q.textContent = answer.question || `OpenEnd Id: ${answer.openEndId}`;

                    const text = document.createElement("div");
                    text.className = "qga-verify-modal__text";
                    text.textContent = answer.value || "";

                    item.appendChild(q);
                    item.appendChild(text);
                    listNode.appendChild(item);
                }
            }
        }

        manualBfridsState = loadManualBfridsState();
        manualApiState = loadManualApiState();
        const alreadyInManualSet = getManualBfridsSetForProject(projectIdForModal);
        const isAlreadyInManual = alreadyInManualSet.has(respondentIdStr);

        modal.classList.remove("qga-verify-modal--candidates");
        if (isAlreadyInManual) {
            modal.classList.add("qga-verify-modal--in-manual");
        } else {
            modal.classList.remove("qga-verify-modal--in-manual");
        }

        if (footerNode) {
            footerNode.innerHTML = "";
            const manualCheckbox = document.createElement("input");
            manualCheckbox.type = "checkbox";
            manualCheckbox.className = "qga-verify-modal-manual-checkbox";
            manualCheckbox.title = isAlreadyInManual
                ? "Уже в ручной чистке"
                : "Добавить в ручную чистку (по нажатию «Проверить страницу»)";
            manualCheckbox.dataset.respondentId = respondentIdStr;
            manualCheckbox.checked = isAlreadyInManual || state.verifyPendingManualBfrids.has(respondentIdStr);
            manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating;
            if (!isAlreadyInManual && !isIncorrectFromRating) {
                manualCheckbox.addEventListener("change", () => {
                    const id = manualCheckbox.dataset.respondentId;
                    if (!id) return;
                    if (manualCheckbox.checked) {
                        state.verifyPendingManualBfrids.add(id);
                    } else {
                        state.verifyPendingManualBfrids.delete(id);
                    }
                });
            }
            const manualLabel = document.createElement("label");
            manualLabel.className = "qga-verify-modal__footer-label";
            manualLabel.appendChild(manualCheckbox);
            manualLabel.appendChild(document.createTextNode(" В ручную чистку"));
            footerNode.appendChild(manualLabel);
        }

        modal.style.display = "flex";
        return context;
    }

    function showVerifyRespondentCandidates(respondentIds, answersMap, context, rowState) {
        let modal = document.querySelector(".qga-verify-modal");
        if (!modal) {
            modal = document.createElement("aside");
            modal.className = "qga-verify-modal";
            modal.innerHTML = `
                <div class="qga-verify-modal__header">
                    <div class="qga-verify-modal__title"></div>
                    <button type="button" class="qga-verify-modal__close" aria-label="Закрыть">×</button>
                </div>
                <div class="qga-verify-modal__body">
                    <ul class="qga-verify-modal__list"></ul>
                </div>
            `;

            const closeButton = modal.querySelector(".qga-verify-modal__close");
            if (closeButton) {
                closeButton.addEventListener("click", () => {
                    modal.style.display = "none";
                    highlightVerifyQuestion(false);
                });
            }

            document.documentElement.appendChild(modal);
        }

        const projectIdCandidates = getProjectIdForVerify();
        const verifyIncorrectSetCandidates = projectIdCandidates ? getVerifyIncorrectIdsSetForProject(projectIdCandidates) : new Set();
        const ratingIncorrectSetCandidates = projectIdCandidates ? getRatingIncorrectIdsSetForProject(projectIdCandidates) : new Set();
        const isIncorrectId = (id) => verifyIncorrectSetCandidates.has(String(id).trim()) || ratingIncorrectSetCandidates.has(String(id).trim());
        const hasAnyIncorrectFromRating = respondentIds.some(isIncorrectId);
        if (hasAnyIncorrectFromRating) {
            highlightVerifyQuestion(true);
        }

        modal.classList.remove("qga-verify-modal--in-manual");
        modal.classList.add("qga-verify-modal--candidates");

        const titleNode = modal.querySelector(".qga-verify-modal__title");
        const bodyNode = modal.querySelector(".qga-verify-modal__body");
        if (bodyNode) {
            bodyNode.innerHTML = "<ul class=\"qga-verify-modal__list\"></ul>";
        }
        const listNode = modal.querySelector(".qga-verify-modal__list");

        if (titleNode) {
            titleNode.textContent = "Респонденты с данным ответом";
        }

        if (listNode) {
            manualBfridsState = loadManualBfridsState();
            manualApiState = loadManualApiState();
            const alreadyInManualSet = getManualBfridsSetForProject(projectIdCandidates);

            for (const respondentId of respondentIds) {
                const answers =
                    answersMap.get(String(respondentId)) ||
                    answersMap.get(String(respondentId).trim()) ||
                    [];

                const respondentIdStr = String(respondentId).trim();
                const isAlreadyInManual = alreadyInManualSet.has(respondentIdStr);
                const isIncorrectFromRating = isIncorrectId(respondentIdStr);

                const headerItem = document.createElement("li");
                headerItem.className = "qga-verify-modal__item";
                if (isAlreadyInManual) {
                    headerItem.classList.add("qga-verify-modal__item--in-manual");
                }
                if (isIncorrectFromRating) {
                    headerItem.classList.add("qga-verify-modal__item--incorrect");
                }

                const header = document.createElement("div");
                header.className = "qga-verify-modal__q qga-verify-modal__respondent-header";
                header.style.display = "flex";
                header.style.alignItems = "center";
                header.style.gap = "8px";
                header.style.flexWrap = "wrap";

                const manualCheckbox = document.createElement("input");
                manualCheckbox.type = "checkbox";
                manualCheckbox.className = "qga-verify-modal-manual-checkbox";
                manualCheckbox.title = isAlreadyInManual
                    ? "Уже в ручной чистке"
                    : "Добавить в ручную чистку (по нажатию «Проверить страницу»)";
                manualCheckbox.dataset.respondentId = respondentIdStr;
                manualCheckbox.checked = isAlreadyInManual || state.verifyPendingManualBfrids.has(respondentIdStr);
                manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating;
                if (!isAlreadyInManual && !isIncorrectFromRating) {
                    manualCheckbox.addEventListener("change", () => {
                        const id = manualCheckbox.dataset.respondentId;
                        if (!id) return;
                        if (manualCheckbox.checked) {
                            state.verifyPendingManualBfrids.add(id);
                        } else {
                            state.verifyPendingManualBfrids.delete(id);
                        }
                    });
                }

                const idSpan = document.createElement("span");
                idSpan.textContent = `${respondentId}`;

                header.appendChild(idSpan);
                headerItem.appendChild(header);

                if (!answers || answers.length === 0) {
                    const empty = document.createElement("div");
                    empty.className = "qga-verify-modal__text";
                    empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                    headerItem.appendChild(empty);
                } else {
                    for (const answer of answers) {
                        const q = document.createElement("div");
                        q.className = "qga-verify-modal__q";
                        q.textContent = answer.question || `OpenEnd Id: ${answer.openEndId}`;

                        const text = document.createElement("div");
                        text.className = "qga-verify-modal__text";
                        text.textContent = answer.value || "";

                        headerItem.appendChild(q);
                        headerItem.appendChild(text);
                    }
                }

                const manualRow = document.createElement("div");
                manualRow.className = "qga-verify-modal__manual-row";
                manualRow.style.marginTop = "8px";
                manualRow.style.paddingTop = "8px";
                manualRow.style.borderTop = "1px solid #e5e7eb";
                manualRow.style.display = "flex";
                manualRow.style.alignItems = "center";
                manualRow.style.gap = "6px";
                manualRow.appendChild(manualCheckbox);
                manualRow.appendChild(document.createTextNode("В ручную чистку"));
                headerItem.appendChild(manualRow);

                listNode.appendChild(headerItem);
            }
        }

        modal.style.display = "flex";
        return context;
    }

    function decorateVerifyRows(gridRoot) {
        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        if (headerRow) {
            const headerCells = headerRow.querySelectorAll("th[role='columnheader']");
            const lastHeaderCell =
                headerCells[headerCells.length - 1] || headerRow.querySelector("th:last-child");

            if (!headerRow.querySelector(".qga-resp-header")) {
                const respHeader = document.createElement("th");
                respHeader.scope = "col";
                respHeader.role = "columnheader";
                respHeader.className = "k-header qga-resp-header";
                respHeader.style.textAlign = "center";
                respHeader.textContent = "Другие ответы";

                headerRow.appendChild(respHeader);
            }

            // Обновляем colgroup: добавляем колонку «Другие ответы» и сужаем «Отложить».
            const updateColgroup = (root) => {
                const colgroup = root ? root.querySelector("colgroup") : null;
                if (!colgroup) {
                    return;
                }
                if (colgroup.querySelector("col.qga-resp-col")) {
                    return;
                }
                const cols = colgroup.querySelectorAll("col");
                if (!cols.length) {
                    return;
                }
                const lastCol = cols[cols.length - 1];

                const respCol = document.createElement("col");
                respCol.className = "qga-resp-col";
                respCol.style.width = "170px";
                colgroup.appendChild(respCol);

                lastCol.style.width = "110px";
            };

            const headerWrap = gridRoot.querySelector(".k-grid-header-wrap");
            const contentWrap = gridRoot.querySelector(".k-grid-content");
            updateColgroup(headerWrap);
            updateColgroup(contentWrap);
        }

        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) {
                continue;
            }

            const cells = row.querySelectorAll("td[role='gridcell']");
            const lastCell =
                cells[cells.length - 1] ||
                row.querySelector("td:last-child") ||
                (row.lastElementChild instanceof HTMLTableCellElement ? row.lastElementChild : null);
            if (!lastCell) {
                continue;
            }

            // Добавляем колонку "Другие ответы" (кнопка «Посмотреть»).
            if (!row.querySelector("td.qga-resp-cell")) {
                const respCell = document.createElement("td");
                respCell.className = "qga-resp-cell qga-verify-cell";
                respCell.setAttribute("role", "gridcell");
                respCell.style.textAlign = "center";
                respCell.style.verticalAlign = "middle";
                respCell.style.padding = "0";

                const wrap = document.createElement("div");
                wrap.className = "qga-verify-cell-wrap";
                wrap.style.display = "flex";
                wrap.style.alignItems = "center";
                wrap.style.justifyContent = "center";
                wrap.style.width = "100%";
                wrap.style.height = "100%";

                const button = document.createElement("button");
                button.type = "button";
                button.className = "qga-verify-show-respondent";
                button.textContent = "Посмотреть";

                wrap.appendChild(button);
                respCell.appendChild(wrap);

                const afterLast = lastCell.nextSibling;
                row.insertBefore(respCell, afterLast || null);
            }

            setupVerifyRowExclusiveCheckboxes(gridRoot, row);
        }
        applyVerifyRowVisibility(gridRoot);
    }

    function setupVerifyRowExclusiveCheckboxes(gridRoot, row) {
        if (!gridRoot || !row || !(row instanceof HTMLTableRowElement)) {
            return;
        }
        if (row.dataset.qgaExclusiveCheckboxesBound === "1") {
            return;
        }
        row.dataset.qgaExclusiveCheckboxesBound = "1";

        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        const headerCells = headerRow
            ? headerRow.querySelectorAll("th[role='columnheader']")
            : null;

        let incorrectIndex = -1;
        let postponeIndex = -1;

        if (headerCells && headerCells.length) {
            for (let i = 0; i < headerCells.length; i += 1) {
                const text = (headerCells[i].textContent || "").trim().toLowerCase();
                if (incorrectIndex === -1 && text.includes("некоррект")) {
                    incorrectIndex = i;
                }
                if (postponeIndex === -1 && text.includes("отлож")) {
                    postponeIndex = i;
                }
            }
        }

        const cells = row.querySelectorAll("td[role='gridcell']");
        if (!cells.length) {
            return;
        }

        const incorrectCell =
            incorrectIndex >= 0 && incorrectIndex < cells.length ? cells[incorrectIndex] : null;
        const incorrectCheckbox = incorrectCell
            ? incorrectCell.querySelector("input[type='checkbox']")
            : null;

        const postponeCell =
            postponeIndex >= 0 && postponeIndex < cells.length ? cells[postponeIndex] : null;
        const postponeCheckbox = postponeCell
            ? postponeCell.querySelector("input[type='checkbox']")
            : null;

        const group = [incorrectCheckbox, postponeCheckbox].filter(
            (cb) => cb instanceof HTMLInputElement
        );
        if (group.length <= 1) {
            return;
        }

        const handleChange = (changed) => {
            if (!(changed instanceof HTMLInputElement)) {
                return;
            }
            const isChecked = !!changed.checked;
            if (!isChecked) {
                return;
            }
            for (const cb of group) {
                if (cb === changed) {
                    continue;
                }
                if (!(cb instanceof HTMLInputElement)) {
                    continue;
                }
                if (!cb.checked) {
                    continue;
                }
                cb.checked = false;
                cb.dispatchEvent(
                    new Event("change", {
                        bubbles: true
                    })
                );
            }
        };

        for (const cb of group) {
            if (!(cb instanceof HTMLInputElement)) {
                continue;
            }
            cb.addEventListener("change", () => handleChange(cb));
        }
    }
